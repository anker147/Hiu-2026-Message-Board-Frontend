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
 *  ApiCommentDao —— 新表 comments / blindbox_replies 的数据访问层
 * ------------------------------------------------------------
 *  评论树结构（最多两级，超层报 5003）：
 *  - 一级评论：parent_id = NULL，root_id = NULL，depth = 1；
 *  - 二级回复：parent_id = 挂靠的评论，root_id = 所属一级评论，depth = 2；
 *  - 盲盒匿名回复：一级评论 + is_anonymous = 1，
 *    真实身份写进 blindbox_replies 留痕表（审计用），出口永远不暴露。
 * ============================================================
 */
public class ApiCommentDao {

	/** 某条留言下的全部评论（时间正序），树形拼装在 api 层做 */
	public List listByMessage(String messageId) {
		return list("SELECT * FROM comments WHERE message_id = ? ORDER BY created_at ASC",
				new Object[] { messageId });
	}

	/** 按 resourceId 查单条评论（点赞 / 编辑 / 删除时定位用） */
	public Map find(String resourceId) {
		List l = list("SELECT * FROM comments WHERE resource_id = ?",
				new Object[] { resourceId });
		return l.isEmpty() ? null : (Map) l.get(0);
	}

	/** 某用户的全部非匿名评论（个人主页动态流用） */
	public List listByOwnerVisible(long ownerId) {
		return list("SELECT * FROM comments WHERE owner_id = ? AND is_anonymous = 0"
				+ " ORDER BY created_at ASC",
				new Object[] { Long.valueOf(ownerId) });
	}

	/** 某用户的全部评论（含匿名，仅本人主页可见匿名送出记录时配合留痕表使用） */
	public List listByOwnerAll(long ownerId) {
		return list("SELECT * FROM comments WHERE owner_id = ? ORDER BY created_at ASC",
				new Object[] { Long.valueOf(ownerId) });
	}

	/**
	 * 插入一条评论（普通评论 / 二级回复 / 盲盒匿名回复共用）。
	 *
	 * @param isAnonymous true = 盲盒匿名回复（authorName 固定“热心同学”）
	 */
	public void insert(String resourceId, String messageId, String parentId,
			String rootId, int depth, long ownerId, String authorName, int authorAvatar,
			String authorDisplayId, String atDisplayId, String atAuthorName,
			String content, boolean isAnonymous) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth,"
					+ " owner_id, author_name, author_avatar, author_display_id,"
					+ " at_display_id, at_author_name, content, created_at, is_anonymous)"
					+ " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
			ps.setString(1, resourceId);
			ps.setString(2, messageId);
			ps.setString(3, parentId == null ? null : parentId);       // 一级评论传 null
			ps.setString(4, rootId == null ? null : rootId);
			ps.setInt(5, depth);
			ps.setLong(6, ownerId);
			ps.setString(7, authorName);
			ps.setInt(8, authorAvatar);
			ps.setString(9, authorDisplayId == null ? "" : authorDisplayId);
			ps.setString(10, atDisplayId == null ? "" : atDisplayId);
			ps.setString(11, atAuthorName == null ? "" : atAuthorName);
			ps.setString(12, content);
			ps.setLong(13, System.currentTimeMillis());
			ps.setInt(14, isAnonymous ? 1 : 0);
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("插入评论失败", e);
		}
	}

	/** 编辑评论正文（只有作者本人能改），并标记 edited = 1 */
	public void updateContent(String resourceId, String content) {
		exec("UPDATE comments SET content = ?, edited = 1 WHERE resource_id = ?",
				content, resourceId);
	}

	/** 评论点赞数 +1 / -1（最小 0） */
	public void deltaLikes(String resourceId, int delta) {
		exec("UPDATE comments SET likes = GREATEST(0, likes + ?) WHERE resource_id = ?",
				Integer.valueOf(delta), resourceId);
	}

	/** 评论收藏数 +1 / -1 */
	public void deltaFavorites(String resourceId, int delta) {
		exec("UPDATE comments SET favorites = GREATEST(0, favorites + ?) WHERE resource_id = ?",
				Integer.valueOf(delta), resourceId);
	}

	/**
	 * 删除一条评论；若删的是一级评论（depth=1），
	 * 其下的全部二级回复（root_id 指向它）一并级联删除。
	 *
	 * @param resourceId 要删的评论 id
	 * @return 本次真正删除的评论 id 列表（上层按一级评论数递减计数、清点赞）
	 */
	public List deleteCascade(String resourceId) {
		Map c = find(resourceId);
		List deleted = new ArrayList();
		if (c == null) {
			return deleted;
		}
		int depth = 0;
		Object d = c.get("depth");
		if (d instanceof Number) {
			depth = ((Number) d).intValue();
		}
		if (depth >= 2) {
			// 二级回复：只删自己
			exec("DELETE FROM comments WHERE resource_id = ?", resourceId);
			deleted.add(resourceId);
		} else {
			// 一级评论：把整棵子树删掉（含自己）
			List children = list("SELECT resource_id FROM comments WHERE root_id = ?",
					new Object[] { resourceId });
			for (int i = 0; i < children.size(); i++) {
				String cid = (String) ((Map) children.get(i)).get("resource_id");
				exec("DELETE FROM comments WHERE resource_id = ?", cid);
				deleted.add(cid);
			}
			exec("DELETE FROM comments WHERE resource_id = ?", resourceId);
			deleted.add(resourceId);
		}
		return deleted;
	}

	/**
	 * 删除某条留言下的全部评论（留言被删除时级联调用） */
	public void execDeleteAllByMessage(String messageId) {
		exec("DELETE FROM comments WHERE message_id = ?", messageId);
	}

	/* ---------------- 盲盒留痕（blindbox_replies） ---------------- */

	/** 记录一次盲盒匿名回复的真实身份（绝不通过接口返回给前端） */
	public void traceBlindbox(String replyId, String messageId, long realOwnerId) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO blindbox_replies (reply_id, message_id, real_owner_id, at) VALUES (?,?,?,?)");
			ps.setString(1, replyId);
			ps.setString(2, messageId);
			ps.setLong(3, realOwnerId);
			ps.setLong(4, System.currentTimeMillis());
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("盲盒留痕失败", e);
		}
	}

	/** 某用户送出的盲盒回复留痕记录（个人主页“我的盲盒”仅本人可见） */
	public List blindboxTracesOf(long ownerId) {
		return list("SELECT reply_id, message_id, real_owner_id, at FROM blindbox_replies"
				+ " WHERE real_owner_id = ? ORDER BY at DESC",
				new Object[] { Long.valueOf(ownerId) });
	}

	/* ---------------- 内部通用 ---------------- */

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
			throw new RuntimeException("查询评论失败", e);
		}
		return out;
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
			throw new RuntimeException("更新评论数据失败", e);
		}
	}
}
