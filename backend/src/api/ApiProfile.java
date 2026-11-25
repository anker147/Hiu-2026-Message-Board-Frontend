package api;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

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
 *  ApiProfile —— 个人中心 + 个人主页（API-08 + 扩展）
 * ------------------------------------------------------------
 *  getProfile       GET  /api/profile               本人完整资料（仅此接口给全量）
 *  updatePrivacy    POST /api/profile/privacy       三个公开开关 + 互动展示开关
 *  updateNickname   POST /api/profile/nickname      昵称 / 签名 / 头像
 *  updateSensitive  POST /api/profile/sensitive     真实姓名 / 邮箱（手机号不可改）
 *  getZone          GET  /api/zone?displayId=xxxx   个人主页聚合（访客可看）
 * ============================================================
 */
public class ApiProfile {

	/** 邮箱格式（选填项校验） */
	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

	/**
	 * 本人完整资料：只有这个接口返回 account/realName/email 原文，
	 * 列表和主页永远只有掩码（F6）。同时附上掩码预览。
	 */
	public static String getProfile(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authRead(q);
		ApiUserDao dao = new ApiUserDao();
		Map u = dao.findById(s.userId);
		if (u == null) {
			throw new ApiErr(ApiResp.UNAUTHORIZED);
		}
		StringBuffer sb = new StringBuffer();
		sb.append("{\"displayId\":\"").append(Sec.strOf(u, "display_id"))
				.append("\",\"nickname\":\"").append(Sec.strOf(u, "nickname"))
				.append("\",\"avatarEnum\":").append(Sec.intOf(u, "avatar_enum", 1))
				.append(",\"avatarUrl\":\"").append(Sec.strOf(u, "avatar_url"))
				.append("\",\"account\":\"").append(Sec.strOf(u, "account"))
				.append("\",\"realName\":\"").append(Sec.strOf(u, "real_name"))
				.append("\",\"email\":\"").append(Sec.strOf(u, "email"))
				.append("\",\"bio\":\"").append(Sec.strOf(u, "bio"))
				.append("\",\"flagName\":").append(Sec.intOf(u, "flag_name", 0) == 1)
				.append(",\"flagEmail\":").append(Sec.intOf(u, "flag_email", 0) == 1)
				.append(",\"flagPhone\":").append(Sec.intOf(u, "flag_phone", 0) == 1)
				.append(",\"flagLiked\":").append(Sec.intOf(u, "flag_liked", 1) == 1)
				.append(",\"flagFavorite\":").append(Sec.intOf(u, "flag_favorite", 1) == 1)
				.append(",\"maskedName\":\"").append(Sec.maskName(Sec.strOf(u, "real_name")))
				.append("\",\"maskedEmail\":\"").append(Sec.maskEmail(Sec.strOf(u, "email")))
				.append("\",\"maskedPhone\":\"").append(Sec.maskPhone(Sec.strOf(u, "account")))
				.append("\"}");
		return sb.toString();
	}

	/**
	 * 隐私设置：三个公开开关（flag_name/email/phone）必传；
	 * 互动展示开关（flag_liked/flag_favorite）传了才改（兼容旧调用方）。
	 */
	public static String updatePrivacy(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiUserDao dao = new ApiUserDao();
		// 必传三项直接按布尔写入
		boolean flagName = "true".equalsIgnoreCase(q.p("flagName"));
		boolean flagEmail = "true".equalsIgnoreCase(q.p("flagEmail"));
		boolean flagPhone = "true".equalsIgnoreCase(q.p("flagPhone"));
		dao.updatePrivacy(s.userId, flagName, flagEmail, flagPhone);
		// 互动展示开关：-1 = 没传，保留原值
		int flagLiked = boolParam(q.p("flagLiked"));
		int flagFavorite = boolParam(q.p("flagFavorite"));
		dao.updateInteractionFlags(s.userId, flagLiked, flagFavorite);
		return "{}";
	}

	/**
	 * 昵称 / 签名 / 头像（F4）：昵称必传 1~20 字；
	 * bio 选填 ≤60 字；avatarEnum 选填 1~8；avatarUrl 选填 localimg 引用（空串=回退 emoji）。
	 * 写时快照：历史留言保留当时的昵称和头像。
	 */
	public static String updateNickname(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiUserDao dao = new ApiUserDao();
		// 1.昵称必传
		String nick = q.pTrim("nickname");
		if (nick == null || nick.length() == 0 || nick.length() > 20) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		// 2.签名选填
		String bio = null;
		if (q.p("bio") != null) {
			bio = q.p("bio").trim();
			if (bio.length() > 60) {
				throw new ApiErr(ApiResp.PARAM_BAD);
			}
		}
		// 3.emoji 头像编号选填
		Integer avatar = null;
		if (q.p("avatarEnum") != null) {
			int av;
			try {
				av = Integer.parseInt(q.p("avatarEnum").trim());
			} catch (NumberFormatException e) {
				throw new ApiErr(ApiResp.PARAM_BAD);
			}
			if (av < 1 || av > Sec.AVATAR_COUNT) {
				throw new ApiErr(ApiResp.PARAM_BAD);
			}
			avatar = Integer.valueOf(av);
		}
		// 4.真实头像引用选填：必须是 localimg:// 开头；空串 = 清空回退 emoji
		String avatarUrl = null;
		if (q.p("avatarUrl") != null) {
			avatarUrl = q.p("avatarUrl").trim();
			if (avatarUrl.length() > 0 && !avatarUrl.startsWith("localimg://")) {
				throw new ApiErr(ApiResp.PARAM_BAD);
			}
		}
		// 5.逐项落库
		dao.updateNickname(s.userId, nick);
		if (bio != null) {
			dao.updateBio(s.userId, bio);
		}
		if (avatar != null) {
			dao.updateAvatarEnum(s.userId, avatar.intValue());
		}
		if (avatarUrl != null) {
			dao.updateAvatarUrl(s.userId, avatarUrl);
		}
		// 6.回显（契约要求返回 nickname/bio/avatar/avatarUrl）
		Map u = dao.findById(s.userId);
		return "{\"nickname\":\"" + Sec.strOf(u, "nickname")
				+ "\",\"bio\":\"" + Sec.strOf(u, "bio")
				+ "\",\"avatar\":" + Sec.intOf(u, "avatar_enum", 1)
				+ ",\"avatarUrl\":\"" + Sec.strOf(u, "avatar_url") + "\"}";
	}

	/**
	 * 敏感信息编辑：realName / email 选填（传了才改，可传空串清空）；
	 * 手机号 = 登录账号，不允许修改。写完出口掩码即时变化（F6 脱敏在出口层）。
	 */
	public static String updateSensitive(ApiReq q) {
		TokenAuth.Session s = TokenAuth.authWrite(q);
		ApiUserDao dao = new ApiUserDao();
		String realName = q.p("realName") == null ? null : q.p("realName").trim();
		String email = q.p("email") == null ? null : q.p("email").trim();
		if (realName != null && realName.length() > 20) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		if (email != null) {
			if (email.length() > 60) {
				throw new ApiErr(ApiResp.PARAM_BAD);
			}
			if (email.length() > 0 && !EMAIL.matcher(email).matches()) {
				throw new ApiErr(ApiResp.PARAM_BAD, "邮箱格式不正确");
			}
		}
		dao.updateSensitive(s.userId, realName, email);
		Map u = dao.findById(s.userId);
		return "{\"realName\":\"" + Sec.strOf(u, "real_name")
				+ "\",\"email\":\"" + Sec.strOf(u, "email")
				+ "\",\"maskedName\":\"" + Sec.maskName(Sec.strOf(u, "real_name"))
				+ "\",\"maskedEmail\":\"" + Sec.maskEmail(Sec.strOf(u, "email"))
				+ "\"}";
	}

	/* ================= 个人主页（zone） ================= */

	/**
	 * 个人主页聚合：按展示 ID 查询，访客可看。
	 * - 公开面：昵称/头像/展示ID/签名/注册时间 + 掩码（按本人开关）；
	 * - 动态流：公开留言 + 非匿名评论（引用原帖摘要）；
	 * - 红线 F9/D-02：盲盒匿名回复绝不出现在作者主页；
	 * - 仅本人可见：私密留言、盲盒送出记录、liked/favorite 全量。
	 */
	public static String getZone(ApiReq q) {
		TokenAuth.Session s = TokenAuth.find(q.bearer(), true); // 访客可为 null
		String displayId = q.pTrim("displayId");
		ApiUserDao udao = new ApiUserDao();
		Map u = displayId == null ? null : udao.findByDisplayId(displayId);
		if (u == null) {
			throw new ApiErr(ApiResp.NOT_FOUND, "用户不存在");
		}
		long uid = Sec.longOf(u, "id", 0);
		boolean isSelf = s != null && s.userId == uid;
		ApiMessageDao mdao = new ApiMessageDao();
		ApiCommentDao cdao = new ApiCommentDao();

		// 1.留言流：本人看全部；访客只看公开且未隐藏的
		List allMine = mdao.listByOwner(uid);
		List msgOut = new ArrayList();
		int likesReceived = 0;
		Map topicCount = new java.util.LinkedHashMap();
		for (int i = 0; i < allMine.size(); i++) {
			Map m = (Map) allMine.get(i);
			boolean visible = isSelf || (Sec.intOf(m, "is_public", 1) == 1
					&& Sec.intOf(m, "hidden", 0) == 0);
			if (visible) {
				msgOut.add(ApiOut.message(m));
				likesReceived += Sec.intOf(m, "likes", 0);
				// 话题统计（本人页也统计全部可见帖）
				String tag = Sec.strOf(m, "topic_tag");
				if (tag.length() > 0) {
					Integer n = (Integer) topicCount.get(tag);
					topicCount.put(tag, Integer.valueOf(n == null ? 1 : n.intValue() + 1));
				}
			}
		}

		// 2.评论流：非匿名 + 所属留言可见（匿名回复绝不进主页）
		List cmts = cdao.listByOwnerVisible(uid);
		List cmtOut = new ArrayList();
		for (int i = 0; i < cmts.size(); i++) {
			Map c = (Map) cmts.get(i);
			Map pm = mdao.find(Sec.strOf(c, "message_id"));
			if (pm == null) {
				continue;
			}
			boolean pmVisible = isSelf || (Sec.intOf(pm, "is_public", 1) == 1
					&& Sec.intOf(pm, "hidden", 0) == 0);
			if (!pmVisible) {
				continue;
			}
			likesReceived += Sec.intOf(c, "likes", 0);
			cmtOut.add(zoneComment(c, pm));
		}

		// 3.盲盒送出记录：仅本人可见
		StringBuffer bbJson = new StringBuffer("[");
		if (isSelf) {
			List traces = cdao.blindboxTracesOf(uid);
			int k = 0;
			for (int i = 0; i < traces.size(); i++) {
				Map tr = (Map) traces.get(i);
				Map c = cdao.find(Sec.strOf(tr, "reply_id"));
				Map target = mdao.find(Sec.strOf(tr, "message_id"));
				if (c == null || target == null) {
					continue;
				}
				if (k > 0) {
					bbJson.append(',');
				}
				bbJson.append("{\"replyId\":\"").append(JsonUtil.esc(Sec.strOf(c, "resource_id")))
						.append("\",\"content\":").append(jstr(Sec.strOf(c, "content")))
						.append(",\"createdAt\":").append(Sec.longOf(c, "created_at", 0))
						.append(",\"target\":{\"resourceId\":\"")
						.append(JsonUtil.esc(Sec.strOf(target, "resource_id")))
						.append("\",\"title\":\"").append(JsonUtil.esc(Sec.strOf(target, "title")))
						.append("\",\"excerpt\":")
						.append(jstr(clip(Sec.plainContent(Sec.strOf(target, "content")), 60)))
						.append("}}");
				k++;
			}
		}
		bbJson.append(']');

		// 4.我赞过的 / 我收藏的：本人恒可见；他人按公开开关（canSeeLiked）
		boolean canSeeLiked = isSelf || Sec.intOf(u, "flag_liked", 1) == 1;
		boolean canSeeFav = isSelf || Sec.intOf(u, "flag_favorite", 1) == 1;
		String likedJson = interactions(mdao, cdao, uid, true, canSeeLiked);
		String favJson = interactions(mdao, cdao, uid, false, canSeeFav);

		// 5.公开面 + 统计
		StringBuffer sb = new StringBuffer();
		sb.append("{\"isSelf\":").append(isSelf)
				.append(",\"user\":{\"displayId\":\"").append(Sec.strOf(u, "display_id"))
				.append("\",\"nickname\":\"").append(Sec.strOf(u, "nickname"))
				.append("\",\"avatarEnum\":").append(Sec.intOf(u, "avatar_enum", 1))
				.append(",\"avatarUrl\":\"").append(Sec.strOf(u, "avatar_url"))
				.append("\",\"bio\":\"").append(Sec.strOf(u, "bio"))
				.append("\",\"createdAt\":").append(Sec.longOf(u, "created_at", 0))
				.append(',')
				.append(ApiOut.maskFieldsOf(u))
				.append("},\"memberDays\":")
				.append(Math.max(1, (System.currentTimeMillis()
						- Sec.longOf(u, "created_at", 0) + 86399999) / 86400000))
				.append(",\"stats\":{\"messages\":").append(msgOut.size())
				.append(",\"comments\":").append(cmtOut.size())
				.append(",\"likesReceived\":").append(likesReceived)
				.append("},\"topics\":").append(topicsJson(topicCount))
				.append(",\"blindboxMessages\":").append(bbJson)
				.append(",\"canSeeLiked\":").append(canSeeLiked)
				.append(",\"canSeeFavorite\":").append(canSeeFav)
				.append(",\"liked\":").append(likedJson)
				.append(",\"favorite\":").append(favJson)
				.append(",\"messages\":[");
		for (int i = 0; i < msgOut.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append((String) msgOut.get(i));
		}
		sb.append("],\"comments\":[");
		for (int i = 0; i < cmtOut.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append((String) cmtOut.get(i));
		}
		sb.append("]}");
		return sb.toString();
	}

	/**
	 * 我赞过的 / 我收藏的聚合：按目标 id 找帖子或评论。
	 * 帖子 → 完整留言出口；评论 → zoneComment（带原帖摘要）。
	 */
	private static String interactions(ApiMessageDao mdao, ApiCommentDao cdao,
			long uid, boolean liked, boolean allowed) {
		if (!allowed) {
			return "{\"posts\":[],\"comments\":[]}"; // 无权限：恒空
		}
		List rows = liked ? mdao.likeRowsOf(uid) : mdao.favoriteRowsOf(uid);
		StringBuffer posts = new StringBuffer("[");
		StringBuffer replies = new StringBuffer("[");
		int np = 0;
		int nr = 0;
		for (int i = 0; i < rows.size(); i++) {
			Map row = (Map) rows.get(i);
			String tid = Sec.strOf(row, "target_id");
			Map m = mdao.find(tid);
			if (m != null && Sec.intOf(m, "is_public", 1) == 1
					&& Sec.intOf(m, "hidden", 0) == 0) {
				if (np > 0) {
					posts.append(',');
				}
				posts.append(ApiOut.message(m));
				np++;
				continue;
			}
			Map c = cdao.find(tid);
			if (c != null && Sec.intOf(c, "is_anonymous", 0) == 0) {
				Map pm = mdao.find(Sec.strOf(c, "message_id"));
				if (pm != null && Sec.intOf(pm, "is_public", 1) == 1
						&& Sec.intOf(pm, "hidden", 0) == 0) {
					if (nr > 0) {
						replies.append(',');
					}
					replies.append(zoneComment(c, pm));
					nr++;
				}
			}
		}
		posts.append(']');
		replies.append(']');
		return "{\"posts\":" + posts + ",\"comments\":" + replies + "}";
	}

	/** zone 页的评论条目（带原帖摘要） */
	private static String zoneComment(Map c, Map parentMsg) {
		StringBuffer sb = new StringBuffer();
		sb.append("{\"resourceId\":\"").append(JsonUtil.esc(Sec.strOf(c, "resource_id")))
				.append("\",\"messageId\":\"").append(JsonUtil.esc(Sec.strOf(c, "message_id")))
				.append("\",\"content\":").append(jstr(Sec.strOf(c, "content")))
				.append(",\"createdAt\":").append(Sec.longOf(c, "created_at", 0))
				.append(",\"likes\":").append(Sec.intOf(c, "likes", 0))
				.append(",\"favorites\":").append(Sec.intOf(c, "favorites", 0))
				.append(",\"edited\":").append(Sec.intOf(c, "edited", 0) == 1)
				.append(",\"message\":{\"resourceId\":\"")
				.append(JsonUtil.esc(Sec.strOf(parentMsg, "resource_id")))
				.append("\",\"title\":\"").append(JsonUtil.esc(Sec.strOf(parentMsg, "title")))
				.append("\",\"content\":").append(jstr(Sec.strOf(parentMsg, "content")))
				.append(",\"topicTag\":\"").append(JsonUtil.esc(Sec.strOf(parentMsg, "topic_tag")))
				.append("\",\"nicknameSnapshot\":\"")
				.append(JsonUtil.esc(Sec.strOf(parentMsg, "nickname_snapshot")))
				.append("\",\"createdAt\":").append(Sec.longOf(parentMsg, "created_at", 0))
				.append("}}");
		return sb.toString();
	}

	/** 话题统计 → JSON 数组（按出现次数降序） */
	private static String topicsJson(Map topicCount) {
		// 1.先取出来做简单排序（数量少，选择排序足够）
		List tags = new ArrayList(topicCount.keySet());
		for (int i = 0; i < tags.size(); i++) {
			for (int j = i + 1; j < tags.size(); j++) {
				if ((Integer) topicCount.get(tags.get(j)) > (Integer) topicCount.get(tags.get(i))) {
					Object tmp = tags.get(i);
					tags.set(i, tags.get(j));
					tags.set(j, tmp);
				}
			}
		}
		// 2.拼 JSON
		StringBuffer sb = new StringBuffer("[");
		for (int i = 0; i < tags.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append("{\"tag\":\"").append(JsonUtil.esc((String) tags.get(i)))
					.append("\",\"count\":").append(topicCount.get(tags.get(i))).append('}');
		}
		sb.append(']');
		return sb.toString();
	}

	/** 布尔参数：true→1 false→0 没传→-1（不改） */
	private static int boolParam(String v) {
		if (v == null) {
			return -1;
		}
		return "true".equalsIgnoreCase(v) ? 1 : 0;
	}

	/** 截断到 max 个字符（盲盒原帖摘要用） */
	private static String clip(String s, int max) {
		if (s == null) {
			return "";
		}
		return s.length() > max ? s.substring(0, max) : s;
	}

	/** 字符串 → JSON 带引号字符串 */
	private static String jstr(String s) {
		return "\"" + JsonUtil.esc(s == null ? "" : s) + "\"";
	}
}
