/* ============================================================
 * 留言板 · 个人中心页（P-06）
 * F6 三项独立隐私开关（掩码契约演示）+ F4 修改昵称（写时快照）
 * + 我的留言（属主改删入口）。未登录 → P-05 回跳（5.12）。
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB;
  var U = HMB.util;
  var C = HMB.components;
  var api = HMB.api;
  var t = function (k, p) { return HMB.i18n.t(k, p); };
  var el = U.el;
  var $ = function (id) { return document.getElementById(id); };

  var session = { loggedIn: false };
  var profile = null;
  var likeIntent = {};

  function init() {
    api.getSession().then(function (resp) {
      session = resp.data;
      C.renderTopbar($("topbar"), "mine", session);   // 个人中心归属"我的"域：当前项胶囊落在我的留言

      // 无权限态：未登录 → P-05，登录后回 P-06（流程 A/5.12）
      if (!session.loggedIn) {
        C.saveReturnPoint({ source: "profile" });
        window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
        return;
      }

      HMB.util.renderDebugPanel();
      loadProfile();
      loadMine();

      bindPrivacy("flagName");
      bindPrivacy("flagEmail");
      bindPrivacy("flagPhone");
      bindNickname();
    });
  }

  function loadProfile() {
    api.getProfile().then(function (resp) {
      if (!resp.success) return;
      profile = resp.data;

      var avWrap = $("profileAvatar");
      avWrap.textContent = "";
      var av = U.avatar(profile.avatarEnum);
      av.classList.add("profile-avatar");
      avWrap.appendChild(av);

      $("profileName").textContent = profile.nickname;
      $("profileDid").textContent = t("profile.displayId") + " " + profile.displayId;

      // 本人完整信息仅 API-08 可见（PRD F6）
      $("valName").textContent = profile.realName || "—";
      $("valEmail").textContent = profile.email || "—";
      $("valPhone").textContent = profile.account;
      $("nicknameInput").value = profile.nickname;

      $("flagName").checked = profile.flagName;
      $("flagEmail").checked = profile.flagEmail;
      $("flagPhone").checked = profile.flagPhone;
    });
  }

  /* ---------------- F6 隐私开关 ---------------- */

  function bindPrivacy(id) {
    $(id).addEventListener("change", function () {
      api.updatePrivacy({
        flagName: $("flagName").checked,
        flagEmail: $("flagEmail").checked,
        flagPhone: $("flagPhone").checked,
        csrf: session.csrf
      }).then(function (resp) {
        if (resp.code === 401) { C.openGuideModal("privacy"); return; }
        if (resp.success) {
          U.toast(t("toast.privacySaved"), "success");
          loadProfile();
          loadMine(); // 列表侧掩码即时刷新
        } else {
          U.toast(resp.message, "error");
        }
      });
    });
  }

  /* ---------------- F4 修改昵称（写时快照） ---------------- */

  function bindNickname() {
    var toggleBtn = $("nicknameToggleBtn");
    var saveBtn = $("nicknameSaveBtn");
    var editor = $("nicknameEditor");
    var input = $("nicknameInput");
    var err = $("nicknameErr");

    toggleBtn.addEventListener("click", function () {
      editor.hidden = !editor.hidden;
      if (!editor.hidden) {
        saveBtn.hidden = false;
        input.focus();
      } else {
        saveBtn.hidden = true;
        err.classList.remove("is-visible");
      }
    });

    saveBtn.addEventListener("click", function () {
      var nick = input.value.trim();
      if (!nick || nick.length > 20) {
        err.textContent = t("profile.nicknameTooLong");
        err.classList.add("is-visible");
        input.focus();
        return;
      }
      err.classList.remove("is-visible");
      saveBtn.disabled = true;
      api.updateNickname({ nickname: nick, csrf: session.csrf }).then(function (resp) {
        saveBtn.disabled = false;
        if (resp.code === 401) { C.openGuideModal("nickname"); return; }
        if (resp.success) {
          U.toast(t("toast.nicknameSaved"), "success");
          editor.hidden = true;
          saveBtn.hidden = true;
          loadProfile();
          loadMine();
          api.getSession().then(function (r) {
            session = r.data;
            C.renderTopbar($("topbar"), "mine", session);   // 个人中心归属"我的"域：当前项胶囊落在我的留言
          });
        } else {
          err.textContent = resp.message;
          err.classList.add("is-visible");
        }
      });
    });
  }

  /* ---------------- 我的留言 ---------------- */

  function loadMine() {
    var list = $("mineList");
    list.textContent = "";
    api.getMessages({ tab: "mine", sort: "latest" }).then(function (resp) {
      if (!resp.success) {
        C.renderStateBox(list, {
          emoji: "⚠️",
          titleKey: "board.stateErrorTitle",
          descKey: "board.stateErrorDesc",
          btnKey: "common.retry",
          onBtn: loadMine
        });
        return;
      }
      if (resp.data.list.length === 0) {
        C.renderStateBox(list, {
          emoji: "✏️",
          titleKey: "profile.emptyTitle",
          descKey: "profile.emptyDesc",
          btnKey: "profile.emptyBtn",
          onBtn: function () { window.location.href = "index.html"; }
        });
        return;
      }
      resp.data.list.forEach(function (m) {
        var item = el("div", "mymsg-item");
        item.dataset.id = m.resourceId;

        var content = el("div", "mymsg-content");
        content.textContent = m.content + (m.topicTag ? "  #" + m.topicTag : "");
        content.tabIndex = 0;
        content.setAttribute("role", "link");
        content.addEventListener("click", function () {
          window.location.href = "detail.html?id=" + encodeURIComponent(m.resourceId);
        });
        item.appendChild(content);

        item.appendChild(el("div", "mymsg-stats",
          t("common.statViews") + " " + U.fmtViews(m.stats.views) + "  " +
          t("common.likes") + " " + U.fmtViews(m.stats.likes)));

        var actions = el("div", "owner-actions");
        var editBtn = el("button", "btn btn--soft btn--sm");
        editBtn.type = "button";
        editBtn.setAttribute("data-text", "detail.edit");
        editBtn.addEventListener("click", function () {
          C.openEditModal({
            initial: m.content,
            onSave: function (value, done) {
              api.updateContent({ resourceId: m.resourceId, content: value, csrf: session.csrf })
                .then(function (r) {
                  done(r);
                  if (r.success) { U.toast(t("edit.successToast"), "success"); loadMine(); }
                });
            }
          });
        });
        var delBtn = el("button", "btn btn--ghost btn--sm");
        delBtn.type = "button";
        delBtn.setAttribute("data-text", "detail.delete");
        delBtn.addEventListener("click", function () {
          C.openConfirmModal({
            titleKey: "confirm.deleteTitle",
            warnKey: "confirm.deleteWarn",
            preview: m.content,
            note: t("confirm.ownerNote"),
            onConfirm: function () {
              api.deleteContent({ resourceId: m.resourceId, csrf: session.csrf }).then(function (r) {
                if (r.success) {
                  U.toast(t("confirm.deleteSuccess"), "success");
                  loadMine();
                } else if (r.code === 401) {
                  C.openGuideModal("delete");
                } else {
                  U.toast(r.message, "error");
                }
              });
            }
          });
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(actions);

        list.appendChild(item);
      });
      HMB.i18n.apply(list);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
