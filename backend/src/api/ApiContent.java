package api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import util.ApiErr;
import util.ApiReq;
import util.ApiResp;
import util.Json;
import util.JsonUtil;
import util.Sec;
import util.TokenAuth;
import dao.ApiCommentDao;
import dao.ApiMessageDao;
import dao.ApiUserDao;

/**
 * ============================================================
 *  ApiContent —— 留言 + 评论 + 盲盒业务（API-04~06/07/09/11/12）
 * ------------------------------------------------------------
 *  getMessages   GET  /api/messages                留言列表（tab/q/period）
 *  getMessage    GET  /api/messages/{rid}          留言详情（浏览 +1）
 *  postMessage   POST /api/messages                 发布留言（敏感词+限流）
 *  getComments   GET  /api/messages/{rid}/comments  两级评论树
 *  postComment   POST /api/messages/{rid}/comments  发一级评论
 *  postReply     POST /api/replies                  发二级回复
 *  updateContent PUT  /api/content/{rid}            编辑留言或评论
 *  deleteContent DEL  /api/content/{rid}            删除留言或评论（级联）
 *  getBlindbox   GET  /api/blindbox                 随机捞一条他人留言
 *  blindboxReply POST /api/blindbox/reply           匿名回复盲盒（真实身份留痕）
 * ============================================================
 */
public class ApiContent {

	/** 限流：10 秒滑窗（与前端 mock 的 RATE_WINDOW 一致） */
	private static final long RATE_WINDOW = 10 * 1000L;

	/** 限流：滑窗内最多 3 次 */
	private static final int RATE_LIMIT = 3;

	/* ================= 留言列表 / 详情 ================= */

	/**
	 * 留言列表。查询参数：
	 * tab=mine（我的留言，必须登录）/ hot（热度周榜，period 上限过滤）/ 其它（全部）；
	 * q 搜索词；period 期次号。
	 * 返回 {list:[...], total:n, likedIds:[...]}。
	 */
	public static String getMessages(ApiReq q) {
		TokenAuth.Session s = TokenAuth.find(q.bearer(), true); // 访客可为 null
		String tab = q.pTrim("tab");
		if ("mine".equals(tab) && s == null) {
			throw new ApiErr(ApiResp.UNAUTHORIZED); // “我的留言”必须登录 → 401
		}
		ApiMessageDao dao = new ApiMessageDao();
		List all = dao.listAll();
		String qs = q.pTrim("q");
		if (qs != null) {
			qs = qs.toLowerCase();
		}
		String periodStr = q.pTrim("period");
		Long period = null;
		if (periodStr != null && periodStr.length() > 0) {
			try {
				period = Long.valueOf(Long.parseLong(periodStr));
			} catch (NumberFormatException e) {
				period = null; // 非数字忽略，不报错
			}
		}
		// 1.逐条过滤（可见性 / 归属 / 期次 / 搜索词），规则与前端 mock 完全一致
		List out = new ArrayList();
		for (int i = 0; i < all.size(); i++) {
			Map m = (Map) all.get(i);
			long owner = Sec.longOf(m, "owner_id", -1);
			boolean mine = s != null && s.userId == owner;
			// 私密帖（isPublic=0）：只有作者能在列表里看到
			if (Sec.intOf(m, "is_public", 1) == 0 && !mine) {
				continue;
			}
			// GM 隐藏帖：公开视图排除；作者本人的“我的留言”里保留
			boolean hidden = Sec.intOf(m, "hidden", 0) == 1;
			if (hidden && !("mine".equals(tab) && mine)) {
				continue;
			}
			// tab=mine：只看自己的
			if ("mine".equals(tab) && !mine) {
				continue;
			}
			// 期次过滤：hot 榜取“截至所选期次”（period <= 选中值）；其它视图取相等
			if (period != null) {
				long mp = Sec.intOf(m, "period", 24);
				if ("hot".equals(tab) ? mp > period.longValue() : mp != period.longValue()) {
					continue;
				}
			}
			// 搜索：按“用户看到的文字”匹配（标题+正文纯文本+昵称+话题+编号）
			if (qs != null && qs.length() > 0) {
				String hay = (Sec.strOf(m, "title") + " " + Sec.plainContent(Sec.strOf(m, "content"))
						+ " " + Sec.strOf(m, "nickname_snapshot") + " "
						+ Sec.strOf(m, "topic_tag") + " " + Sec.strOf(m, "resource_id") + " "
						+ Sec.strOf(m, "display_id")).toLowerCase();
				if (hay.indexOf(qs) < 0) {
					continue;
				}
			}
			out.add(ApiOut.message(m));
		}
		// 2.当前登录人赞过的目标 id（详情卡点亮爱心用）
		StringBuffer ids = new StringBuffer("[");
		if (s != null) {
			List liked = dao.likeIdsOf(s.userId);
			for (int i = 0; i < liked.size(); i++) {
				if (i > 0) {
					ids.append(',');
				}
				ids.append('"').append(JsonUtil.esc((String) liked.get(i))).append('"');
			}
		}
		ids.append(']');
		// 3.组装
		StringBuffer sb = new StringBuffer("{\"list\":[");
		for (int i = 0; i < out.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append((String) out.get(i));
		}
		sb.append("],\"total\":").append(out.size())
				.append(",\"likedIds\":").append(ids).append('}');
		return sb.toString();
	}

	/**
	 * 留言详情。浏览量 +1（best-effort）；
	 * 私密帖 / 隐藏帖被他人直接访问 → 5001（对外表现为“不存在”）。
	 * 返回列表出口字段 + isMine/isLiked/isFavorite。
	 */
	public static String getMessage(String rid, ApiReq q) {
		ApiMessageDao dao = new ApiMessageDao();
		Map m = dao.find(rid);
		if (m == null) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		TokenAuth.Session s = TokenAuth.find(q.bearer(), true);
		boolean mine = s != null && s.userId == Sec.longOf(m, "owner_id", -1);
		if (Sec.intOf(m, "is_public", 1) == 0 && !mine) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		if (Sec.intOf(m, "hidden", 0) == 1 && !mine) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		dao.addView(rid); // 浏览 +1
		return ApiOut.messageDetail(m, s, dao);
	}

	/**
	 * 发布留言。安检门：敏感词（4001）+ 限流（4002 带剩余秒数）。
	 * F4：本次填的昵称顺带更新当前昵称，历史留言保留快照。
	 */
	public static String postMessage(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q); // 登录 + CSRF
		ApiUserDao udao = new ApiUserDao();
		Map user = udao.findById(s.userId);
		TokenAuth.muteGate(user); // 禁言 → 6004
		// 1.正文：按纯文本计字数，1~500 → 9001
		String content = q.p("content") == null ? "" : q.p("content").trim();
		String plain = Sec.plainContent(content);
		if (plain.length() == 0 || plain.length() > 500) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		// 2.选填标题 ≤48 字
		String title = q.pTrim("title");
		if (title != null && title.length() > 48) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		// 3.安检门：敏感词（正文+标题一起查）→ 限流
		securityGate(s.userId, plain + " " + (title == null ? "" : title), true);
		// 4.F4 昵称顺带更新
		String nick = q.pTrim("nickname");
		applyNickname(udao, user, nick);
		// 5.图片/封面引用校验（localimg:// 白名单）
		String imagesJson = Sec.sanitizeImagesJson(q.p("images"));
		String coverUrl = Sec.sanitizeRef(q.p("coverUrl"));
		boolean coverFromFirst = "true".equalsIgnoreCase(q.p("coverFromFirst"));
		// 6.话题白名单校验（非法话题按空处理，不拦人）
		String topic = q.pTrim("topic");
		if (topic != null && !inTopics(topic)) {
			topic = "";
		}
		// 7.落库（新帖归属当前期次 = settings.current_period）
		ApiMessageDao dao = new ApiMessageDao();
		Map settings = dao.settings();
		int period = settings == null ? 24 : Sec.intOf(settings, "current_period", 24);
		String rid = Sec.newId();
		dao.insert(rid, Sec.randHex(8), s.userId, title == null ? "" : title, content,
				nick != null && nick.length() > 0 ? nick : Sec.strOf(user, "nickname"),
				Sec.intOf(user, "avatar_enum", 1), Sec.strOf(user, "avatar_url"),
				Sec.strOf(user, "display_id"), topic == null ? "" : topic,
				period, imagesJson, coverUrl, coverFromFirst);
		// 8.按契约返回完整留言对象
		return ApiOut.message(dao.find(rid));
	}

	/* ================= 评论树 / 评论 / 回复 ================= */

	/**
	 * 两级评论树：一级评论 + 各自的 replies。
	 * 隐藏评论不出现在公开视图（本人可见自己的）；父级被隐藏的回复一并收起。
	 * 返回 {list:[树], total:留言上的评论计数}。
	 */
	public static String getComments(String messageId, ApiReq q) {
		ApiMessageDao dao = new ApiMessageDao();
		Map m = dao.find(messageId);
		if (m == null) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		TokenAuth.Session s = TokenAuth.find(q.bearer(), true);
		ApiCommentDao cdao = new ApiCommentDao();
		List all = cdao.listByMessage(messageId);
		// 1.第一遍：挑出当前视图可见的评论
		Map visible = new HashMap(); // resourceId → 出口 JSON
		List rootIds = new ArrayList();
		Map rowById = new HashMap();
		for (int i = 0; i < all.size(); i++) {
			Map c = (Map) all.get(i);
			rowById.put(Sec.strOf(c, "resource_id"), c);
			boolean mine = s != null && s.userId == Sec.longOf(c, "owner_id", -1);
			if (Sec.intOf(c, "hidden", 0) == 1 && !mine) {
				continue;
			}
			visible.put(Sec.strOf(c, "resource_id"), null); // 先占位
		}
		// 2.第二遍：先挂一级评论，再把二级回复塞进父级的 replies
		Map repliesOf = new HashMap(); // 父 resourceId → List<String> 出口
		List roots = new ArrayList();
		for (int i = 0; i < all.size(); i++) {
			Map c = (Map) all.get(i);
			String rid = Sec.strOf(c, "resource_id");
			if (!visible.containsKey(rid)) {
				continue;
			}
			int depth = Sec.intOf(c, "depth", 1);
			if (depth <= 1) {
				roots.add(c);
			} else {
				// 父级不可见 → 回复也不显示
				String parentId = Sec.strOf(c, "parent_id");
				if (parentId == null || !visible.containsKey(parentId)) {
					continue;
				}
				List bucket = (List) repliesOf.get(parentId);
				if (bucket == null) {
					bucket = new ArrayList();
					repliesOf.put(parentId, bucket);
				}
				bucket.add(ApiOut.comment(c, s, null, dao));
			}
		}
		// 3.拼树形 JSON（时间正序已在 SQL 里保证）
		StringBuffer listJson = new StringBuffer("[");
		for (int i = 0; i < roots.size(); i++) {
			Map c = (Map) roots.get(i);
			String rid = Sec.strOf(c, "resource_id");
			if (i > 0) {
				listJson.append(',');
			}
			List kids = (List) repliesOf.get(rid);
			StringBuffer arr = new StringBuffer("[");
			if (kids != null) {
				for (int k = 0; k < kids.size(); k++) {
					if (k > 0) {
						arr.append(',');
					}
					arr.append((String) kids.get(k));
				}
			}
			arr.append(']');
			listJson.append(ApiOut.comment(c, s, arr.toString(), dao));
		}
		listJson.append(']');
		return "{\"list\":" + listJson.toString()
				+ ",\"total\":" + Sec.intOf(m, "comments", 0) + "}";
	}

	/**
	 * 发评论 / 发回复（两条路由共用内部逻辑）。
	 * 层级校验：父级必须是 depth 1 的一级评论，否则 5003（最多两级）。
	 */
	public static String postComment(ApiReq q, String messageId, String parentId) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiUserDao udao = new ApiUserDao();
		Map user = udao.findById(s.userId);
		TokenAuth.muteGate(user);
		ApiMessageDao dao = new ApiMessageDao();
		Map m = dao.find(messageId);
		if (m == null) {
			throw new ApiErr(ApiResp.NOT_FOUND); // 留言没了 → 5001
		}
		String content = q.p("content") == null ? "" : q.p("content").trim();
		if (content.length() == 0 || content.length() > 500) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		// 评论/回复只查敏感词，不限流（限流仅针对发留言，F10 口径）
		sensitiveOnly(content);
		// F4 昵称顺带更新
		String nick = q.pTrim("nickname");
		applyNickname(udao, user, nick);
		// 层级 / @信息处理
		ApiCommentDao cdao = new ApiCommentDao();
		String rootId = null;
		int depth = 1;
		String atDisplayId = q.pTrim("atDisplayId");
		String atAuthorName = "";
		if (parentId != null && parentId.length() > 0) {
			Map parent = cdao.find(parentId);
			if (parent == null) {
				throw new ApiErr(ApiResp.NOT_FOUND);
			}
			if (Sec.intOf(parent, "depth", 1) >= 2) {
				throw new ApiErr(ApiResp.DEPTH_OVER); // 5003 最多两级
			}
			depth = 2;
			rootId = Sec.strOf(parent, "root_id");
			if (rootId.length() == 0) {
				rootId = parentId; // 父级是一级评论时，root 就是父级自己
			}
			// @谁：以父级作者为准（匿名父级显示“热心同学”）
			atAuthorName = Sec.intOf(parent, "is_anonymous", 0) == 1
					? "热心同学" : Sec.strOf(parent, "author_name");
			if (atDisplayId == null || atDisplayId.length() == 0) {
				atDisplayId = Sec.strOf(parent, "author_display_id");
			}
		} else {
			parentId = null;
		}
		// 落库
		String rid = Sec.newId();
		cdao.insert(rid, messageId, parentId, rootId, depth, s.userId,
				nick != null && nick.length() > 0 ? nick : Sec.strOf(user, "nickname"),
				Sec.intOf(user, "avatar_enum", 1), Sec.strOf(user, "display_id"),
				atDisplayId == null ? "" : atDisplayId, atAuthorName, content, false);
		dao.deltaComments(messageId, 1); // 留言上的评论计数 +1
		return ApiOut.comment(cdao.find(rid), s, null, dao);
	}

	/** POST /api/replies：二级回复 = postComment(parentId=commentId) 的薄封装 */
	public static String postReply(ApiReq q) {
		String messageId = q.pTrim("messageId");
		String commentId = q.pTrim("commentId");
		if (messageId == null || commentId == null) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		return postComment(q, messageId, commentId);
	}

	/* ================= 编辑 / 删除（API-07） ================= */

	/**
	 * 编辑留言或评论（PUT /api/content/{rid}）。
	 * 先查留言再查评论；不是本人 → 5002（防越权改别人内容）。
	 */
	public static String updateContent(String rid, ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiMessageDao dao = new ApiMessageDao();
		Map m = dao.find(rid);
		if (m != null) {
			// —— 是留言 ——
			if (Sec.longOf(m, "owner_id", -1) != s.userId) {
				throw new ApiErr(ApiResp.NOT_OWNER); // 5002
			}
			String content = q.p("content") == null ? "" : q.p("content").trim();
			String plain = Sec.plainContent(content);
			if (plain.length() == 0 || plain.length() > 500) {
				throw new ApiErr(ApiResp.PARAM_BAD);
			}
			sensitiveOnly(plain); // 编辑也过敏感词门
			String title = null;
			if (q.p("title") != null) {
				title = q.p("title").trim();
				if (title.length() > 48) {
					throw new ApiErr(ApiResp.PARAM_BAD);
				}
				sensitiveOnly(title);
			}
			// topic / isPublic / images / cover 传了才改（null = 保持原值）
			String topic = null;
			if (q.p("topic") != null) {
				topic = q.p("topic").trim();
				if (topic.length() > 0 && !inTopics(topic)) {
					throw new ApiErr(ApiResp.PARAM_BAD);
				}
			}
			Integer isPublic = null;
			if (q.p("isPublic") != null) {
				isPublic = Integer.valueOf("true".equalsIgnoreCase(q.p("isPublic")) ? 1 : 0);
			}
			String imagesJson = q.p("images") != null
					? Sec.sanitizeImagesJson(q.p("images")) : null;
			String coverUrl = q.p("coverUrl") != null
					? Sec.sanitizeRef(q.p("coverUrl")) : null;
			Integer coverFromFirst = null;
			if (q.p("coverFromFirst") != null) {
				coverFromFirst = Integer.valueOf(
						"true".equalsIgnoreCase(q.p("coverFromFirst")) ? 1 : 0);
			}
			dao.updateContent(rid, content, title, topic, isPublic,
					imagesJson, coverUrl, coverFromFirst);
			return ApiOut.message(dao.find(rid));
		}
		// —— 是评论 ——
		ApiCommentDao cdao = new ApiCommentDao();
		Map c = cdao.find(rid);
		if (c == null) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		if (Sec.longOf(c, "owner_id", -1) != s.userId) {
			throw new ApiErr(ApiResp.NOT_OWNER);
		}
		String content = q.p("content") == null ? "" : q.p("content").trim();
		if (content.length() == 0 || content.length() > 500) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		sensitiveOnly(content);
		cdao.updateContent(rid, content);
		return "{}";
	}

	/**
	 * 删除留言或评论（DELETE /api/content/{rid}）。
	 * 删留言：级联删其下全部评论 + 相关点赞收藏；
	 * 删一级评论：级联删整棵子树，留言评论计数 -1；
	 * 删二级回复：只删自己，计数不变（与 mock 一致）。
	 */
	public static String deleteContent(String rid, ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiMessageDao dao = new ApiMessageDao();
		Map m = dao.find(rid);
		if (m != null) {
			if (Sec.longOf(m, "owner_id", -1) != s.userId) {
				throw new ApiErr(ApiResp.NOT_OWNER);
			}
			ApiCommentDao cdao = new ApiCommentDao();
			List cmts = cdao.listByMessage(rid);
			// 1.清掉每条子评论的点赞/收藏
			List ids = new ArrayList();
			for (int i = 0; i < cmts.size(); i++) {
				ids.add(Sec.strOf((Map) cmts.get(i), "resource_id"));
			}
			dao.cleanInteractionsByIds(ids);
			// 2.删评论 + 留言本体
			cdao.execDeleteAllByMessage(rid);
			dao.delete(rid);
			// 3.清留言自己的点赞/收藏
			dao.cleanInteractions(rid);
			return "{}";
		}
		ApiCommentDao cdao = new ApiCommentDao();
		Map c = cdao.find(rid);
		if (c == null) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		if (Sec.longOf(c, "owner_id", -1) != s.userId) {
			throw new ApiErr(ApiResp.NOT_OWNER);
		}
		// 级联删除（一级评论会带走子树）
		List deleted = cdao.deleteCascade(rid);
		dao.cleanInteractionsByIds(deleted); // 清被删评论的点赞/收藏
		if (Sec.intOf(c, "depth", 1) <= 1) {
			// 评论计数按一级评论数递减（子回复随树删除，不再单独减）
			dao.deltaComments(Sec.strOf(c, "message_id"), -1);
		}
		return "{}";
	}

	/* ================= 盲盒（API-11/12） ================= */

	/**
	 * 随机捞一条他人留言：候选 = 他人的、公开的、未隐藏的、正文非空。
	 * 没有候选时返回 {message:null}，前端显示“海面空空”。
	 */
	public static String getBlindbox(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authRead(q); // 盲盒必须登录
		ApiMessageDao dao = new ApiMessageDao();
		List all = dao.listAll();
		List pool = new ArrayList();
		for (int i = 0; i < all.size(); i++) {
			Map m = (Map) all.get(i);
			if (Sec.longOf(m, "owner_id", -1) == s.userId) {
				continue; // 自己的不进池子
			}
			if (Sec.intOf(m, "is_public", 1) == 0 || Sec.intOf(m, "hidden", 0) == 1) {
				continue;
			}
			if (Sec.plainContent(Sec.strOf(m, "content")).length() == 0) {
				continue;
			}
			pool.add(m);
		}
		if (pool.isEmpty()) {
			return "{\"message\":null}";
		}
		Map picked = (Map) pool.get((int) (Math.random() * pool.size()));
		// 出口额外带作者昵称/展示ID（盲盒卡片顶部显示）
		String base = ApiOut.message(picked);
		return "{\"message\":" + base.substring(0, base.length() - 1)
				+ ",\"authorNickname\":\"" + JsonUtil.esc(Sec.strOf(picked, "nickname_snapshot"))
				+ "\",\"authorDisplayId\":\"" + JsonUtil.esc(Sec.strOf(picked, "display_id"))
				+ "\"}";
	}

	/**
	 * 盲盒匿名回复：内容对原作者可见，显示“热心同学”；
	 * 真实身份只写进 blindbox_replies 留痕表，接口永不返回（F9/D-02 红线）。
	 */
	public static String blindboxReply(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiUserDao udao = new ApiUserDao();
		Map user = udao.findById(s.userId);
		TokenAuth.muteGate(user);
		String messageId = q.pTrim("messageId");
		ApiMessageDao dao = new ApiMessageDao();
		if (messageId == null || dao.find(messageId) == null) {
			throw new ApiErr(ApiResp.NOT_FOUND);
		}
		String content = q.p("content") == null ? "" : q.p("content").trim();
		if (content.length() == 0 || content.length() > 500) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		sensitiveOnly(content);
		// 1.按匿名规则落评论：热心同学 / 头像 0 / displayId 空 / is_anonymous=1
		ApiCommentDao cdao = new ApiCommentDao();
		String rid = Sec.newId();
		cdao.insert(rid, messageId, null, null, 1, s.userId,
				"热心同学", 0, "", "", "", content, true);
		dao.deltaComments(messageId, 1);
		// 2.留痕真实身份（审计表，不出口）
		cdao.traceBlindbox(rid, messageId, s.userId);
		return ApiOut.comment(cdao.find(rid), s, null, dao);
	}

	/* ================= 内部安检门 ================= */

	/**
	 * 发留言的安检门：先敏感词（4001）再限流（4002 带剩余秒数）。
	 * 与 mock 的 messageSecurityGate 顺序一致。
	 */
	private static void securityGate(long userId, String text, boolean withRate) {
		sensitiveOnly(text);
		if (!withRate) {
			return;
		}
		ApiMessageDao dao = new ApiMessageDao();
		long now = System.currentTimeMillis();
		List stamps = dao.rateStamps(userId);
		// 1.裁掉滑窗外的旧记录
		List fresh = new ArrayList();
		for (int i = 0; i < stamps.size(); i++) {
			long ts = parseLong(stamps.get(i));
			if (now - ts < RATE_WINDOW) {
				fresh.add(Long.valueOf(ts));
			}
		}
		// 2.窗口内已达上限 → 拒绝，并算出还需等几秒
		if (fresh.size() >= RATE_LIMIT) {
			long oldest = ((Long) fresh.get(0)).longValue();
			long remain = Math.max(1, (RATE_WINDOW - (now - oldest) + 999) / 1000);
			throw new ApiErr(ApiResp.RATE_LIMITED, "操作太频繁，请 " + remain + " 秒后再试");
		}
		// 3.通过：追加本次时间戳写回
		fresh.add(Long.valueOf(now));
		dao.saveRateStamps(userId, fresh);
	}

	/** 评论 / 回复 / 盲盒回复只查敏感词，不限流（F10 口径） */
	private static void sensitiveOnly(String text) {
		ApiMessageDao dao = new ApiMessageDao();
		Map settings = dao.settings();
		String wordsJson = settings == null ? "[]" : Sec.strOf(settings, "sensitive_words");
		if (Sec.hitSensitive(Sec.parseWordList(wordsJson), text) != null) {
			throw new ApiErr(ApiResp.SENSITIVE); // 4001 请文明发言
		}
	}

	/** F4：本次昵称合法且与当前不同 → 更新用户昵称（历史内容保留快照） */
	private static void applyNickname(ApiUserDao udao, Map user, String nick) {
		if (nick == null || nick.length() == 0 || nick.length() > 20) {
			return;
		}
		if (!nick.equals(Sec.strOf(user, "nickname"))) {
			udao.updateNickname(Sec.longOf(user, "id", 0), nick);
		}
	}

	/** 话题白名单 */
	private static boolean inTopics(String topic) {
		for (int i = 0; i < Sec.TOPICS.length; i++) {
			if (Sec.TOPICS[i].equals(topic)) {
				return true;
			}
		}
		return false;
	}

	/** Object → long（JSON 解析出的数字可能是 Long/Double） */
	private static long parseLong(Object v) {
		if (v instanceof Number) {
			return ((Number) v).longValue();
		}
		try {
			return Long.parseLong(String.valueOf(v));
		} catch (NumberFormatException e) {
			return 0;
		}
	}
}
