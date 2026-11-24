/* ============================================================
 * 留言板 · 登录页（P-05）与注册页（P-02）
 * 流程 A：注册 → 建会话 → 直接进榜单；字段级错误定位；
 * 保留已填内容；已登录访问跳 P-01。
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var api = HMB.api;
  var t = function (k, p) { return HMB.i18n.t(k, p); };
  var $ = function (id) { return document.getElementById(id); };

  var page = document.body.getAttribute("data-page");
  var PHONE_RE = /^1[3-9]\d{9}$/;
  var busy = false;

  function qs(name) {
    var m = window.location.search.match(new RegExp("[?&]" + name + "=([^&#]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function showErr(input, errEl, msg) {
    if (input) input.classList.add("field-input--error");
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.add("is-visible");
    }
  }

  function clearErrs(form) {
    form.querySelectorAll(".field-input").forEach(function (i) { i.classList.remove("field-input--error"); });
    form.querySelectorAll(".field-error").forEach(function (e) { e.textContent = ""; e.classList.remove("is-visible"); });
  }

  function gotoAfterAuth() {
    // 优先 redirect 参数；其次登录引导保存的原位；兜底首页
    var redirect = qs("redirect");
    if (redirect) {
      window.location.href = redirect;
      return;
    }
    var ret = C.consumeReturnPoint();
    window.location.href = ret && ret.href ? ret.href : "index.html";
  }

  /* ---------------- 登录页 ---------------- */

  function initLogin() {
    var form = document.querySelector("main");
    var phone = $("loginPhone"), pwd = $("loginPwd");
    var phoneErr = $("loginPhoneErr"), pwdErr = $("loginPwdErr");
    var errBar = $("loginErrBar");
    var btn = $("loginSubmitBtn");

    // ?phone= 来自注册页 1002 引导（保留已填手机号）
    var prefill = qs("phone");
    if (prefill) phone.value = prefill;

    function fail(msg) {
      errBar.textContent = msg;
      errBar.classList.remove("hint-bar--hidden");
    }

    btn.addEventListener("click", function () {
      if (busy) return;
      if (!agreeOk(errBar)) return;
      clearErrs(form);
      errBar.classList.add("hint-bar--hidden");

      // 前端拦截：非法手机号不发请求，固定文案（PRD F1 验收）
      if (!PHONE_RE.test(phone.value.trim())) {
        showErr(phone, phoneErr, t("error.1001"));
        phone.focus();
        return;
      }
      if (!pwd.value) {
        showErr(pwd, pwdErr, t("error.9001"));
        pwd.focus();
        return;
      }

      busy = true;
      btn.disabled = true;
      btn.textContent = t("common.submitting");

      api.login({ phone: phone.value.trim(), password: pwd.value }).then(function (resp) {
        busy = false;
        btn.disabled = false;
        btn.setAttribute("data-text", "login.submit");
        btn.textContent = t("login.submit");

        if (resp.success) {
          U.toast(t("toast.loginSuccess"), "success");
          gotoAfterAuth();
          return;
        }
        // 2001 / 2002 / 网络失败：就地提示并保留手机号（5.12）
        fail(resp.message);
        if (resp.code === 2001) pwd.focus();
      });
    });

    pwd.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    phone.addEventListener("keydown", function (e) { if (e.key === "Enter") pwd.focus(); });

    var eye = $("loginEye");
    if (eye) {
      eye.appendChild(U.icon("eye"));
      eye.addEventListener("click", function () {
        var show = pwd.type === "password";
        pwd.type = show ? "text" : "password";
        eye.classList.toggle("is-on", show);
        eye.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
      });
    }
  }

  /* ---------------- 注册页 ---------------- */

  function initRegister() {
    var form = document.querySelector("main");
    var phone = $("regPhone"), pwd = $("regPwd"), confirm = $("regConfirm");
    var name = $("regName"), email = $("regEmail");
    var phoneErr = $("regPhoneErr"), pwdErr = $("regPwdErr"), confirmErr = $("regConfirmErr");
    var errBar = $("regErrBar");
    var btn = $("regSubmitBtn");

    function fail(msg) {
      errBar.textContent = msg;
      errBar.classList.remove("hint-bar--hidden");
    }

    btn.addEventListener("click", function () {
      if (busy) return; // 防重锁
      if (!agreeOk(errBar)) return;
      clearErrs(form);
      errBar.classList.add("hint-bar--hidden");

      // 前端拦截：固定文案，不发请求（PRD F1）
      if (!PHONE_RE.test(phone.value.trim())) {
        showErr(phone, phoneErr, t("error.1001"));
        phone.focus();
        return;
      }
      var pwdVal = pwd.value;
      if (!(pwdVal.length >= 8 && /[a-zA-Z]/.test(pwdVal) && /\d/.test(pwdVal))) {
        showErr(pwd, pwdErr, t("error.1003"));
        pwd.focus();
        return;
      }
      if (confirm.value !== pwdVal) {
        // 两次输入不一致 → 定位密码字段（保留手机号）
        showErr(confirm, confirmErr, t("register.confirmMismatch"));
        confirm.focus();
        return;
      }

      busy = true;
      btn.disabled = true;
      btn.textContent = t("common.submitting");

      api.register({
        phone: phone.value.trim(),
        password: pwdVal,
        name: name.value.trim(),
        email: email.value.trim()
      }).then(function (resp) {
        busy = false;
        btn.disabled = false;
        btn.setAttribute("data-text", "register.submit");
        btn.textContent = t("register.submit");

        if (resp.success) {
          U.toast(t("toast.registerSuccess"), "success");
          window.location.href = "index.html"; // 流程 A：成功免二次登录直接进榜单
          return;
        }
        switch (resp.code) {
          case 1002:
            // 已注册 → 字段级提示 + 保留手机号 + 引导登录
            showErr(phone, phoneErr, resp.message);
            phone.focus();
            errBar.innerHTML = "";
            var link = document.createElement("a");
            link.href = "login.html?phone=" + encodeURIComponent(phone.value.trim());
            link.textContent = t("register.gotoLogin") + " →";
            link.addEventListener("click", function (ev) {
              ev.preventDefault();                       // 同页：切回登录 tab 并带号填充
              switchFormTab("login");
              var lp = $("loginPhone");
              lp.value = phone.value.trim();
              lp.focus();
            });
            errBar.appendChild(document.createTextNode(resp.message + "  "));
            errBar.appendChild(link);
            errBar.classList.remove("hint-bar--hidden");
            break;
          case 1003:
            showErr(pwd, pwdErr, resp.message);
            pwd.focus();
            break;
          default: // 1009 / 9001 / 9003 / 网络：停留原页保留全部已填
            fail(resp.message);
        }
      });
    });

    confirm.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    pwd.addEventListener("keydown", function (e) { if (e.key === "Enter") confirm.focus(); });
  }

  /* ---------------- 登录卡共用：tab 切换 / 用户协议 / 背景图 ---------------- */

  function switchFormTab(which) {
    var card = document.querySelector(".login-card");
    if (!card) return;
    var wrap = card.querySelector(".login-forms");
    var lf = card.querySelector("#loginForm"), rf = card.querySelector("#regForm");
    if ((which === "login" && !lf.hidden) || (which === "register" && !rf.hidden)) return;
    card.querySelectorAll(".login-tab").forEach(function (b) {
      var on = b.getAttribute("data-form") === which;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var fromH = wrap.offsetHeight;
    wrap.style.height = fromH + "px";
    wrap.style.overflow = "hidden";
    lf.hidden = which !== "login";
    rf.hidden = which !== "register";
    var toH = wrap.scrollHeight;                       // 新表单的自然高度
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (Math.abs(toH - fromH) > 1 && !reduce) {
      void wrap.offsetHeight;
      wrap.style.transition = "height 300ms cubic-bezier(0.2, 0.9, 0.3, 1)";
      wrap.style.height = toH + "px";
      var done = function () {
        wrap.style.height = "";
        wrap.style.overflow = "";
        wrap.style.transition = "";
        wrap.removeEventListener("transitionend", done);
      };
      wrap.addEventListener("transitionend", done);
      setTimeout(done, 380);                            // 兜底清理
    } else {
      wrap.style.height = "";
      wrap.style.overflow = "";
    }
    var target = which === "login" ? lf : rf;
    if (!reduce && target.animate) {
      var a = target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "linear" });
      a.finished.then(function () { a.cancel(); }).catch(function () {});
    }
  }

  var AGREEMENT = [
    "1. 本站为黑龙江外国语学院计算机科学与技术专业全栈开发实训课程的教学演示项目，仅用于课程学习与作品展示。",
    "2. 本站所有数据仅保存在您当前浏览器的 localStorage 中，不向任何服务器上传；请勿输入真实密码或您不愿他人看到的敏感信息。",
    "3. 您发布的留言、评论等内容应遵守法律法规与校园文明规范，不得包含违法、暴力、色情或侵犯他人权益的信息。",
    "4. 课程开发小组有权对演示数据做重置与清理，您在演示期间产生的内容可能随时被清除。",
    "5. 随机分配的 8 位展示 ID 与 emoji 头像仅用于演示身份标识，不代表任何真实用户。",
    "6. 勾选同意即表示您已阅读并理解以上内容。如有疑问，请联系课程开发小组。"
  ];

  function agreeOk(errBar) {
    var cb = $("loginAgree");
    if (cb && cb.checked) return true;
    if (errBar) {
      errBar.textContent = t("login.agreeRequired");
      errBar.classList.remove("hint-bar--hidden");
    }
    var row = document.querySelector(".login-agree");
    if (row) {
      row.classList.remove("agree-shake");
      void row.offsetWidth;
      row.classList.add("agree-shake");
    }
    return false;
  }

  function bindTabs() {
    document.querySelectorAll(".login-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        switchFormTab(b.getAttribute("data-form"));
      });
    });
  }

  function bindAgreement() {
    var link = $("agreeLink");
    if (!link) return;
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var box = el("div", "agree-body");
      AGREEMENT.forEach(function (para) { box.appendChild(el("p", null, para)); });
      U.openModal(box, { modalCls: "modal--about" });
    });
  }

  function bindBg() {
    var bg = $("loginBg");
    if (!bg) return;
    var WINTER = [1036, 866, 869, 903, 1044, 1045];            // 冬季景观图集（雪景/冷调，已逐张目检）
    var pre = new Image();
    pre.onload = function () {
      bg.src = pre.src;
      bg.classList.add("is-loaded");                           // 预载完成 → CSS 渐显，不"唰"一下
    };
    pre.onerror = function () { bg.style.display = "none"; }; // 离线/失败：静默回落纯深色底
    pre.src = "https://picsum.photos/id/" + WINTER[Math.floor(Math.random() * WINTER.length)] + "/1920/1080";
  }

  /* ---------------- 共用初始化 ---------------- */

  function init() {
    api.getSession().then(function (resp) {
      var session = resp.data;
      var topbarEl = $("topbar");
      if (topbarEl) C.renderTopbar(topbarEl, null, session);   // 登录页（163 形式）无岛顶栏

      // 无权限态：已登录访问 P-02/P-05 → 跳 P-01（5.12）
      if (session.loggedIn) {
        window.location.href = "index.html";
        return;
      }
      HMB.util.renderDebugPanel();
      initLogin();       // 登录卡双 tab：登录 / 注册（register.html 已并入本页）
      initRegister();
      bindTabs();
      bindAgreement();
      bindBg();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
