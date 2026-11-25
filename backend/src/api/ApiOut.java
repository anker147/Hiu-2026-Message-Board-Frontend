package api;

import java.util.List;
import java.util.Map;

import util.ApiReq;
import util.JsonUtil;
import util.Sec;
import util.TokenAuth;
import dao.ApiMessageDao;

/**
 * ============================================================
 *  ApiOut —— 出口 JSON 组装器（6.5 字段白名单 + F6 掩码）
 * ------------------------------------------------------------
 *  前端契约要求：后端返回什么字段、字段叫什么名字，必须和
 *  《API接口文档》完全一致（camelCase），多给少给都可能让前端
 *  页面渲染出错。所以所有出库数据都经过这里“整形”再拼成 JSON。
 *
 *  三个核心出口：
 *  1. message(m)      → 留言对象（列表 + 详情共用）
 *  2. comment(c)      → 评论对象（树形列表用）
 *  3. 隐私掩码三个字段 maskedName / maskedEmail / maskedPhone
 * ============================================================
 */
public class ApiOut {

	/* ---------------- F6 掩码出口 ---------------- */

	/**
	 * 留言对象上的三个掩码字段：
	 * 只有作者本人把对应公开开关打开（flag_xxx = 1）才返回掩码，否则空串。
	 * SQL 已把作者的 real_name / email / account 和三个开关一起查出来。
	 */
	public static String maskFields(Map m) {
		StringBuffer sb = new StringBuffer();
		String name = Sec.strOf(m, "real_name");
		String email = Sec.strOf(m, "email");
		String account = Sec.strOf(m, "account");
		int flagName = Sec.intOf(m, "flag_name", 0);
		int flagEmail = Sec.intOf(m, "flag_email", 0);
		int flagPhone = Sec.intOf(m, "flag_phone", 0);
		sb.append("\"maskedName\":\"").append(JsonUtil.esc(flagName == 1 ? Sec.maskName(name) : ""))
				.append("\",\"maskedEmail\":\"").append(JsonUtil.esc(flagEmail == 1 ? Sec.maskEmail(email) : ""))
				.append("\",\"maskedPhone\":\"").append(JsonUtil.esc(flagPhone == 1 ? Sec.maskPhone(account) : ""))
				.append('"');
		return sb.toString();
	}

	/**
	 * 带作者真实信息的掩码（个人主页用）：传入作者行 u，
	 * 按其公开开关决定是否给掩码。
	 */
	public static String maskFieldsOf(Map u) {
		String name = u == null ? "" : Sec.strOf(u, "real_name");
		String email = u == null ? "" : Sec.strOf(u, "email");
		String account = u == null ? "" : Sec.strOf(u, "account");
		int flagName = u == null ? 0 : Sec.intOf(u, "flag_name", 0);
		int flagEmail = u == null ? 0 : Sec.intOf(u, "flag_email", 0);
		int flagPhone = u == null ? 0 : Sec.intOf(u, "flag_phone", 0);
		StringBuffer sb = new StringBuffer();
		sb.append("\"maskedName\":\"").append(JsonUtil.esc(flagName == 1 ? Sec.maskName(name) : ""))
				.append("\",\"maskedEmail\":\"").append(JsonUtil.esc(flagEmail == 1 ? Sec.maskEmail(email) : ""))
				.append("\",\"maskedPhone\":\"").append(JsonUtil.esc(flagPhone == 1 ? Sec.maskPhone(account) : ""))
				.append('"');
		return sb.toString();
	}

	/* ---------------- 留言出口 ---------------- */

	/**
	 * 留言 Map → 契约 JSON。字段与前端 toListMessage 逐一对应：
	 * resourceId/title/content/nicknameSnapshot/avatarEnum/avatarUrl/
	 * images/coverUrl/coverFromFirst/displayId/topicTag/createdAt/
	 * stats{...}/heatDelta/peakRank/peakNewRank/weeklyStats/no/isNew/
	 * isPublic/period/edited/hidden/hiddenReason/maskedXxx
	 */
	public static String message(Map m) {
		StringBuffer sb = new StringBuffer();
		sb.append("{\"resourceId\":\"").append(JsonUtil.esc(Sec.strOf(m, "resource_id")))
				.append("\",\"title\":\"").append(JsonUtil.esc(Sec.strOf(m, "title")))
				.append("\",\"content\":").append(jstr(Sec.strOf(m, "content")))
				.append(",\"nicknameSnapshot\":\"").append(JsonUtil.esc(Sec.strOf(m, "nickname_snapshot")))
				.append("\",\"avatarEnum\":").append(Sec.intOf(m, "avatar_enum", 1))
				.append(",\"avatarUrl\":\"").append(JsonUtil.esc(Sec.strOf(m, "avatar_url_snapshot")))
				.append("\",\"images\":").append(jarr(Sec.strOf(m, "images")))
				.append(",\"coverUrl\":\"").append(JsonUtil.esc(Sec.strOf(m, "cover_url")))
				.append("\",\"coverFromFirst\":").append(Sec.intOf(m, "cover_from_first", 0) == 1)
				.append(",\"displayId\":\"").append(JsonUtil.esc(Sec.strOf(m, "display_id")))
				.append("\",\"topicTag\":\"").append(JsonUtil.esc(Sec.strOf(m, "topic_tag")))
				.append("\",\"createdAt\":").append(Sec.longOf(m, "created_at", 0))
				.append(",\"stats\":{\"views\":").append(Sec.intOf(m, "views", 0))
				.append(",\"likes\":").append(Sec.intOf(m, "likes", 0))
				.append(",\"comments\":").append(Sec.intOf(m, "comments", 0))
				.append(",\"favorites\":").append(Sec.intOf(m, "favorites", 0))
				.append("},\"heatDelta\":").append(Sec.strOf(m, "heat_delta").length() == 0
						? "0" : Sec.strOf(m, "heat_delta"))
				.append(",\"peakRank\":").append(Sec.intOf(m, "peak_rank", 0))
				.append(",\"peakNewRank\":").append(Sec.intOf(m, "peak_new_rank", 0))
				.append(",\"weeklyStats\":").append(jarr(Sec.strOf(m, "weekly_stats")))
				.append(",\"no\":\"").append(JsonUtil.esc(Sec.strOf(m, "no")))
				.append("\",\"isNew\":").append(Sec.intOf(m, "is_new", 0) == 1)
				.append(",\"isPublic\":").append(Sec.intOf(m, "is_public", 1) == 1)
				.append(",\"period\":").append(Sec.intOf(m, "period", 24))
				.append(",\"edited\":").append(Sec.intOf(m, "edited", 0) == 1)
				.append(",\"hidden\":").append(Sec.intOf(m, "hidden", 0) == 1)
				.append(",\"hiddenReason\":\"").append(JsonUtil.esc(Sec.strOf(m, "hidden_reason")))
				.append("\",")
				.append(maskFields(m))
				.append('}');
		return sb.toString();
	}

	/**
	 * 留言详情出口：列表出口 + isMine/isLiked/isFavorite 三个访问者状态。
	 *
	 * @param m       留言行
	 * @param session 当前会话（可为 null = 访客）
	 * @param dao     点赞收藏查询要用
	 */
	public static String messageDetail(Map m, TokenAuth.Session session, ApiMessageDao dao) {
		boolean mine = session != null && session.userId == Sec.longOf(m, "owner_id", -1);
		boolean liked = session != null && dao.hasLike(session.userId, Sec.strOf(m, "resource_id"));
		boolean fav = session != null && dao.hasFavorite(session.userId, Sec.strOf(m, "resource_id"));
		// 把 detail 三个字段追加进列表 JSON：先去掉结尾 '}' 再补
		String base = message(m);
		return base.substring(0, base.length() - 1)
				+ ",\"isMine\":" + mine
				+ ",\"isLiked\":" + liked
				+ ",\"isFavorite\":" + fav
				+ '}';
	}

	/* ---------------- 评论出口 ---------------- */

	/**
	 * 评论 Map → 契约 JSON（toCommentOut）。
	 * 匿名回复（盲盒）：authorName 固定“热心同学”、头像 0、
	 * displayId 空串、isMine 恒 false —— 绝不泄露真实身份（F9/D-02）。
	 *
	 * @param c        评论行
	 * @param session  当前会话（null = 访客）
	 * @param replies  二级回复出口 JSON 数组串（无回复传 null，不输出 replies 字段）
	 * @param dao      判断 isLiked/isFavorite 用
	 */
	public static String comment(Map c, TokenAuth.Session session, String replies, ApiMessageDao dao) {
		boolean anon = Sec.intOf(c, "is_anonymous", 0) == 1;
		String rid = Sec.strOf(c, "resource_id");
		boolean mine = !anon && session != null && session.userId == Sec.longOf(c, "owner_id", -1);
		boolean liked = session != null && dao.hasLike(session.userId, rid);
		boolean fav = session != null && dao.hasFavorite(session.userId, rid);
		StringBuffer sb = new StringBuffer();
		sb.append("{\"resourceId\":\"").append(JsonUtil.esc(rid))
				.append("\",\"messageId\":\"").append(JsonUtil.esc(Sec.strOf(c, "message_id")))
				.append("\",\"parentId\":").append(parentJson(c))
				.append(",\"depth\":").append(Sec.intOf(c, "depth", 1))
				.append(",\"authorName\":\"").append(JsonUtil.esc(anon ? "热心同学" : Sec.strOf(c, "author_name")))
				.append("\",\"authorAvatar\":").append(anon ? 0 : Sec.intOf(c, "author_avatar", 0))
				.append(",\"authorDisplayId\":\"").append(JsonUtil.esc(anon ? "" : Sec.strOf(c, "author_display_id")))
				.append("\",\"atDisplayId\":\"").append(JsonUtil.esc(Sec.strOf(c, "at_display_id")))
				.append("\",\"atAuthorName\":\"").append(JsonUtil.esc(Sec.strOf(c, "at_author_name")))
				.append("\",\"content\":").append(jstr(Sec.strOf(c, "content")))
				.append(",\"createdAt\":").append(Sec.longOf(c, "created_at", 0))
				.append(",\"likes\":").append(Sec.intOf(c, "likes", 0))
				.append(",\"favorites\":").append(Sec.intOf(c, "favorites", 0))
				.append(",\"isLiked\":").append(liked)
				.append(",\"isFavorite\":").append(fav)
				.append(",\"edited\":").append(Sec.intOf(c, "edited", 0) == 1)
				.append(",\"isAnonymous\":").append(anon)
				.append(",\"hidden\":").append(Sec.intOf(c, "hidden", 0) == 1)
				.append(",\"hiddenReason\":\"").append(JsonUtil.esc(Sec.strOf(c, "hidden_reason")))
				.append("\",\"isMine\":").append(mine);
		// 有二级回复才输出 replies 字段（与前端 mock 行为一致，页面按 if(c.replies) 判断）
		if (replies != null) {
			sb.append(",\"replies\":").append(replies);
		}
		sb.append('}');
		return sb.toString();
	}

	/** parentId 输出：NULL → null（JSON null），有值 → 带引号字符串 */
	private static String parentJson(Map c) {
		Object p = c.get("parent_id");
		if (p == null) {
			return "null";
		}
		return "\"" + JsonUtil.esc(p.toString()) + "\"";
	}

	/* ---------------- 通用小工具 ---------------- */

	/**
	 * 富文本内容字符串：内容里本身可能带英文双引号，需要 esc 转义。
	 * 单独一个方法是为了让 message()/comment() 里少点重复。
	 */
	private static String jstr(String s) {
		return "\"" + JsonUtil.esc(s == null ? "" : s) + "\"";
	}

	/**
	 * 数据库里存的 JSON 数组原样透传（images / weekly_stats）。
	 * NULL 或空 → 输出 []，保证前端拿到的永远是数组。
	 */
	private static String jarr(String stored) {
		String s = stored == null ? "" : stored.trim();
		if (s.length() == 0) {
			return "[]";
		}
		return s; // 入库时已校验是合法 JSON 数组
	}
}
