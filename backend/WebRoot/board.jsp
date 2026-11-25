<%@ page language="java" pageEncoding="UTF-8"%>
<%-- JSTL 核心标签库：<c:if> <c:forEach> <c:choose> --%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<%-- JSTL 格式化标签库：<fmt:formatDate> 用来把 Date 显示成 2026-11-19 15:16 这种样子 --%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/fmt" prefix="fmt" %>
<%-- JSTL 函数库：${fn:length(msgList)} 可以统计集合里有几条数据 --%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/functions" prefix="fn" %>
<%-- 必须写这一行！它把页面的地区设置成中国，
     否则 <fmt:formatDate> 有可能拿不到默认 Locale，时间会显示成 2026-11-19 15:38:46.0 这种原始格式 --%>
<fmt:setLocale value="zh_CN"/>
<%
String path = request.getContextPath();
String basePath = request.getScheme()+"://"+request.getServerName()+":"+request.getServerPort()+path+"/";
%>
<%-- 安全兜底：如果没登录就直接访问 board.jsp，立刻跳回登录页 --%>
<c:if test="${empty sessionScope.loginUser}">
	<c:redirect url="login.jsp"/>
</c:if>
<!DOCTYPE html>
<html>
<head>
	<base href="<%=basePath%>">
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>粉粉留言板</title>
	<link rel="stylesheet" href="css/board.css">
</head>
<body>

<%-- 顶部飘出来的小提示：只有 request 里有 tip 时才显示 --%>
<div class="toast" id="toast"><c:if test="${not empty tip}">${tip}</c:if></div>

<div class="page">

	<%-- ==================== 1. 顶部导航：品牌 + 我的信息 ==================== --%>
	<div class="topbar">
		<div class="brand">
			<span class="logo">🌸</span> 粉粉留言板
		</div>
		<div class="user-chip">
			<%-- 我的头像：做成按钮，点一下就在下面弹出“换头像”面板（头像随时可改） --%>
			<button class="avatar-btn" type="button" id="avatarTrigger" title="点击更换头像">
				<span class="avatar" data-avatar="${sessionScope.loginUser.avatar}"></span>
			</button>
			<div class="who">
				<%-- 名字显示网名（没有网名才退回手机号），不再直接把手机号当昵称 --%>
				<b>${empty sessionScope.loginUser.nickname ? sessionScope.loginUser.account : sessionScope.loginUser.nickname}</b>
				<span>ID：${sessionScope.loginUser.user_no}</span>
			</div>

			<%-- 退出：改成一个圆形小图标（门 + 箭头），鼠标悬停才显示粉底。
			     外面套 a 标签，点击直接请求 LogoutServlet（清 session 后回登录页） --%>
			<a class="logout-icon" href="${pageContext.request.contextPath}/LogoutServlet"
			   title="退出登录" aria-label="退出登录">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none"
				     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"></path>
					<path d="M10 17l5-5-5-5"></path>
					<path d="M15 12H3"></path>
				</svg>
			</a>

			<%-- 换头像面板：8 个按钮，点哪个就提交哪个编号给 UpdateAvatarServlet --%>
			<div class="avatar-pop" id="avatarPop">
				<div class="pop-title">选一个喜欢的头像</div>
				<form action="UpdateAvatarServlet" method="post">
					<div class="avatar-picker">
						<button type="submit" name="avatar" value="av1" data-avatar="av1"></button>
						<button type="submit" name="avatar" value="av2" data-avatar="av2"></button>
						<button type="submit" name="avatar" value="av3" data-avatar="av3"></button>
						<button type="submit" name="avatar" value="av4" data-avatar="av4"></button>
						<button type="submit" name="avatar" value="av5" data-avatar="av5"></button>
						<button type="submit" name="avatar" value="av6" data-avatar="av6"></button>
						<button type="submit" name="avatar" value="av7" data-avatar="av7"></button>
						<button type="submit" name="avatar" value="av8" data-avatar="av8"></button>
					</div>
				</form>
			</div>
		</div>
	</div>

	<%-- ==================== 1.5 盲盒留言入口（2026-11-19 新增） ====================
	     点这个按钮会发 Ajax 请求给 RandomMessageServlet，
	     随机抽一条别人的留言，用弹窗展示，不刷新页面。 --%>
	<div class="blindbox-bar">
		<div class="bb-info">
			<span class="bb-emoji">🎁</span>
			<div class="bb-text">
				<b>今日盲盒</b>
				<span>随手抽一条别人的留言，看看会遇到谁</span>
			</div>
		</div>
		<%-- type="button" 很重要：不是 submit，不会提交表单 --%>
		<button class="bb-btn" type="button" id="blindBoxBtn">抽取今日盲盒</button>
	</div>

	<%-- ==================== 2. 留言表单（页面上半部分） ==================== --%>
	<div class="card">
		<h2 class="card-title">
			<span class="bar"></span>留言联系
			<small>有什么问题请留言，我会尽快给你回复</small>
		</h2>

		<%-- 表单提交给 AddMessageServlet，所有 input 的 name 必须和 servlet 里 getParameter 的名字一致
		     【2026-11-19 改造】加了 id="msgForm"：
		     board.js 会拦住它的默认提交行为，改用 Ajax 发出去，
		     这样提交完页面不会刷新、不会跳回顶部，只在原地追加留言 + 清空输入框。 --%>
		<form id="msgForm" action="AddMessageServlet" method="post">
			<div class="form-grid">
				<div class="field">
					<div class="field-head">
						<label>昵称</label>
						<span class="field-hint">系统随机送的网名，可以改</span>
					</div>
					<%-- 默认填用户自己的网名（例如“快乐的小狗”），
					     以前这里填的是 account（手机号），所以列表里全是手机号。
					     用户想换名字，直接改这个输入框再提交就行，改完会同步到账号 --%>
					<input type="text" name="nickname"
					       value="${empty sessionScope.loginUser.nickname ? sessionScope.loginUser.account : sessionScope.loginUser.nickname}"
					       maxlength="20" placeholder="显示在留言上的名字">
				</div>

				<%-- 姓名 + “公开显示”复选框 --%>
				<div class="field">
					<div class="field-head">
						<label>姓名</label>
						<%-- 勾上 → 列表里原样显示；不勾 → 显示成 张* --%>
						<label class="public-toggle" title="勾选后，这条留言里会公开显示你的姓名">
							<input type="checkbox" name="is_name_public" value="1">
							<span>公开显示</span>
						</label>
					</div>
					<input type="text" name="real_name" maxlength="20" placeholder="你的真实姓名">
				</div>

				<div class="field">
					<div class="field-head">
						<label>邮箱地址</label>
						<label class="public-toggle" title="勾选后，这条留言里会公开显示你的邮箱">
							<input type="checkbox" name="is_email_public" value="1">
							<span>公开显示</span>
						</label>
					</div>
					<input type="email" name="email" maxlength="50" placeholder="abc@qq.com">
				</div>

				<div class="field">
					<div class="field-head">
						<label>联系电话</label>
						<label class="public-toggle" title="勾选后，这条留言里会公开显示你的电话">
							<input type="checkbox" name="is_phone_public" value="1">
							<span>公开显示</span>
						</label>
					</div>
					<input type="text" name="phone" maxlength="20" placeholder="手机号或座机">
				</div>

				<div class="field full">
					<div class="field-head">
						<label>留言内容</label>
					</div>
					<textarea name="content" required maxlength="500" placeholder="把想说的话写在这里，我会尽快回复～"></textarea>
				</div>
				<div class="form-actions">
					<%-- 提交按钮：type=submit 会触发上面的 form 提交 --%>
					<button class="btn btn-primary" type="submit">提 交</button>
					<%-- 重置按钮：清空所有输入框（HTML 自带功能） --%>
					<button class="btn btn-ghost" type="reset">重 置</button>
				</div>
			</div>
		</form>
	</div>

	<%-- ==================== 3. 留言列表（页面下半部分） ====================
	     整块列表外面套了一个 id="listRegion" 的容器，这是【2026-11-19 新增】的：
	     Ajax 提交成功后，board.js 只会重新请求这一块 HTML 并替换它的 innerHTML，
	     页面其它部分（顶部导航、留言表单、滚动位置）都不受影响，所以不会跳回顶部。 --%>
	<div id="listRegion">
	<div class="card">
		<h2 class="card-title">
			<span class="bar"></span>全部留言
			<small>共 ${fn:length(msgList)} 条</small>
		</h2>

		<c:choose>
			<%-- 3.1 一条留言都没有的时候 --%>
			<c:when test="${empty msgList}">
				<div class="empty">
					<span class="face">🌷</span>
					还没有人留言，上面的表单就是你的舞台
				</div>
			</c:when>

			<%-- 3.2 有留言：用 c:forEach 循环显示（var="m" 就是每一条留言对象） --%>
			<c:otherwise>
				<c:forEach var="m" items="${msgList}">

					<%-- 如果这条留言被取消了推送（status=0），就加一个 is-off 类，变成浅粉虚线框
					     【2026-11-19 新增】data-mid：把留言 id 写到 DOM 上，
					     Ajax 提交成功后 JS 用 [data-mid="新id"] 就能找到这条留言并滚动过去 --%>
					<article class="msg ${m.status == 0 ? 'is-off' : ''}" data-mid="${m.id}">

						<%-- 留言头：头像 + 昵称 + 时间 + 三个点菜单 --%>
						<div class="msg-head">
							<span class="avatar" data-avatar="${m.avatar}"></span>
							<div class="who">
								<div class="name">
									${m.nickname}
									<c:if test="${m.status == 0}">
										<span class="tag-off">已取消推送</span>
									</c:if>
								</div>
								<%-- 姓名/邮箱/电话：显示的是 Java 里算好的“展示值”
								     勾了“公开显示”就原样显示，没勾就是 张* / abc***@qq.com / 138****1111 --%>
								<div class="meta">
									<c:if test="${not empty m.real_name_show}"><span>${m.real_name_show}</span></c:if>
									<c:if test="${not empty m.email_show}"><span>${m.email_show}</span></c:if>
									<c:if test="${not empty m.phone_show}"><span>${m.phone_show}</span></c:if>
								</div>
							</div>
							<%-- 时间：把 Date 对象按 yyyy-MM-dd HH:mm 的格式显示出来 --%>
							<div class="time">
								<fmt:formatDate value="${m.create_time}" pattern="yyyy-MM-dd HH:mm"/>
							</div>

							<%-- 只有自己发的留言，才显示“三个点”菜单 --%>
							<c:if test="${m.user_id == sessionScope.loginUser.id}">
								<div class="menu-wrap">
									<button class="menu-btn" type="button" title="更多操作">⋯</button>
									<div class="menu-list">
										<%-- 修改内容：先跳到 QueryMessageByIdServlet 查出这条留言，再进修改页 --%>
										<a class="menu-item" href="QueryMessageByIdServlet?id=${m.id}">✏️ 修改内容</a>

										<%-- 已推送 → 显示“取消推送”；已取消 → 显示“重新推送” --%>
										<c:choose>
											<c:when test="${m.status == 1}">
												<a class="menu-item" href="CancelPushServlet?id=${m.id}&status=0">🚫 取消推送</a>
											</c:when>
											<c:otherwise>
												<a class="menu-item" href="CancelPushServlet?id=${m.id}&status=1">📢 重新推送</a>
											</c:otherwise>
										</c:choose>

										<%-- 删除：onclick 里弹一个确认框，点“取消”就不跳转 --%>
										<a class="menu-item danger" href="DeleteMessageServlet?id=${m.id}"
										   onclick="return confirm('确定要删除这条留言吗？它下面的评论和点赞也会一起删除。');">🗑 删除</a>
									</div>
								</div>
							</c:if>
						</div>

						<%-- 留言正文：c:out 会把内容里的特殊符号转义，防止有人写 <script> 捣乱 --%>
						<div class="msg-content"><c:out value="${m.content}"/></div>

						<%-- 点赞 / 评论 两个按钮 --%>
						<div class="msg-actions">
							<%-- 点赞按钮（已改成 Ajax，不再用 form 提交）：
							     data-like="message" → JS 知道这是给“留言”点赞，走 LikeServlet
							     data-id             → 这条留言的 id
							     data-liked/count    → 当前状态，JS 点击后会从服务器拿新值覆盖 --%>
							<button class="act like-btn ${m.liked ? 'liked' : ''}" type="button"
							        data-like="message" data-id="${m.id}"
							        data-liked="${m.liked}" data-count="${m.like_count}">
								<span class="ico">${m.liked ? '❤️' : '🤍'}</span>
								<span class="txt">点赞</span>
								<span class="num">${m.like_count}</span>
							</button>

							<%-- 评论按钮：点一下展开下面的评论输入框（JS 根据 data-toggle 找 id 匹配的盒子） --%>
							<button class="act" type="button" data-toggle="cbox-${m.id}">
								💬 评论 ${m.comment_count}
							</button>
						</div>

						<%-- ============ 评论区域 ============
						     只有真的有评论时，才显示这个粉色的评论区盒子；
						     没有评论就不显示，页面更干净 --%>
						<c:if test="${not empty m.comments}">
							<div class="comments">

								<%-- 遍历一级评论 --%>
							<c:forEach var="cm" items="${m.comments}">
								<%-- data-cid：评论 id，Ajax 发完评论后 JS 靠它精准滚动到这条评论 --%>
								<div class="comment" data-cid="${cm.id}">
									<div class="comment-head">
										<span class="avatar" data-avatar="${cm.avatar}"></span>
										<%-- 昵称统一取自 mb_user 的网名，不会再出现手机号 --%>
										<span class="name">${cm.nickname}</span>
										<%-- 改过的回复/评论，显示一个“已编辑”小标签 --%>
										<c:if test="${not empty cm.update_time}">
											<span class="edited">已编辑</span>
										</c:if>
										<span class="time">
											<fmt:formatDate value="${cm.create_time}" pattern="yyyy-MM-dd HH:mm"/>
										</span>
									</div>
									<div class="comment-body"><c:out value="${cm.content}"/></div>

									<%-- 评论下面的操作：回复 / 点赞 / 修改 / 删除 --%>
									<div class="comment-tools">
										<%-- 回复按钮：展开这条评论下面的回复输入框 --%>
										<button type="button" class="tool" data-toggle="rbox-${cm.id}">💬 回复</button>

										<%-- 评论点赞（Ajax）：
										     data-like="comment" → 走 LikeCommentServlet
										     点完 JS 直接把红心和数字改掉，不刷新页面 --%>
										<button type="button" class="tool like-btn ${cm.liked ? 'liked' : ''}"
										        data-like="comment" data-id="${cm.id}"
										        data-liked="${cm.liked}" data-count="${cm.like_count}">
											<span class="ico">${cm.liked ? '❤️' : '🤍'}</span>
											<span class="txt">赞</span>
											<span class="num">${cm.like_count}</span>
										</button>

										<%-- 只有自己发的评论，才显示“修改 / 删除” --%>
										<c:if test="${cm.user_id == sessionScope.loginUser.id}">
											<button type="button" class="tool" data-toggle="ebox-${cm.id}">✏️ 修改</button>
											<a class="tool danger" href="DeleteCommentServlet?id=${cm.id}"
											   onclick="return confirm('确定要删除这条评论吗？它下面的回复也会一起删除。');">🗑 删除</a>
										</c:if>
									</div>

									<%-- 修改评论的小表单：默认收起，点“修改”才展开，输入框里已经填好原内容 --%>
									<c:if test="${cm.user_id == sessionScope.loginUser.id}">
										<form class="inline-form" id="ebox-${cm.id}" action="UpdateCommentServlet" method="post">
											<input type="hidden" name="id" value="${cm.id}">
											<input type="text" name="content" value="<c:out value='${cm.content}'/>" required maxlength="200">
											<button class="send" type="submit">保存</button>
										</form>
									</c:if>

									<%-- 这条评论下面的回复（已经在 CommentDao 里拼好的两级结构） --%>
									<c:if test="${not empty cm.replies}">
										<div class="replies">
											<c:forEach var="rp" items="${cm.replies}">
												<%-- data-cid：二级回复的 id，同样是给 Ajax 提交后的滚动定位用的 --%>
												<div class="reply" data-cid="${rp.id}">
													<div class="comment-head">
														<span class="avatar" data-avatar="${rp.avatar}"></span>
														<span class="name">${rp.nickname}</span>
														<c:if test="${not empty rp.update_time}">
															<span class="edited">已编辑</span>
														</c:if>
														<span class="time">
															<fmt:formatDate value="${rp.create_time}" pattern="yyyy-MM-dd HH:mm"/>
														</span>
													</div>
													<%-- 【2026-11-19 修复】这行必须写在同一行里！
													     .comment-body 用了 white-space: pre-wrap（保留换行），
													     如果标签内外出现换行和缩进，浏览器会把它当成真实空白，
													     文字就会被一堆 tab 推到右边去。 --%>
													<div class="comment-body">回复 <span class="at">@${rp.reply_nickname}</span>：<c:out value="${rp.content}"/></div>

													<%-- 二级回复下面的操作：点赞，自己发的还能修改 / 删除 --%>
													<div class="comment-tools">
														<%-- 二级回复的点赞也改成 Ajax，和上面留言、评论的逻辑完全一致 --%>
														<button type="button" class="tool like-btn ${rp.liked ? 'liked' : ''}"
														        data-like="comment" data-id="${rp.id}"
														        data-liked="${rp.liked}" data-count="${rp.like_count}">
															<span class="ico">${rp.liked ? '❤️' : '🤍'}</span>
															<span class="txt">赞</span>
															<span class="num">${rp.like_count}</span>
														</button>

														<c:if test="${rp.user_id == sessionScope.loginUser.id}">
															<button type="button" class="tool" data-toggle="ebox-${rp.id}">✏️ 修改</button>
															<a class="tool danger" href="DeleteCommentServlet?id=${rp.id}"
															   onclick="return confirm('确定要删除这条回复吗？');">🗑 删除</a>
														</c:if>
													</div>

													<%-- 修改回复的小表单 --%>
													<c:if test="${rp.user_id == sessionScope.loginUser.id}">
														<form class="inline-form" id="ebox-${rp.id}" action="UpdateCommentServlet" method="post">
															<input type="hidden" name="id" value="${rp.id}">
															<input type="text" name="content" value="<c:out value='${rp.content}'/>" required maxlength="200">
															<button class="send" type="submit">保存</button>
														</form>
													</c:if>
												</div>
											</c:forEach>
										</div>
									</c:if>

									<%-- 回复输入框：parent_id 填这条评论的 id，后台就知道这是“回复某人” --%>
									<form class="inline-form" id="rbox-${cm.id}" action="AddCommentServlet" method="post">
										<input type="hidden" name="message_id" value="${m.id}">
										<input type="hidden" name="parent_id" value="${cm.id}">
										<input type="text" name="content" placeholder="回复 @${cm.nickname}" required maxlength="200">
										<button class="send" type="submit">发送</button>
									</form>
								</div>
								</c:forEach>
							</div>
						</c:if>

						<%-- 直接评论这条留言的输入框：parent_id 固定 0
						     默认是收起的，点上面那个“💬 评论”按钮才展开 --%>
						<form class="inline-form add-comment" id="cbox-${m.id}" action="AddCommentServlet" method="post">
							<input type="hidden" name="message_id" value="${m.id}">
							<input type="hidden" name="parent_id" value="0">
							<input type="text" name="content" placeholder="写下你的评论..." required maxlength="200">
							<button class="send" type="submit">发送</button>
						</form>

					</article>
				</c:forEach>
			</c:otherwise>
		</c:choose>
	</div>
	</div><%-- ===== #listRegion 结束（Ajax 局部刷新的范围到此为止） ===== --%>

</div><%-- ===== .page 结束 ===== --%>

<%-- ==================== 5. 盲盒留言弹窗（2026-11-19 新增） ====================
     默认是隐藏的（CSS 里 .modal-mask 没有 show 类就看不见），
     点“抽取今日盲盒”后由 board.js 填好内容再显示出来。 --%>
<div class="modal-mask" id="blindBoxModal">
	<div class="modal">
		<%-- 右上角关闭按钮 --%>
		<button class="modal-close" type="button" id="bbClose" title="关闭">×</button>

		<div class="modal-tag">🎁 今日盲盒</div>

		<%-- 留言的主人：头像 + 网名 + 时间 --%>
		<div class="modal-head">
			<span class="avatar" id="bbAvatar" data-avatar="av1"></span>
			<div class="bb-who">
				<b id="bbName">—</b>
				<span id="bbTime">—</span>
			</div>
		</div>

		<%-- 留言正文（JS 用 textContent 写入，不会被当成 HTML 执行，安全） --%>
		<div class="modal-body" id="bbContent">正在拆盲盒...</div>

		<%-- 弹窗里的操作区：点赞按钮（复用 Ajax 点赞逻辑） --%>
		<div class="modal-actions">
			<button class="act like-btn" type="button" id="bbLike"
			        data-like="message" data-id="0" data-liked="false" data-count="0">
				<span class="ico">🤍</span>
				<span class="txt">点赞</span>
				<span class="num">0</span>
			</button>
			<span class="modal-hint">喜欢的话，也可以偷偷回一句</span>
		</div>

		<%-- “偷偷回复”表单：直接提交给 AddCommentServlet（parent_id=0 表示评论这条留言）
		     message_id 由 JS 填成盲盒抽到的留言 id --%>
		<form class="modal-reply" id="bbReplyForm" action="AddCommentServlet" method="post">
			<input type="hidden" name="message_id" id="bbMsgId" value="0">
			<input type="hidden" name="parent_id" value="0">
			<input type="text" name="content" placeholder="偷偷回复一句..." required maxlength="200">
			<button class="send" type="submit">发送</button>
		</form>
	</div>
</div>

<%-- ==================== 6. 通用提示弹窗 ====================
     用于显示安全过滤器拦下来的原因：
     “包含违规词汇，请文明发言”“发言太快了，请 X 秒后再试” --%>
<div class="modal-mask" id="tipModal">
	<div class="modal modal-sm">
		<div class="tip-icon">🔔</div>
		<div class="tip-title" id="tipTitle">温馨提示</div>
		<div class="tip-text" id="tipText"></div>
		<button class="btn btn-primary" type="button" id="tipOk">知道啦</button>
	</div>
</div>

<%-- 过滤器留下的提示：藏一个 div，board.js 读 innerText 后弹窗，读完就移除 --%>
<c:if test="${not empty safetyAlert}">
	<div id="safetyAlertData" style="display:none;"><c:out value="${safetyAlert}"/></div>
</c:if>

<script src="js/board.js"></script>
</body>
</html>
