package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import db.DatabaseConn;

/**
 * ============================================================
 *  ApiMessageDao —— 新表 messages / likes / favorites /
 *  rate_window / idempotency_keys / settings 的数据访问层
 * ------------------------------------------------------------
 *  留言相关：
 *  - 列表 / 详情 / 搜索 / 发帖 / 编辑 / 删除；
 *  - 点赞收藏走独立的 likes / favorites 表（与旧 mb_like 互不影响）；
 *  - 限流滑窗存 rate_window（ts_list 是毫秒时间戳的 JSON 数组）；
 *  - 点赞幂等键存 idempotency_keys（唯一主键防重复）；
 *  - 敏感词与当前期次存 settings。
 * ============================================================
 */
public class ApiMessageDao {

	/**
	 * 查全量留言（按时间正序）。可见性过滤（isPublic/hidden/tab）
	 * 是业务规则，放在 api 层做，这里只管取数。
	 * 顺带 LEFT JOIN 出作者的三个隐私开关，出口脱敏要用。
	 */
	public List listAll() {
		String sql = "SELECT m.*, u.flag_name, u.flag_email, u.flag_phone, u.real_name, u.email, u.account"
				+ " FROM messages m LEFT JOIN users u ON u.id = m.owner_id"
				+ " ORDER BY m.created_at ASC";
		return list(sql, new Object[0]);
	}

	/** 按 resourceId 查单条留言（含作者隐私开关），没有返回 null */
	public Map find(String resourceId) {
		return queryOne("SELECT m.*, u.flag_name, u.flag_email, u.flag_phone, u.real_name, u.email, u.account"
				+ " FROM messages m LEFT JOIN users u ON u.id = m.owner_id"
				+ " WHERE m.resource_id = ?", resourceId);
	}

	/** 按本人 id 查留言列表（我的留言 / 个人主页动态流） */
	public List listByOwner(long ownerId) {
		String sql = "SELECT m.*, u.flag_name, u.flag_email, u.flag_phone, u.real_name, u.email, u.account"
				+ " FROM messages m LEFT JOIN users u ON u.id = m.owner_id"
				+ " WHERE m.owner_id = ? ORDER BY m.created_at ASC";
		return list(sql, new Object[] { Long.valueOf(ownerId) });
	}

	/**
	 * 插入一条新留言。发帖成功后调用。
	 *
	 * @param imagesJson 已校验过的图片引用 JSON 数组字符串（[] 表示无图）
	 */
	public void insert(String resourceId, String no, long ownerId, String title,
			String content, String nickname, int avatarEnum, String avatarUrlSnapshot,
			String displayId, String topicTag, int period, String imagesJson,
			String coverUrl, boolean coverFromFirst) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO messages (resource_id, `no`, owner_id, title, content,"
					+ " nickname_snapshot, avatar_enum, avatar_url_snapshot, display_id,"
					+ " topic_tag, is_public, period, created_at, images, cover_url, cover_from_first, is_new)"
					+ " VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,1)");
			ps.setString(1, resourceId);
			ps.setString(2, no);
			ps.setLong(3, ownerId);
			ps.setString(4, title == null ? "" : title);
			ps.setString(5, content);
			ps.setString(6, nickname);
			ps.setInt(7, avatarEnum);
			ps.setString(8, avatarUrlSnapshot == null ? "" : avatarUrlSnapshot);
			ps.setString(9, displayId);
			ps.setString(10, topicTag == null ? "" : topicTag);
			ps.setInt(11, period);
			ps.setLong(12, System.currentTimeMillis());
			ps.setString(13, imagesJson);
			ps.setString(14, coverUrl == null ? "" : coverUrl);
			ps.setInt(15, coverFromFirst ? 1 : 0);
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("插入留言失败", e);
		}
	}

	/** 编辑留言正文/标题/话题/可见类型/图片，并把 edited 标记为 1 */
	public void updateContent(String resourceId, String content, String title,
			String topicTag, Integer isPublic, String imagesJson, String coverUrl,
			Integer coverFromFirst) {
		try {
			Connection con = DatabaseConn.getConnection();
			StringBuffer sql = new StringBuffer("UPDATE messages SET content = ?, edited = 1");
			List params = new ArrayList();
			params.add(content);
			// title / topic / isPublic / images / coverUrl / coverFromFirst
			// 传 null 表示“这次没传，保持原值”（与前端 mock 语义一致）
			if (title != null) {
				sql.append(", title = ?");
				params.add(title);
			}
			if (topicTag != null) {
				sql.append(", topic_tag = ?");
				params.add(topicTag);
			}
			if (isPublic != null) {
				sql.append(", is_public = ?");
				params.add(Integer.valueOf(isPublic.intValue()));
			}
			if (imagesJson != null) {
				sql.append(", images = ?");
				params.add(imagesJson);
			}
			if (coverUrl != null) {
				sql.append(", cover_url = ?");
				params.add(coverUrl);
			}
			if (coverFromFirst != null) {
				sql.append(", cover_from_first = ?");
				params.add(Integer.valueOf(coverFromFirst.intValue()));
			}
			sql.append(" WHERE resource_id = ?");
			params.add(resourceId);
			PreparedStatement ps = con.prepareStatement(sql.toString());
			for (int i = 0; i < params.size(); i++) {
				ps.setObject(i + 1, params.get(i));
			}
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("编辑留言失败", e);
		}
	}

	/** 删除留言本体 */
	public void delete(String resourceId) {
		exec("DELETE FROM messages WHERE resource_id = ?", resourceId);
	}

	/** 浏览量 +1（详情页 best-effort 计数） */
	public void addView(String resourceId) {
		exec("UPDATE messages SET views = views + 1 WHERE resource_id = ?", resourceId);
	}

	/** 点赞数 +1 / -1（-1 时不会小于 0） */
	public void deltaLikes(String resourceId, int delta) {
		exec("UPDATE messages SET likes = GREATEST(0, likes + ?) WHERE resource_id = ?",
				Integer.valueOf(delta), resourceId);
	}

	/** 收藏数 +1 / -1 */
	public void deltaFavorites(String resourceId, int delta) {
		exec("UPDATE messages SET favorites = GREATEST(0, favorites + ?) WHERE resource_id = ?",
				Integer.valueOf(delta), resourceId);
	}

	/** 评论数 +1 / -1 */
	public void deltaComments(String resourceId, int delta) {
		exec("UPDATE messages SET comments = GREATEST(0, comments + ?) WHERE resource_id = ?",
				Integer.valueOf(delta), resourceId);
	}

	/* ---------------- likes / favorites ---------------- */

	/** 当前用户是否已赞过该目标（留言或评论共用一张表） */
	public boolean hasLike(long userId, String targetId) {
		return exists("SELECT 1 FROM likes WHERE user_id = ? AND target_id = ?",
				Long.valueOf(userId), targetId);
	}

	/** 当前用户是否已收藏该目标 */
	public boolean hasFavorite(long userId, String targetId) {
		return exists("SELECT 1 FROM favorites WHERE user_id = ? AND target_id = ?",
				Long.valueOf(userId), targetId);
	}

	/** 点赞入库（主键 user_id+target_id 保证不会重复） */
	public void addLike(long userId, String targetId, String targetType) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT IGNORE INTO likes (user_id, target_id, target_type, created_at) VALUES (?,?,?,?)");
			ps.setLong(1, userId);
			ps.setString(2, targetId);
			ps.setString(3, targetType);
			ps.setLong(4, System.currentTimeMillis());
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("点赞入库失败", e);
		}
	}

	/** 取消点赞 */
	public void removeLike(long userId, String targetId) {
		exec("DELETE FROM likes WHERE user_id = ? AND target_id = ?",
				Long.valueOf(userId), targetId);
	}

	/** 收藏入库 */
	public void addFavorite(long userId, String targetId, String targetType) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT IGNORE INTO favorites (user_id, target_id, target_type, created_at) VALUES (?,?,?,?)");
			ps.setLong(1, userId);
			ps.setString(2, targetId);
			ps.setString(3, targetType);
			ps.setLong(4, System.currentTimeMillis());
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("收藏入库失败", e);
		}
	}

	/** 取消收藏 */
	public void removeFavorite(long userId, String targetId) {
		exec("DELETE FROM favorites WHERE user_id = ? AND target_id = ?",
				Long.valueOf(userId), targetId);
	}

	/** 某用户赞过的全部目标 id（列表接口的 likedIds 字段用） */
	public List likeIdsOf(long userId) {
		List out = new ArrayList();
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"SELECT target_id FROM likes WHERE user_id = ?");
			ps.setLong(1, userId);
			ResultSet rs = ps.executeQuery();
			while (rs.next()) {
				out.add(rs.getString("target_id"));
			}
			rs.close();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("查询点赞列表失败", e);
		}
		return out;
	}

	/** 某用户收藏的记录行（userId, target_id, created_at），个人主页“我收藏的”用 */
	public List favoriteRowsOf(long userId) {
		return list("SELECT user_id, target_id, target_type, created_at FROM favorites"
				+ " WHERE user_id = ? ORDER BY created_at DESC",
				new Object[] { Long.valueOf(userId) });
	}

	/** 某用户点赞的记录行，个人主页“我赞过的”用 */
	public List likeRowsOf(long userId) {
		return list("SELECT user_id, target_id, target_type, created_at FROM likes"
				+ " WHERE user_id = ? ORDER BY created_at DESC",
				new Object[] { Long.valueOf(userId) });
	}

	/** 删除留言时级联：清掉该留言及其全部评论的点赞/收藏记录 */
	public void cleanInteractions(String messageResourceId) {
		exec("DELETE FROM likes WHERE target_id = ?", messageResourceId);
		exec("DELETE FROM favorites WHERE target_id = ?", messageResourceId);
	}

	/** 按目标 id 清点赞/收藏（删除评论时用） */
	public void cleanInteractionsByIds(List ids) {
		for (int i = 0; i < ids.size(); i++) {
			exec("DELETE FROM likes WHERE target_id = ?", ids.get(i));
			exec("DELETE FROM favorites WHERE target_id = ?", ids.get(i));
		}
	}

	/* ---------------- 限流滑窗（rate_window） ---------------- */

	/**
	 * 读出某用户 10 秒滑窗内的时间戳列表。
	 * rate_window.ts_list 存的是 JSON 数组，例如 [1795597500000,1795597502000]。
	 */
	public List rateStamps(long userId) {
		Map row = queryOne("SELECT ts_list FROM rate_window WHERE user_key = ?",
				"u" + userId);
		List out = new ArrayList();
		if (row != null) {
			Object arr = util.Json.parse(Sec_str(row.get("ts_list")));
			if (arr instanceof List) {
				out = (List) arr;
			}
		}
		return out;
	}

	/** 把滑窗时间戳写回去（先裁掉窗外的，再追加当前这一次） */
	public void saveRateStamps(long userId, List stamps) {
		StringBuffer sb = new StringBuffer("[");
		for (int i = 0; i < stamps.size(); i++) {
			if (i > 0) {
				sb.append(',');
			}
			sb.append(stamps.get(i).toString());
		}
		sb.append(']');
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"REPLACE INTO rate_window (user_key, ts_list) VALUES (?,?)");
			ps.setString(1, "u" + userId);
			ps.setString(2, sb.toString());
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("保存限流记录失败", e);
		}
	}

	/* ---------------- 点赞幂等键（idempotency_keys） ---------------- */

	/**
	 * 登记幂等键。返回 false 表示这个键之前已经用过（重复请求），
	 * 上层直接返回当前状态，不做 +1/-1。
	 */
	public boolean claimIdemKey(String idemKey, long userId) {
		if (idemKey == null || idemKey.length() == 0) {
			return true; // 没传幂等键就不做幂等控制
		}
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT IGNORE INTO idempotency_keys (idem_key, user_id, created_at) VALUES (?,?,?)");
			ps.setString(1, idemKey);
			ps.setLong(2, userId);
			ps.setLong(3, System.currentTimeMillis());
			int n = ps.executeUpdate(); // 已存在时 INSERT IGNORE 影响行数为 0
			ps.close();
			con.close();
			return n > 0;
		} catch (SQLException e) {
			throw new RuntimeException("登记幂等键失败", e);
		}
	}

	/* ---------------- settings ---------------- */

	/** 读全局设置行（id 固定为 1）：敏感词 JSON + 当前期次 */
	public Map settings() {
		return queryOne("SELECT * FROM settings WHERE id = ?", Integer.valueOf(1));
	}

	/* ---------------- 内部通用 ---------------- */

	private boolean exists(String sql, Object a, Object b) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(sql);
			ps.setObject(1, a);
			ps.setObject(2, b);
			ResultSet rs = ps.executeQuery();
			boolean ok = rs.next();
			rs.close();
			ps.close();
			con.close();
			return ok;
		} catch (SQLException e) {
			throw new RuntimeException("存在性检查失败", e);
		}
	}

	private List list(String sql, Object[] params) {
		List out = new ArrayList();
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(sql);
			for (int i = 0; i < params.length; i++) {
				ps.setObject(i + 1, params[i]);
			}
			ResultSet rs = ps.executeQuery();
			while (rs.next()) {
				out.add(ApiUserDao.toMap(rs));
			}
			rs.close();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("查询留言失败", e);
		}
		return out;
	}

	private Map queryOne(String sql, Object param) {
		List l = list(sql, new Object[] { param });
		return l.isEmpty() ? null : (Map) l.get(0);
	}

	private void exec(String sql, Object... params) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(sql);
			for (int i = 0; i < params.length; i++) {
				ps.setObject(i + 1, params[i]);
			}
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("更新留言数据失败", e);
		}
	}

	private static String Sec_str(Object v) {
		return v == null ? "" : v.toString();
	}
}
