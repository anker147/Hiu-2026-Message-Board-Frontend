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

  /* ---------------- 共用初始化 ---------------- */

  function init() {
    api.getSession().then(function (resp) {
      var session = resp.data;
      C.renderTopbar($("topbar"), null, session);

      // 无权限态：已登录访问 P-02/P-05 → 跳 P-01（5.12）
      if (session.loggedIn) {
        window.location.href = "index.html";
        return;
      }
      HMB.util.renderDebugPanel();
      if (page === "login") initLogin();
      else initRegister();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
