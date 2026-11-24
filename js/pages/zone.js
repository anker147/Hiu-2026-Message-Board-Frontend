/* ============================================================
 * 留言板 · 个人主页（参照好游快爆 zone/user 页设计）
 * ------------------------------------------------------------
 * 参考映射（www.3839.com/zone/user/157978：头部资料 + 动态 tab + 侧栏）：
 *  - 头部：头像/昵称/认证/ID/签名/关注·粉丝 → emoji 头像 + 昵称 + 展示 ID +
 *    签名（bio，个人中心可编辑）；统计行映射为 留言 / 评论 / 收到赞
 *    （不虚构关注关系与关注按钮）
 *  - 动态 tab（动态/游戏/游戏单 + 全部/评价/帖子/回复计数）→ 动态域子筛选
 *    全部 N / 留言 N / 评论 N
 *  - 动态流（TA发表的帖子 / TA回复的帖子引用卡）→ 留言项 / 评论项（引用原帖）
 *  - 关于我（爆龄）→ 加入留言板 N 天；游戏生涯 → 留言生涯三统计；
 *    关注论坛（xx讨论）→ 话题足迹（话题 + 条数）；勋章体系不设
 * 寻址：zone.html?u=<展示ID>（参照 zone/user/157978），访客可看。
 * 红线：匿名（盲盒）回复绝不出现在作者主页（接口层过滤，F9/D-02）；
 * 掩码字段仅本人开关开启时返回（F6）；仅自己可见内容对他人不可见。
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
  var zone = null;        // getZone 返回的聚合数据
  var zoneDomain = "feed"; // feed / liked / favorite（主 tab）
  var feedFilter = "all"; // all / messages / comments（子筛选）

  function qsUser() {
    var m = window.location.search.match(/[?&]u=([^&#]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function detailHref(messageId) {
    return "detail.html?id=" + encodeURIComponent(messageId);
  }

  /* ---------------- 页面级状态盒 ---------------- */

  function renderState(spec) {
    $("zoneHero").hidden = true;
    $("zoneGrid").hidden = true;
    C.renderStateBox($("zoneArea"), spec);
  }

  function renderNoId() {
    renderState({
      emoji: "🧭",
      titleKey: "zone.needIdTitle",
      descKey: "zone.needIdDesc",
      btnKey: "editPage.goPublish",
      onBtn: function () { window.location.href = "edit.html?mode=new"; }
    });
  }

  function renderNotFound() {
    renderState({
      emoji: "📭",
      titleKey: "zone.userNotFound",
      descKey: "error.5001",
      btnKey: "common.backHome",
      onBtn: function () { window.location.href = "index.html"; }
    });
  }

  /* ---------------- 头部资料区 ---------------- */

  function renderHero() {
    var u = zone.user;
    var hero = $("zoneHero");
    hero.textContent = "";

    var av = U.avatar(u.avatarEnum);
    av.classList.add("zone-avatar");
    hero.appendChild(av);

    var main = el("div", "zone-hero-main");

    var nameRow = el("div", "zone-name-row");
    nameRow.appendChild(el("span", "zone-name", u.nickname));
    nameRow.appendChild(el("span", "zone-id-chip", "ID " + u.displayId));
    if (zone.isSelf) {
      var selfChip = el("span", "zone-self-chip");
      selfChip.setAttribute("data-text", "zone.selfChip");
      nameRow.appendChild(selfChip);
    }
    main.appendChild(nameRow);

    var bio = el("div", "zone-bio" + (u.bio ? "" : " is-empty"),
      u.bio || t("zone.bioEmpty"));
    main.appendChild(bio);

    var chips = el("div", "zone-meta-chips");
    chips.appendChild(el("span", "zone-meta-chip",
      t("zone.memberDays", { n: zone.memberDays })));
    chips.appendChild(el("span", "zone-meta-chip",
      t("zone.joinedAt", { date: U.fmtDate(u.createdAt) })));
    // F6：仅本人开关开启时展示对应掩码
    if (u.maskedName) chips.appendChild(el("span", "zone-meta-chip", t("zone.maskedChip", { v: u.maskedName })));
    if (u.maskedEmail) chips.appendChild(el("span", "zone-meta-chip", t("profile.email") + " " + u.maskedEmail));
    if (u.maskedPhone) chips.appendChild(el("span", "zone-meta-chip", t("profile.phone") + " " + u.maskedPhone));
    main.appendChild(chips);
    hero.appendChild(main);

    // 右侧：统计数字块（映射参考站「49关注 183粉丝」位）+ 本人操作
    var side = el("div", "zone-hero-side");
    var stats = el("div", "zone-stats");
    [
      { num: zone.stats.messages, key: "zone.statMessages" },
      { num: zone.stats.comments, key: "zone.statComments" },
      { num: zone.stats.likesReceived, key: "zone.statLikes" }
    ].forEach(function (s) {
      var box = el("div", "zone-stat");
      box.appendChild(el("div", "zone-stat-num", U.fmtViews(s.num)));
      var label = el("div", "zone-stat-label");
      label.setAttribute("data-text", s.key);
      box.appendChild(label);
      stats.appendChild(box);
    });
    side.appendChild(stats);
    if (zone.isSelf) {
      var editBtn = el("button", "btn btn--soft btn--sm");
      editBtn.type = "button";
      editBtn.setAttribute("data-text", "zone.editProfile");
      editBtn.addEventListener("click", function () {
        window.location.href = "profile.html";
      });
      side.appendChild(editBtn);
    }
    hero.appendChild(side);

    hero.hidden = false;
    HMB.i18n.apply(hero);
    document.title = t("zone.of", { name: u.nickname }) + " · 留言板";
  }

  /* ---------------- 动态流（留言 + 评论合并，时间倒序） ---------------- */

  /** 当前主 tab 的数据源：动态 / 我赞过的 / 我收藏的（帖子 + 评论） */
  function domainData() {
    if (zoneDomain === "liked") return zone.liked || { posts: [], comments: [] };
    if (zoneDomain === "favorite") return zone.favorite || { posts: [], comments: [] };
    return { posts: zone.messages || [], comments: zone.comments || [] };
  }

  function buildFeed() {
    var data = domainData();
    var items = [];
    data.posts.forEach(function (m) {
      items.push({ kind: "post", ts: m.createdAt, msg: m });
    });
    data.comments.forEach(function (c) {
      items.push({ kind: "reply", ts: c.createdAt, c: c });
    });
    items.sort(function (a, b) { return b.ts - a.ts; });
    return items;
  }

  /** 主 tab：互动域按隐私开关出现（本人始终可见） */
  function renderMainTabs() {
    var box = $("zoneMainTabs");
    box.textContent = "";
    var defs = [{ key: "feed", label: "zone.maintabFeed" }];
    if (zone.canSeeLiked) defs.push({ key: "liked", label: "zone.maintabLiked" });
    if (zone.canSeeFavorite) defs.push({ key: "favorite", label: "zone.maintabFavorite" });
    defs.forEach(function (d) {
      var b = el("button", "zone-maintab" + (zoneDomain === d.key ? " is-active" : ""));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", zoneDomain === d.key ? "true" : "false");
      var label = el("span");
      label.setAttribute("data-text", d.label);
      b.appendChild(label);
      b.addEventListener("click", function () {
        if (zoneDomain === d.key) return;
        zoneDomain = d.key;
        feedFilter = "all";
        renderMainTabs();
        renderTabs();
        renderFeed();
      });
      box.appendChild(b);
    });
    HMB.i18n.apply(box);
  }

  function renderTabs() {
    var tabs = $("zoneTabs");
    tabs.textContent = "";
    var data = domainData();
    [
      { key: "all", label: "zone.tabAll", n: data.posts.length + data.comments.length },
      { key: "messages", label: "zone.tabMessages", n: data.posts.length },
      { key: "comments", label: "zone.tabComments", n: data.comments.length }
    ].forEach(function (d) {
      var tab = el("button", "zone-tab" + (feedFilter === d.key ? " is-active" : ""));
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", feedFilter === d.key ? "true" : "false");
      tab.appendChild(el("span", null, t(d.label)));
      tab.appendChild(el("span", "n", String(d.n)));
      tab.addEventListener("click", function () {
        if (feedFilter === d.key) return;
        feedFilter = d.key;
        renderTabs();
        renderFeed();
      });
      tabs.appendChild(tab);
    });
  }

  function openDetail(href) {
    window.location.href = href;
  }

  function renderPostItem(m) {
    var item = el("article", "zone-item");
    var head = el("div", "zone-item-head");
    var av = U.avatar(m.avatarEnum, "avatar--sm");
    av.style.width = "30px"; av.style.height = "30px"; av.style.fontSize = "16px";
    head.appendChild(av);
    head.appendChild(el("span", "zone-item-author", "@" + m.nicknameSnapshot));
    var type = el("span", "zone-item-type");
    type.setAttribute("data-text", "zone.typePost");
    head.appendChild(type);
    if (m.isPublic === false) {
      // 仅自己可见徽标：本人主页可见，他人视图不返回
      var priv = el("span", "rank-badge rank-badge--flat");
      priv.setAttribute("data-text", "common.private");
      head.appendChild(priv);
    }
    if (m.edited) head.appendChild(el("span", "edited-mark", t("common.edited")));
    head.appendChild(el("span", "zone-item-time", U.timeAgo(m.createdAt)));
    item.appendChild(head);

    var content = el("div", "zone-item-content");
    if (m.title) {
      content.appendChild(el("b", null, m.title + "  "));
    }
    content.appendChild(document.createTextNode(U.richTextToPlain(m.content)));
    content.tabIndex = 0;
    content.setAttribute("role", "link");
    content.addEventListener("click", function () { openDetail(detailHref(m.resourceId)); });
    content.addEventListener("keydown", function (e) {
      if (e.key === "Enter") openDetail(detailHref(m.resourceId));
    });
    item.appendChild(content);

    var statsRow = el("div", "zone-item-stats");
    statsRow.appendChild(el("span", null,
      t("common.statViews") + " " + U.fmtViews(m.stats.views)));
    statsRow.appendChild(el("span", null,
      t("common.likes") + " " + U.fmtViews(m.stats.likes)));
    statsRow.appendChild(el("span", null,
      t("common.statComments") + " " + U.fmtViews(m.stats.comments)));
    if (m.topicTag) statsRow.appendChild(el("span", "zone-topic-chip", "#" + m.topicTag));
    item.appendChild(statsRow);
    return item;
  }

  function renderReplyItem(c) {
    var item = el("article", "zone-item");
    var head = el("div", "zone-item-head");
    var av = U.avatar(zone.user.avatarEnum, "avatar--sm");
    av.style.width = "30px"; av.style.height = "30px"; av.style.fontSize = "16px";
    head.appendChild(av);
    head.appendChild(el("span", "zone-item-author", "@" + zone.user.nickname));
    var type = el("span", "zone-item-type");
    type.setAttribute("data-text", "zone.typeReply");
    head.appendChild(type);
    if (c.edited) head.appendChild(el("span", "edited-mark", t("common.edited")));
    head.appendChild(el("span", "zone-item-time", U.timeAgo(c.createdAt)));
    item.appendChild(head);

    var content = el("div", "zone-item-content");
    content.textContent = c.content;
    content.tabIndex = 0;
    content.setAttribute("role", "link");
    content.addEventListener("click", function () { openDetail(detailHref(c.messageId)); });
    content.addEventListener("keydown", function (e) {
      if (e.key === "Enter") openDetail(detailHref(c.messageId));
    });
    item.appendChild(content);

    // 引用条（映射参考站浅灰底原帖条：缩略方块 + 标题/摘要单行 + 来自话题）
    var quote = el("div", "zone-quote");
    quote.tabIndex = 0;
    quote.setAttribute("role", "link");
    quote.addEventListener("click", function () { openDetail(detailHref(c.messageId)); });
    quote.addEventListener("keydown", function (e) {
      if (e.key === "Enter") openDetail(detailHref(c.messageId));
    });
    var qav = U.avatar(null, "avatar--sm zone-quote-avatar");
    qav.textContent = "📝";
    quote.appendChild(qav);
    var qmain = el("div", "zone-quote-main");
    qmain.appendChild(el("div", "zone-quote-content", c.message.title || c.message.content));
    var qmeta = el("div", "zone-quote-meta");
    if (c.message.topicTag) {
      qmeta.appendChild(el("span", "topic", t("zone.quoteFrom", { topic: c.message.topicTag })));
      qmeta.appendChild(document.createTextNode(" · @" + c.message.nicknameSnapshot));
    } else {
      qmeta.appendChild(document.createTextNode("@" + c.message.nicknameSnapshot));
    }
    qmain.appendChild(qmeta);
    quote.appendChild(qmain);
    item.appendChild(quote);

    var statsRow = el("div", "zone-item-stats");
    statsRow.appendChild(el("span", null, t("common.likes") + " " + (c.likes || 0)));
    item.appendChild(statsRow);
    return item;
  }

  function renderFeed() {
    var feed = $("zoneFeed");
    feed.textContent = "";
    var items = buildFeed().filter(function (it) {
      if (feedFilter === "messages") return it.kind === "post";
      if (feedFilter === "comments") return it.kind === "reply";
      return true;
    });
    if (items.length === 0) {
      C.renderStateBox(feed, {
        emoji: "🌤️",
        titleKey: zoneDomain === "liked" ? "zone.emptyLikedTitle"
          : zoneDomain === "favorite" ? "zone.emptyFavoriteTitle" : "zone.emptyTitle",
        descKey: zoneDomain === "liked" ? "zone.emptyLikedDesc"
          : zoneDomain === "favorite" ? "zone.emptyFavoriteDesc" : "zone.emptyDesc"
      });
      return;
    }
    items.forEach(function (it) {
      feed.appendChild(it.kind === "post" ? renderPostItem(it.msg) : renderReplyItem(it.c));
    });
    HMB.i18n.apply(feed);
  }

  /* ---------------- 侧栏（关于 / 留言生涯 / 话题足迹） ---------------- */

  function sideRow(kText, vText) {
    var row = el("div", "zone-about-row");
    row.appendChild(el("span", "k", kText));
    row.appendChild(el("span", "v", vText));
    return row;
  }

  function renderSide() {
    var side = $("zoneSide");
    side.textContent = "";

    /* 关于 TA（映射参考站「关于我」：爆龄 → 加入天数） */
    var about = el("div", "zone-side-card");
    about.appendChild(el("div", "zone-side-title", t("zone.aboutTitle")));
    about.appendChild(sideRow(t("zone.aboutId"), zone.user.displayId));
    about.appendChild(sideRow(t("zone.aboutDays"), String(zone.memberDays)));
    about.appendChild(sideRow(t("zone.aboutJoined"), U.fmtDate(zone.user.createdAt)));
    side.appendChild(about);

    /* 留言足迹：一个主数字 + 三项明细，弱化为卡片式数据展示 */
    var career = el("div", "zone-side-card zone-career-card");
    var careerHead = el("div", "zone-career-head");
    careerHead.appendChild(el("div", "zone-side-title", t("zone.careerTitle")));
    var since = el("span", "zone-career-since");
    since.setAttribute("data-text", "zone.careerSince");
    careerHead.appendChild(since);
    career.appendChild(careerHead);

    var hero = el("div", "zone-career-hero");
    var heroMain = el("div", "zone-career-main");
    heroMain.appendChild(el("div", "zone-career-hero-num", U.fmtViews(zone.stats.messages)));
    var heroLabel = el("div", "zone-career-hero-label");
    heroLabel.setAttribute("data-text", "zone.careerMessages");
    heroMain.appendChild(heroLabel);
    hero.appendChild(heroMain);
    hero.appendChild(el("div", "zone-career-hero-mark", "✍️"));
    career.appendChild(hero);

    var metrics = el("div", "zone-career-metrics");
    [
      { key: "zone.careerComments", num: zone.stats.comments, icon: "💬", cls: "violet" },
      { key: "zone.careerLikes", num: zone.stats.likesReceived, icon: "❤️", cls: "rose" },
      { key: "zone.aboutDays", num: zone.memberDays, icon: "📅", cls: "amber" }
    ].forEach(function (d) {
      var m = el("div", "zone-career-metric zone-career-metric--" + d.cls);
      var top = el("div", "zone-career-metric-top");
      top.appendChild(el("span", "zone-career-metric-icon", d.icon));
      top.appendChild(el("span", "zone-career-metric-num", U.fmtViews(d.num)));
      m.appendChild(top);
      var lb = el("div", "zone-career-metric-label");
      lb.setAttribute("data-text", d.key);
      m.appendChild(lb);
      m.appendChild(el("div", "zone-career-metric-bar"));
      metrics.appendChild(m);
    });
    career.appendChild(metrics);
    side.appendChild(career);

    /* 我送出的盲盒祝福：仅本人可见，他人访问不渲染这一卡 */
    if (zone.isSelf) {
      var bb = el("div", "zone-side-card zone-blindbox-card");
      var bbHead = el("div", "zone-blindbox-head");
      bbHead.appendChild(el("span", "zone-blindbox-emoji", "🎁"));
      var bbTitle = el("div", "zone-side-title");
      bbTitle.setAttribute("data-text", "zone.blindboxTitle");
      bbHead.appendChild(bbTitle);
      bb.appendChild(bbHead);

      var bbDesc = el("div", "zone-blindbox-desc");
      bbDesc.setAttribute("data-text", "zone.blindboxDesc");
      bb.appendChild(bbDesc);

      var bbList = zone.blindboxMessages || [];
      if (!bbList.length) {
        var empty = el("div", "zone-blindbox-empty");
        empty.setAttribute("data-text", "zone.blindboxEmpty");
        bb.appendChild(empty);
      } else {
        bbList.slice(0, 5).forEach(function (item) {
          var row = el("a", "zone-blindbox-item");
          row.href = detailHref(item.target.resourceId);
          var tgt = el("div", "zone-bb-target");
          tgt.appendChild(el("span", "zone-bb-label", t("zone.blindboxTarget")));
          tgt.appendChild(el("span", "zone-bb-title", item.target.title || item.target.excerpt));
          row.appendChild(tgt);
          row.appendChild(el("div", "zone-bb-quote", item.content));
          row.appendChild(el("div", "zone-bb-date", U.fmtDate(item.createdAt)));
          bb.appendChild(row);
        });
      }
      side.appendChild(bb);
    }

    /* 话题足迹（映射「关注论坛」卡：话题 + 条数；无话题时不渲染空卡） */
    if (zone.topics.length > 0) {
      var topics = el("div", "zone-side-card");
      topics.appendChild(el("div", "zone-side-title", t("zone.topicsTitle")));
      zone.topics.forEach(function (tp) {
        var row = el("div", "zone-topic-row");
        row.appendChild(el("span", "tag", "#" + tp.tag));
        row.appendChild(el("span", "c", t("zone.topicsUnit", { n: tp.count })));
        topics.appendChild(row);
      });
      side.appendChild(topics);
    }

    HMB.i18n.apply(side);
  }

  /* ---------------- 入口 ---------------- */

  function init() {
    var displayId = qsUser();
    api.getSession().then(function (resp) {
      session = resp.data;
      C.renderTopbar(document.getElementById("topbar"), null, session);
      HMB.util.renderDebugPanel();

      if (!displayId) return renderNoId();
      C.renderSkeleton($("zoneArea"), 2);
      api.getZone({ displayId: displayId }).then(function (r) {
        if (!r.success) return renderNotFound();
        zone = r.data;
        $("zoneArea").textContent = "";
        $("zoneArea").hidden = true;
        renderHero();
        renderMainTabs();
        renderTabs();
        renderFeed();
        renderSide();
        $("zoneGrid").hidden = false;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
