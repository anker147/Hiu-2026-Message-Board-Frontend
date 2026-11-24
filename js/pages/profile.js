/* ============================================================
 * 留言板 · 个人中心（编辑资料页，P-06）
 * 形制参照好游快爆「编辑资料」页：面包屑 + 居中白卡（头像相机覆盖 /
 * 昵称 / 个性签名 / 隐私脱敏行）+ 保存 / 取消；下方保留我的留言列表。
 * 数据映射：地区 / 生日 / 性别 / 实名认证 / 社区认证无对应数据，不虚构；
 * 头像映射为 emoji 8 选 1（F1 词库，历史留言保留当时头像快照）。
 * F6 三项独立隐私开关（掩码契约）+ F4 修改昵称（写时快照）。
 * 未登录 → P-05 回跳（5.12）。
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
  var pendingAvatar = null; // 头像选择器暂存（保存时随表单提交）
  var likeIntent = {};

  function init() {
    api.getSession().then(function (resp) {
      session = resp.data;
      C.renderTopbar($("topbar"), "mine", session);   // 个人中心归属"我的"域

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
      bindPrivacy("flagLiked");
      bindPrivacy("flagFavorite");
      bindSave();
      bindCancel();
      bindAvatarPicker();
    });
  }

  function loadProfile() {
    api.getProfile().then(function (resp) {
      if (!resp.success) return;
      profile = resp.data;

      // 头像预览（选择器暂存优先）
      var avWrap = $("profileAvatar");
      avWrap.textContent = "";
      var av = U.avatar(pendingAvatar || profile.avatarEnum);
      av.classList.add("pe-avatar");
      avWrap.appendChild(av);

      $("nicknameInput").value = profile.nickname;
      $("bioInput").value = profile.bio || "";
      // 敏感信息回填（手机号 = 登录账号，只读展示）
      $("realNameInput").value = profile.realName || "";
      $("emailInput").value = profile.email || "";
      $("phoneInput").value = profile.account;

      // F6 掩码预览（列表接口同口径）
      var parts = [];
      if (profile.maskedName) parts.push("姓名 " + profile.maskedName);
      if (profile.maskedEmail) parts.push("邮箱 " + profile.maskedEmail);
      if (profile.maskedPhone) parts.push("手机 " + profile.maskedPhone);
      $("maskedPreview").textContent = parts.length
        ? t("profile.privacyValues") + "：" + parts.join(" · ")
        : t("profile.privacyValues") + "：—" + t("profile.privacyDesc");

      $("flagName").checked = profile.flagName;
      $("flagEmail").checked = profile.flagEmail;
      $("flagPhone").checked = profile.flagPhone;
      $("flagLiked").checked = profile.flagLiked;
      $("flagFavorite").checked = profile.flagFavorite;
    });
  }

  /* ---------------- F6 隐私开关 ---------------- */

  function bindPrivacy(id) {
    $(id).addEventListener("change", function () {
      api.updatePrivacy({
        flagName: $("flagName").checked,
        flagEmail: $("flagEmail").checked,
        flagPhone: $("flagPhone").checked,
        flagLiked: $("flagLiked").checked,
        flagFavorite: $("flagFavorite").checked,
        csrf: session.csrf
      }).then(function (resp) {
        if (resp.code === 401) { C.openGuideModal("privacy"); return; }
        if (resp.success) {
          U.toast(t("toast.privacySaved"), "success");
          loadProfile();  // 掩码预览即时刷新
          loadMine();
        } else {
          U.toast(resp.message, "error");
        }
      });
    });
  }

  /* ---------------- 保存（昵称 / 签名 / 头像 一并提交） ---------------- */

  function bindSave() {
    $("nicknameSaveBtn").addEventListener("click", function () {
      var nick = $("nicknameInput").value.trim();
      if (!nick || nick.length > 20) {
        showErr(t("profile.nicknameTooLong"));
        return;
      }
      var bio = $("bioInput").value.trim();
      if (bio.length > 60) {
        showErr(t("profile.bioTooLong"));
        return;
      }
      showErr("");
      var args = { nickname: nick, bio: bio, csrf: session.csrf };
      if (pendingAvatar !== null) args.avatarEnum = pendingAvatar;

      // 敏感信息客户端校验（邮箱格式）
      var realName = $("realNameInput").value.trim();
      var email = $("emailInput").value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErr(t("profile.emailInvalid"));
        $("emailInput").focus();
        return;
      }

      $("nicknameSaveBtn").disabled = true;
      api.updateNickname(args).then(function (resp) {
        if (resp.code === 401) { C.openGuideModal("nickname"); return; }
        if (!resp.success) {
          $("nicknameSaveBtn").disabled = false;
          showErr(resp.message);
          return;
        }
        // 敏感信息提交（真实姓名/邮箱；手机号只读不提交）
        api.updateSensitive({ realName: realName, email: email, csrf: session.csrf })
          .then(function (resp2) {
            $("nicknameSaveBtn").disabled = false;
            if (resp2.code === 401) { C.openGuideModal("profile"); return; }
            if (resp2.success) U.toast(t("profile.sensitiveSaved"), "success");
            else if (resp2.code !== 9001) U.toast(resp2.message, "error");
            U.toast(t("toast.nicknameSaved"), "success");
            loadProfile();   // 掩码预览即时刷新（F6 出口脱敏）
            loadMine();
            api.getSession().then(function (r) {
              session = r.data;
              C.renderTopbar($("topbar"), "mine", session);  // 身份胶囊同步新头像/昵称
            });
          });
      });
    });
  }

  /* ---------------- 取消（映射参考：回个人主页） ---------------- */

  function bindCancel() {
    $("cancelBtn").addEventListener("click", function () {
      var target = profile ? "zone.html?u=" + encodeURIComponent(profile.displayId) : "index.html";
      window.location.href = target;
    });
  }

  /* ---------------- 头像选择器（emoji 8 选 1，F1 词库） ---------------- */

  function bindAvatarPicker() {
    $("avatarCamBtn").addEventListener("click", function () {
      var content = el("div");
      var title = el("h3", "modal-title");
      title.setAttribute("data-text", "profile.avatarTitle");
      content.appendChild(title);
      var grid = el("div", "pe-avatar-grid");
      HMB.SEED.AVATARS.forEach(function (em, i) {
        var active = pendingAvatar === i + 1 ||
          (pendingAvatar === null && profile && profile.avatarEnum === i + 1);
        var opt = el("button", "pe-avatar-opt" + (active ? " is-active" : ""), em);
        opt.type = "button";
        opt.title = em;
        opt.addEventListener("click", function () {
          pendingAvatar = i + 1;
          modal.close();
          loadProfile();          // 预览即时切换（保存时提交）
        });
        grid.appendChild(opt);
      });
      content.appendChild(grid);
      HMB.i18n.apply(content);
      var modal = U.openModal(content, { modalCls: "pe-avatar-modal" });
    });
  }

  function showErr(msg) {
    var err = $("nicknameErr");
    err.textContent = msg;
    err.classList.toggle("is-visible", !!msg);
  }

  /* ---------------- 我的留言（属主改删入口） ---------------- */

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
          onBtn: function () { window.location.href = "edit.html?mode=new"; }
        });
        return;
      }
      resp.data.list.forEach(function (m) {
        var item = el("div", "mymsg-item");
        item.dataset.id = m.resourceId;

        var content = el("div", "mymsg-content");
        // 有选填标题时列表优先展示标题（与榜单卡口径一致）
        content.textContent = (m.title ? m.title + "： " : "") + U.richTextToPlain(m.content) + (m.topicTag ? "  #" + m.topicTag : "");
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
          // 帖子走整页编辑器（新建/编辑统一入口）；删除仍用 P-08 确认弹窗
          window.location.href = "edit.html?id=" + encodeURIComponent(m.resourceId);
        });
        var delBtn = el("button", "btn btn--ghost btn--sm");
        delBtn.type = "button";
        delBtn.setAttribute("data-text", "detail.delete");
        delBtn.addEventListener("click", function () {
          C.openConfirmModal({
            titleKey: "confirm.deleteTitle",
            warnKey: "confirm.deleteWarn",
            preview: U.richTextToPlain(m.content),
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
