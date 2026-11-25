/* ============================================================
   粉粉留言板 —— 公共脚本
   文件位置：WebRoot/js/board.js
   作用：1) 把头像编号(av1~av8)画成可爱的表情
         2) 登录/注册页选择头像、生成随机默认ID
         3) 留言的“三个点”菜单、评论/回复输入框的展开与收起
         4) 顶部操作提示的自动消失
   注意：全部是原生 JS，不依赖任何框架，直接抄就能跑
   ============================================================ */

/* ---------- 1. 头像编号 → 表情 的对照表 ---------- */
var AVATARS = {
	av1: "🐰",
	av2: "🐱",
	av3: "🐼",
	av4: "🦊",
	av5: "🐻",
	av6: "🐨",
	av7: "🐯",
	av8: "🦄"
};

/* ---------- 2. 把页面上所有 [data-avatar] 的元素画成头像 ---------- */
// 用法：JSP 里写 <span class="avatar" data-avatar="${msg.avatar}"></span>
//      脚本自动把 av3 变成"🐼 + 蓝色底"
function paintAvatars() {
	var nodes = document.querySelectorAll("[data-avatar]");   // 找出所有带头像标记的元素
	for (var i = 0; i < nodes.length; i++) {
		var el = nodes[i];
		var code = el.getAttribute("data-avatar");             // 取到编号，例如 av3
		if (!AVATARS[code]) {
			code = "av1";                                      // 编号不存在就用默认头像
		}
		// 先清掉旧的 av 类，避免换头像后颜色不更新
		el.className = el.className.replace(/\bav[0-9]\b/g, "").replace(/\s+/g, " ").trim();
		el.className = el.className + " " + code;               // 加上颜色类
		el.innerHTML = AVATARS[code];                           // 圆里放表情
	}
}

/* ---------- 3. 登录/注册页：点击小头像切换头像 ---------- */
function initAvatarPicker() {
	var hidden = document.getElementById("avatarInput");       // 真正提交给后台的隐藏域
	var preview = document.getElementById("avatarPreview");    // 大号预览头像
	var buttons = document.querySelectorAll(".avatar-picker button");
	if (!hidden || buttons.length === 0) {
		return;                                                // 这个页面没有头像选择器，直接跳过
	}
	// 先把 8 个按钮画上表情
	for (var i = 0; i < buttons.length; i++) {
		var code = buttons[i].getAttribute("data-pick");
		buttons[i].innerHTML = AVATARS[code] || "🐰";
		buttons[i].className = "avatar " + code;   // 同时带上 avatar 和编号类，才能拿到对应底色
	}
	// 默认选中隐藏域里已经有的那个头像
	var current = hidden.value || "av1";
	markActive(buttons, current);

	// 给每个按钮绑定点击事件
	for (var j = 0; j < buttons.length; j++) {
		buttons[j].onclick = function () {
			var code = this.getAttribute("data-pick");
			hidden.value = code;                               // 1) 隐藏域存下编号
			if (preview) {
				preview.className = "avatar avatar-lg " + code; // 2) 大图换颜色
				preview.innerHTML = AVATARS[code];              // 3) 大图换表情
			}
			markActive(buttons, code);                          // 4) 按钮加高亮圈
		};
	}
}

// 小工具：给选中的按钮加 active 类
function markActive(buttons, code) {
	for (var i = 0; i < buttons.length; i++) {
		if (buttons[i].getAttribute("data-pick") === code) {
			buttons[i].className = buttons[i].className + " active";
		} else {
			buttons[i].className = buttons[i].className.replace(" active", "");
		}
	}
}

/* ---------- 4. 注册页：生成 8 位随机默认ID（例如 ab6234ac） ---------- */
function makeUserNo() {
	var chars = "0123456789abcdef";
	var result = "";
	for (var i = 0; i < 8; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

function initUserNo() {
	var idText = document.getElementById("userNoText");        // 显示ID的胶囊
	var hidden = document.getElementById("userNoInput");       // 提交给后台的隐藏域
	var refresh = document.getElementById("refreshId");        // “换一个”按钮
	if (!idText || !hidden) {
		return;
	}
	// 如果后台已经把上次生成的ID带回来了（隐藏域里有值），就继续用它；
	// 否则新生成一个。这样注册失败重新填表时，ID 不会乱变。
	var no = hidden.value;
	if (!no || no.length === 0) {
		no = makeUserNo();
		hidden.value = no;
	}
	idText.innerHTML = "ID：" + no;

	if (refresh) {
		refresh.onclick = function () {                        // 点一下重新生成
			var next = makeUserNo();
			idText.innerHTML = "ID：" + next;
			hidden.value = next;
		};
	}
}

/* ---------- 5. 留言的“三个点”菜单 ---------- */
function initMenus() {
	// 点击三个点按钮 → 显示/隐藏它下面那个菜单
	document.addEventListener("click", function (e) {
		var btn = e.target.closest ? e.target.closest(".menu-btn") : null;
		if (btn) {
			var wrap = btn.parentNode;                          // .menu-wrap
			var list = wrap.querySelector(".menu-list");
			var isOpen = list.className.indexOf("open") > -1;
			closeAllMenus();                                    // 先关掉其它的
			if (!isOpen) {
				list.className = list.className + " open";
			}
			return;
		}
		// 点到菜单里面就不关（否则点“修改”时菜单先消失，体验很差）
		var inMenu = e.target.closest ? e.target.closest(".menu-list") : null;
		if (!inMenu) {
			closeAllMenus();
		}
	});
}

function closeAllMenus() {
	var lists = document.querySelectorAll(".menu-list.open");
	for (var i = 0; i < lists.length; i++) {
		lists[i].className = lists[i].className.replace(" open", "");
	}
}

/* ---------- 6. 评论 / 回复输入框的展开与收起 ---------- */
// 用法：按钮写 data-toggle="reply-12"，被控制的表单 id 就叫 reply-12
// 【2026-11-19 改造】加了一个可选参数 root：
//   · 不传 → 处理整个页面（window.onload 时用）
//   · 传某个容器 → 只处理这个容器里的按钮（Ajax 局部刷新列表后用，给新节点补绑事件）
function initToggles(root) {
	var scope = root || document;
	var buttons = scope.querySelectorAll("[data-toggle]");
	for (var i = 0; i < buttons.length; i++) {
		buttons[i].onclick = function () {
			var targetId = this.getAttribute("data-toggle");
			var box = document.getElementById(targetId);
			if (!box) {
				return;
			}
			var opened = box.className.indexOf("open") > -1;
			box.className = opened ? box.className.replace(" open", "") : box.className + " open";
			if (!opened) {
				// 展开后自动把光标放进输入框，体验更顺
				var input = box.querySelector("input[type=text]");
				if (input) {
					input.focus();
				}
				// 输入框可能在屏幕外面，滚动到可视区域中间，省得用户自己找
				try {
					box.scrollIntoView({ block: "center", behavior: "smooth" });
				} catch (err) {
					/* 老浏览器不支持参数，忽略即可，不影响功能 */
				}
			}
		};
	}
}

/* ---------- 7. 顶部提示条：显示 2.6 秒后自动淡出 ---------- */
function initToast() {
	var toast = document.getElementById("toast");
	if (!toast || !toast.innerHTML || toast.innerHTML.trim() === "") {
		return;
	}
	toast.className = toast.className + " show";
	setTimeout(function () {
		toast.className = toast.className.replace(" show", "");
	}, 2600);
}

/* ---------- 8. 留言板右上角：点头像弹出换头像面板 ---------- */
function initAvatarPop() {
	var trigger = document.getElementById("avatarTrigger");   // 顶部那个小头像按钮
	var pop = document.getElementById("avatarPop");           // 弹出的面板
	if (!trigger || !pop) {
		return;                                               // 不是留言板页面就跳过
	}
	trigger.onclick = function (e) {
		e.stopPropagation();                                  // 阻止冒泡，否则下面的 document 点击会立刻把它关掉
		pop.className = pop.className.indexOf("open") > -1 ? pop.className.replace(" open", "") : pop.className + " open";
	};
	// 点面板以外的空白处就收起
	document.addEventListener("click", function (e) {
		var inside = e.target.closest ? e.target.closest("#avatarPop") : null;
		if (!inside) {
			pop.className = pop.className.replace(" open", "");
		}
	});
}

/* ============================================================
   10. Ajax 小工具
   ------------------------------------------------------------
   为什么不用 jQuery？因为项目里没有引入 jQuery，
   原生 XMLHttpRequest 就足够发一个简单的 POST/GET 了，
   这样零依赖，答辩时也不怕老师说“你多引了个库”。
   ============================================================ */

/**
 * 发一个 POST 请求，并把服务器返回的 JSON 解析成对象
 * @param url      请求地址，例如 "LikeServlet"
 * @param body     请求体，例如 "message_id=3"（要用 encodeURIComponent 编码）
 * @param callback 回调：callback(是否成功拿到JSON, 数据对象)
 */
function ajaxPost(url, body, callback) {
	var xhr = new XMLHttpRequest();                       // 1) 创建请求对象
	xhr.open("POST", url, true);                          // 2) 打开连接（true = 异步）
	// 3) 告诉服务器：我传的是普通表单格式
	xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
	// 4) 打上 Ajax 标记，后端据此决定返回 JSON 还是重定向
	xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
	// 5) 请求状态变化时回调
	xhr.onreadystatechange = function () {
		if (xhr.readyState !== 4) {                       // 4 表示请求完成
			return;
		}
		if (xhr.status !== 200) {                         // 不是 200 就当失败
			callback(false, null);
			return;
		}
		var data = null;
		try {
			data = JSON.parse(xhr.responseText);          // 把 JSON 字符串变成 JS 对象
		} catch (e) {
			data = null;                                  // 解析失败（后端出错时可能返回 HTML）
		}
		callback(!!data, data || {});
	};
	xhr.send(body);                                       // 6) 真正发出去
}

/**
 * 发一个 GET 请求（盲盒接口用这个，因为查询数据用 GET 更语义化）
 */
function ajaxGet(url, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
	xhr.onreadystatechange = function () {
		if (xhr.readyState !== 4) {
			return;
		}
		if (xhr.status !== 200) {
			callback(false, null);
			return;
		}
		var data = null;
		try {
			data = JSON.parse(xhr.responseText);
		} catch (e) {
			data = null;
		}
		callback(!!data, data || {});
	};
	xhr.send(null);
}

/* ============================================================
   11. Ajax 无刷新点赞
   ------------------------------------------------------------
   页面上所有带 data-like 的按钮都会被绑定：
   · data-like="message" → 请求 LikeServlet
   · data-like="comment" → 请求 LikeCommentServlet
   服务器返回 {"success":true,"liked":true,"count":5} 后，
   我们只改按钮里的图标和数字，页面不刷新。
   ============================================================ */

// 把“点赞状态 + 赞数”应用到按钮上（点赞和取消点赞都走这里）
function applyLikeState(btn, liked, count) {
	// 1) 把最新状态记回 data 属性，方便下次点击/调试查看
	btn.setAttribute("data-liked", liked ? "true" : "false");
	btn.setAttribute("data-count", count);

	// 2) 换图标：点过是红心，没点过是空心
	var ico = btn.querySelector(".ico");
	if (ico) {
		ico.innerHTML = liked ? "❤️" : "🤍";
	}

	// 3) 换数字
	var num = btn.querySelector(".num");
	if (num) {
		num.innerHTML = count;
	}

	// 4) 换颜色：给按钮加/去掉 liked 类（CSS 里 .liked 是粉红色）
	if (liked) {
		if (btn.className.indexOf("liked") < 0) {
			btn.className = btn.className + " liked";
		}
	} else {
		btn.className = btn.className.replace(/\bliked\b/g, "").replace(/\s+/g, " ");
	}

	// 5) 播放一次“心跳”动画：先去掉 pop 再重新加上，
	//    中间的 offsetWidth 是让浏览器强制重排，否则连续点击动画不会重放
	btn.className = btn.className.replace(/\bpop\b/g, "").replace(/\s+/g, " ");
	void btn.offsetWidth;
	btn.className = btn.className + " pop";
	setTimeout(function () {
		btn.className = btn.className.replace(/\bpop\b/g, "").replace(/\s+/g, " ");
	}, 450);
}

// 给页面上所有点赞按钮绑定点击事件
// 【2026-11-19 改造】加可选参数 root：
//   · 不传 → 全页面（首次加载）
//   · 传容器 → 只给容器里的新按钮绑事件（Ajax 局部刷新列表后调用）
function initAjaxLikes(root) {
	var scope = root || document;
	var buttons = scope.querySelectorAll("[data-like]");
	for (var i = 0; i < buttons.length; i++) {
		buttons[i].onclick = function () {
			var btn = this;

			// 1) 防止手快连点：正在请求中就忽略
			if (btn.getAttribute("data-busy") === "1") {
				return;
			}

			// 2) 取出按钮上的信息
			var type = btn.getAttribute("data-like");     // message 还是 comment
			var id = btn.getAttribute("data-id");         // 留言/评论 id
			if (!id || id === "0") {                      // 盲盒弹窗还没填数据时点它，直接忽略
				return;
			}

			// 3) 标记“请求中”
			btn.setAttribute("data-busy", "1");

			// 4) 根据类型决定请求哪个接口、参数叫什么名字
			var url = (type === "message") ? "LikeServlet" : "LikeCommentServlet";
			var field = (type === "message") ? "message_id" : "comment_id";

			// 5) 发请求
			ajaxPost(url, field + "=" + encodeURIComponent(id), function (ok, data) {
				btn.setAttribute("data-busy", "0");       // 解除“请求中”

				// 6) 失败：弹窗说明原因（比如没登录）
				if (!ok || !data.success) {
					showTip((data && data.message) ? data.message : "网络开小差了，请稍后再试", "点赞失败");
					return;
				}

				// 7) 成功：用服务器返回的最新状态更新按钮
				applyLikeState(btn, data.liked, data.count);
			});
		};
	}
}

/* ============================================================
   12. 盲盒留言 / 漂流瓶
   ------------------------------------------------------------
   点“抽取今日盲盒”→ Ajax 请求 RandomMessageServlet
   → 后端随机抽一条别人的留言返回 JSON
   → 我们把内容填进弹窗并显示出来。
   ============================================================ */

// 打开一个弹窗（CSS 里 .modal-mask.show 才显示）
function openModal(mask) {
	if (!mask) {
		return;
	}
	if (mask.className.indexOf("show") < 0) {
		mask.className = mask.className + " show";
	}
	document.body.className = document.body.className + " modal-open";  // 锁住背景滚动
}

// 关闭弹窗
function closeModal(mask) {
	if (!mask) {
		return;
	}
	mask.className = mask.className.replace(/\bshow\b/g, "").replace(/\s+/g, " ");
	document.body.className = document.body.className.replace(/\bmodal-open\b/g, "").replace(/\s+/g, " ");
}

function initBlindBox() {
	var btn = document.getElementById("blindBoxBtn");       // 页面上的盲盒按钮
	var modal = document.getElementById("blindBoxModal");   // 弹窗
	if (!btn || !modal) {
		return;                                             // 不是留言板页面就跳过
	}

	// ---- 点击按钮：请求随机留言 ----
	btn.onclick = function () {
		var oldText = btn.innerHTML;                        // 记住原文字，请求完要还原
		btn.disabled = true;                                // 防止重复点击
		btn.innerHTML = "正在拆盲盒...";

		ajaxGet("RandomMessageServlet", function (ok, data) {
			btn.disabled = false;
			btn.innerHTML = oldText;

			// 1) 失败：弹窗告诉用户为什么（比如“还没有别人的留言”）
			if (!ok || !data.success) {
				showTip((data && data.message) ? data.message : "盲盒暂时打不开，请稍后再试", "盲盒提示");
				return;
			}

			// 2) 填头像：先改 data-avatar，再调用 paintAvatars() 重新画
			var avatar = document.getElementById("bbAvatar");
			avatar.setAttribute("data-avatar", data.avatar || "av1");
			paintAvatars();

			// 3) 填昵称 / 时间 / 内容
			//    注意用 textContent 而不是 innerHTML：
			//    这样即使留言里写了 <script> 也只会当普通文字显示，防止 XSS
			document.getElementById("bbName").textContent = data.nickname || "匿名小伙伴";
			document.getElementById("bbTime").textContent = data.time || "";
			document.getElementById("bbContent").textContent = data.content || "";

			// 4) 点赞按钮：换上这条留言的 id 和当前赞数
			var like = document.getElementById("bbLike");
			like.setAttribute("data-id", data.id);
			applyLikeState(like, data.liked, data.like_count);

			// 5) “偷偷回复”表单：把 message_id 改成这条留言
			document.getElementById("bbMsgId").value = data.id;

			// 6) 显示弹窗
			openModal(modal);
		});
	};

	// ---- 关闭方式：右上角 × 、点灰色遮罩 ----
	document.getElementById("bbClose").onclick = function () {
		closeModal(modal);
	};
	modal.onclick = function (e) {
		if (e.target === modal) {                           // 只有点到遮罩本身才关，点内容不关
			closeModal(modal);
		}
	};
}

/* ============================================================
   13. 通用提示弹窗
   ------------------------------------------------------------
   替代土土的 alert()，用同一个粉色弹窗显示提示，
   比如“包含违规词汇”“发言太快了”。
   ============================================================ */

function showTip(message, title) {
	var modal = document.getElementById("tipModal");
	// 万一当前页面没有弹窗（比如登录页），退回系统 alert，保证提示不丢
	if (!modal) {
		alert(message);
		return;
	}
	document.getElementById("tipTitle").textContent = title || "温馨提示";
	document.getElementById("tipText").textContent = message;
	openModal(modal);
}

function initTipModal() {
	var modal = document.getElementById("tipModal");
	if (!modal) {
		return;
	}
	// “知道啦”按钮关闭
	document.getElementById("tipOk").onclick = function () {
		closeModal(modal);
	};
	// 点遮罩关闭
	modal.onclick = function (e) {
		if (e.target === modal) {
			closeModal(modal);
		}
	};
	// 按 ESC 关闭所有弹窗（体验细节）
	document.onkeydown = function (e) {
		e = e || window.event;
		if (e.keyCode === 27) {
			closeModal(modal);
			closeModal(document.getElementById("blindBoxModal"));
		}
	};
}

/* ============================================================
   14. 显示安全过滤器留下的提示
   ------------------------------------------------------------
   SafetyFilter 拦截请求后，会把原因存进 session，
   QueryMessageServlet 再把它放进 request，
   board.jsp 输出到一个隐藏 div 里 —— 这里读出来弹窗，然后删掉 div。
   ============================================================ */
function initSafetyAlert() {
	var box = document.getElementById("safetyAlertData");
	if (!box) {
		return;                                             // 没有提示就什么都不做
	}
	var msg = (box.textContent || box.innerText || "").replace(/^\s+|\s+$/g, "");
	if (msg !== "") {
		showTip(msg, "温馨提示");
	}
	box.parentNode.removeChild(box);                        // 用掉就删，避免刷新重复弹
}

/* ============================================================
   15.【2026-11-19 新增】Ajax 异步提交：留言 / 评论 / 回复 / 修改评论
   ------------------------------------------------------------
   以前的痛点：
     表单是普通提交（form action=...），浏览器会整页跳走再重新加载，
     新页面从顶部开始渲染，所以用户刚在页面底部写完回复，一提交就被
     弹回页面最顶上，还得自己再滚下来找自己发的内容。

   现在的做法：
     1) 用 document 上的 submit 事件（捕获阶段）“拦截”表单的默认提交行为，
        调用 e.preventDefault() —— 页面因此不会刷新，自然不会跳回顶部；
     2) 用 XMLHttpRequest 把表单数据 POST 给原来的 Servlet，
        带上 X-Requested-With: XMLHttpRequest 头，后端看到这个头就返回 JSON；
     3) 收到 {"success":true,...} 后：
        · 清空输入框（方便连续发言）；
        · 只重新加载“留言列表”这一块 HTML（#listRegion），页面其它部分不动；
        · 用 scrollIntoView() 平滑滚动到刚发的那条留言 / 评论，并闪一下高亮。
   ============================================================ */

// 哪些表单要走 Ajax？用 action 里的关键字来认，简单又不容易写错
var AJAX_FORM_RULES = [
	{ key: "AddMessageServlet",    type: "message" },   // 顶部“提交留言”
	{ key: "AddCommentServlet",    type: "comment" },   // 评论 / 回复 / 盲盒里的偷偷回复
	{ key: "UpdateCommentServlet", type: "update"  }    // 评论的“修改”小表单
];

// 根据表单的 action 判断它属于哪种提交（不是上面三种就返回 null，走原生提交）
function findFormRule(form) {
	var action = form.getAttribute("action") || "";
	for (var i = 0; i < AJAX_FORM_RULES.length; i++) {
		if (action.indexOf(AJAX_FORM_RULES[i].key) > -1) {
			return AJAX_FORM_RULES[i];
		}
	}
	return null;
}

/**
 * 把表单里的控件拼成 "a=1&b=2" 这样的字符串。
 * 为什么不用 FormData？因为 FormData 会发 multipart/form-data，
 * 而老版本 Servlet（2.5）里 request.getParameter 读不到 multipart 的参数，
 * 手拼成 application/x-www-form-urlencoded 最稳，后端一行都不用改。
 */
function serializeForm(form) {
	var parts = [];
	var els = form.elements;
	for (var i = 0; i < els.length; i++) {
		var el = els[i];
		if (!el.name) {
			continue;                                   // 没有 name 的控件不会提交，跳过
		}
		// 复选框 / 单选框只有“选中”才会提交，这一点要和浏览器原生行为保持一致
		if ((el.type === "checkbox" || el.type === "radio") && !el.checked) {
			continue;
		}
		parts.push(encodeURIComponent(el.name) + "=" + encodeURIComponent(el.value));
	}
	return parts.join("&");
}

// 提交中 / 提交完：把按钮变成“发送中...”并禁用，防止手快连点提交两条
function setFormBusy(form, busy) {
	var btn = form.querySelector("button[type=submit]");
	if (busy) {
		form.setAttribute("data-sending", "1");
		if (btn) {
			if (!btn.getAttribute("data-old-text")) {
				btn.setAttribute("data-old-text", btn.innerHTML);
			}
			btn.disabled = true;
			btn.innerHTML = "发送中...";
		}
	} else {
		form.setAttribute("data-sending", "0");
		if (btn) {
			btn.disabled = false;
			btn.innerHTML = btn.getAttribute("data-old-text") || "发送";
			btn.removeAttribute("data-old-text");
		}
	}
}

/**
 * 提交成功后清空输入框（需求第 3 条）。
 * 注意：隐藏域不能清！message_id / parent_id / id 还要用。
 * 留言表单里的“昵称”也保留 —— 那是用户自己的网名，没必要每次重填。
 */
function clearForm(form, type) {
	var inputs = form.querySelectorAll("input, textarea");
	for (var i = 0; i < inputs.length; i++) {
		var el = inputs[i];
		if (el.type === "hidden" || el.type === "submit" || el.type === "button") {
			continue;                                   // 隐藏域 / 按钮不动
		}
		if (el.type === "checkbox" || el.type === "radio") {
			el.checked = false;                         // “公开显示”之类恢复未勾选
			continue;
		}
		if (type === "message" && el.name === "nickname") {
			continue;                                   // 昵称保留
		}
		el.value = "";                                  // ★ 就是这里：.value = ""
	}
}

// 顶部的小提示条复用一下：提交成功后飘一句“发布成功啦～”
function showToast(text) {
	var toast = document.getElementById("toast");
	if (!toast) {
		return;
	}
	toast.innerHTML = text;                             // 内容是我们自己写的固定文案，安全
	toast.className = "toast show";
	setTimeout(function () {
		toast.className = "toast";
	}, 2600);
}

/**
 * 只刷新“留言列表”这一块（#listRegion），不刷新整个页面。
 *
 * 原理：向 QueryMessageServlet 请求一次完整页面 HTML，
 *      用 DOMParser 把它解析成“离屏文档”，再从里面挖出 #listRegion，
 *      最后只把它的 innerHTML 换进来。
 * 好处：列表的渲染逻辑仍然只写在 board.jsp 里（JSTL 那一套），
 *      JS 不用再手写一遍模板，也不会出现“JS 拼的 HTML 和 JSP 长得不一样”的问题。
 * 副作用：浏览器滚动位置、顶部表单里没提交的内容都不会丢 —— 这正是我们要的。
 */
function refreshListRegion(done) {
	var current = document.getElementById("listRegion");
	if (!current) {
		if (done) { done(false); }
		return;
	}
	var xhr = new XMLHttpRequest();
	xhr.open("GET", "QueryMessageServlet", true);
	xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
	xhr.onreadystatechange = function () {
		if (xhr.readyState !== 4) {
			return;
		}
		if (xhr.status !== 200) {
			if (done) { done(false); }                  // 刷新失败：至少数据已经存进库了
			return;
		}
		var doc = null;
		try {
			doc = new DOMParser().parseFromString(xhr.responseText, "text/html");
		} catch (e) {
			doc = null;
		}
		var fresh = doc ? doc.getElementById("listRegion") : null;
		if (!fresh) {
			if (done) { done(false); }
			return;
		}
		current.innerHTML = fresh.innerHTML;            // ★ 只换这一块
		rebindRegion(current);                          // 新插入的节点需要重新绑事件
		if (done) { done(true); }
	};
	xhr.send(null);
}

// 列表被替换后，给新节点补上事件（头像、展开、点赞）
function rebindRegion(root) {
	paintAvatars();        // 头像表情（全量重画，元素不多，成本很低）
	initToggles(root);     // 评论 / 回复输入框的展开收起
	initAjaxLikes(root);   // 点赞按钮
}

/**
 * 平滑滚动到某个元素并闪一下高亮（需求第 2 条）。
 * @param selector         首选选择器，例如 .msg[data-mid="12"]
 * @param fallbackSelector 找不到时的备选选择器（例如它所在的留言）
 */
function flashAndScroll(selector, fallbackSelector) {
	var el = selector ? document.querySelector(selector) : null;
	if (!el && fallbackSelector) {
		el = document.querySelector(fallbackSelector);
	}
	if (!el) {
		return;                                         // 实在找不到就不动，绝不跳回顶部
	}
	// 加 flash 类 → CSS 里有一段粉色高亮动画，让用户一眼看到自己的内容
	if (el.className.indexOf("flash") < 0) {
		el.className = el.className + " flash";
	}
	setTimeout(function () {
		el.className = el.className.replace(/\bflash\b/g, "").replace(/\s+/g, " ");
	}, 1800);

	// ★ 关键：scrollIntoView 让目标停在屏幕中间，而不是回到页面顶部
	try {
		el.scrollIntoView({ block: "center", behavior: "smooth" });
	} catch (err) {
		el.scrollIntoView();                            // 老浏览器不支持参数时退化处理
	}
}

// 把某个输入框重新展开（发完评论后保持展开，方便用户接着聊）
function reopenBox(id) {
	var box = document.getElementById(id);
	if (box && box.className.indexOf("open") < 0) {
		box.className = box.className + " open";
	}
}

/**
 * 提交成功后的统一收尾：
 * 清表单 → 局部刷新列表 → 滚动定位 + 高亮 → 展开输入框
 */
function afterSubmitSuccess(form, rule, data) {
	// 1) 清空输入框（内容清掉，方便连续发言）
	clearForm(form, rule.type);

	// 2) 盲盒弹窗里的“偷偷回复”发完就把弹窗关掉
	if (form.id === "bbReplyForm") {
		closeModal(document.getElementById("blindBoxModal"));
	}

	// 3) 顶部飘一句成功提示（不打断操作，不需要用户点“确定”）
	showToast(data.message || "发布成功啦～");

	// 4) 只刷新留言列表区域，页面不跳顶部
	refreshListRegion(function () {
		if (rule.type === "message") {
			// 4.1 新留言：直接定位到那条留言（它在列表最前面）
			flashAndScroll('.msg[data-mid="' + data.id + '"]', null);
		} else if (rule.type === "comment") {
			// 4.2 新评论 / 新回复：优先定位到这条评论本身；
			//     万一没找到（比如别人的留言被取消了推送），就退回到它所在的那条留言
			flashAndScroll('[data-cid="' + data.id + '"]', '.msg[data-mid="' + data.message_id + '"]');
			// 把刚才用过的输入框重新展开，方便接着发言
			reopenBox(data.parent_id > 0 ? ("rbox-" + data.parent_id) : ("cbox-" + data.message_id));
		} else {
			// 4.3 修改评论：定位到被改的那条
			flashAndScroll('[data-cid="' + data.id + '"]', '.msg[data-mid="' + data.message_id + '"]');
		}
	});
}

/**
 * 绑定全局的 submit 拦截。
 * 用的是“事件委托 + 捕获阶段”，好处是：
 *   · 只需要绑一次，不需要给每个表单单独绑；
 *   · Ajax 刷新出来的新表单（新留言下面的评论框）自动也受管，不用重新绑。
 */
function initAjaxForms() {
	document.addEventListener("submit", function (e) {
		var form = e.target;
		if (!form || !form.getAttribute) {
			return;
		}
		var rule = findFormRule(form);
		if (!rule) {
			return;                                     // 其它表单（例如换头像）不拦，照原样提交
		}

		e.preventDefault();                             // ★ 核心：阻止整页提交，页面不再跳回顶部

		// 正在发送中就忽略（防止连点发出两条一样的留言）
		if (form.getAttribute("data-sending") === "1") {
			return;
		}
		setFormBusy(form, true);

		ajaxPost(form.getAttribute("action"), serializeForm(form), function (ok, data) {
			setFormBusy(form, false);

			// 失败：弹窗说明原因（空内容、敏感词、发言太快、没登录……）
			// 注意这里不清空输入框，用户改一改还能直接再发
			if (!ok || !data.success) {
				showTip((data && data.message) ? data.message : "提交失败，请稍后再试", "提交失败");
				return;
			}

			afterSubmitSuccess(form, rule, data);
		});
	}, true);   // 第三个参数 true = 在捕获阶段拦截，最稳
}

/* ---------- 9. 页面加载完成后统一初始化 ---------- */
window.onload = function () {
	paintAvatars();      // 画头像
	initAvatarPicker();  // 登录/注册页的头像选择器
	initUserNo();        // 随机默认ID
	initMenus();         // 三个点菜单
	initToggles();       // 评论/回复展开
	initAvatarPop();     // 换头像面板
	initToast();         // 操作提示

	initAjaxLikes();     // Ajax 无刷新点赞
	initBlindBox();      // 盲盒留言
	initTipModal();      // 通用提示弹窗
	initSafetyAlert();   // 显示过滤器拦截原因
	initAjaxForms();     // 【新增】Ajax 无刷新提交留言 / 评论 / 回复
};
