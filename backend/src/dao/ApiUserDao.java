package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.Map;

import db.DatabaseConn;

/**
 * ============================================================
 *  ApiUserDao —— 前端契约版新表 users / login_fails 的数据访问层
 * ------------------------------------------------------------
 *  旧留言板用的是 mb_user 表；这套新表（users）是给前端 fetch
 *  适配层专用的，字段名和返回 JSON 一一对应，两套表互不影响。
 *
 *  统一约定：查询结果都装进 Map（key = 数据库列名），方便
 *  util.ApiOut 直接拼 JSON，不用再写一堆实体类。
 * ============================================================
 */
public class ApiUserDao {

	/**
	 * 按登录账号（手机号）查用户。登录 / 注册查重都用它。
	 *
	 * @return 用户 Map；不存在返回 null
	 */
	public Map findByAccount(String account) {
		return queryOne("SELECT * FROM users WHERE account = ?", account);
	}

	/** 按主键查用户（会话续期后取本人信息用） */
	public Map findById(long id) {
		return queryOne("SELECT * FROM users WHERE id = ?", Long.valueOf(id));
	}

	/** 按 8 位展示 ID 查用户（个人主页 /api/zone 用） */
	public Map findByDisplayId(String displayId) {
		return queryOne("SELECT * FROM users WHERE display_id = ?", displayId);
	}

	/** 查重：展示 ID 是否已被占用（注册时随机生成要避开） */
	public boolean displayIdExists(String displayId) {
		return queryOne("SELECT id FROM users WHERE display_id = ?", displayId) != null;
	}

	/**
	 * 插入新注册用户。
	 *
	 * @return 新用户的主键 id
	 */
	public long insert(String account, String passwordHash, String displayId,
			String nickname, int avatarEnum, String realName, String email) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum,"
					+ " real_name, email, created_at) VALUES (?,?,?,?,?,?,?,?)");
			ps.setString(1, account);
			ps.setString(2, passwordHash);
			ps.setString(3, displayId);
			ps.setString(4, nickname);
			ps.setInt(5, avatarEnum);
			ps.setString(6, realName == null ? "" : realName);
			ps.setString(7, email == null ? "" : email);
			ps.setLong(8, System.currentTimeMillis());
			ps.executeUpdate();
			// 取回自增主键（同一连接里 last_insert_id 是安全的）
			long id = 0;
			PreparedStatement q = con.prepareStatement("SELECT last_insert_id() AS lid");
			ResultSet rs = q.executeQuery();
			if (rs.next()) {
				id = rs.getLong("lid");
			}
			rs.close();
			q.close();
			ps.close();
			con.close();
			return id;
		} catch (SQLException e) {
			throw new RuntimeException("插入用户失败", e);
		}
	}

	/** 更新最后登录时间（登录成功时调用） */
	public void touchLastLogin(long id) {
		exec("UPDATE users SET last_login_at = ? WHERE id = ?",
				new Object[] { Long.valueOf(System.currentTimeMillis()), Long.valueOf(id) });
	}

	/** 更新昵称（发留言/评论时“本次昵称顺带改昵称”F4，及个人中心改昵称） */
	public void updateNickname(long id, String nickname) {
		exec("UPDATE users SET nickname = ? WHERE id = ?",
				new Object[] { nickname, Long.valueOf(id) });
	}

	/** 更新个性签名 */
	public void updateBio(long id, String bio) {
		exec("UPDATE users SET bio = ? WHERE id = ?",
				new Object[] { bio == null ? "" : bio, Long.valueOf(id) });
	}

	/** 更新 emoji 头像编号（1~8） */
	public void updateAvatarEnum(long id, int avatarEnum) {
		exec("UPDATE users SET avatar_enum = ? WHERE id = ?",
				new Object[] { Integer.valueOf(avatarEnum), Long.valueOf(id) });
	}

	/** 更新真实头像引用（localimg://xxx；空串 = 回退 emoji 头像） */
	public void updateAvatarUrl(long id, String avatarUrl) {
		exec("UPDATE users SET avatar_url = ? WHERE id = ?",
				new Object[] { avatarUrl == null ? "" : avatarUrl, Long.valueOf(id) });
	}

	/** 更新三个隐私公开开关（flag_name / flag_email / flag_phone） */
	public void updatePrivacy(long id, boolean flagName, boolean flagEmail, boolean flagPhone) {
		exec("UPDATE users SET flag_name = ?, flag_email = ?, flag_phone = ? WHERE id = ?",
				new Object[] {
						Integer.valueOf(flagName ? 1 : 0),
						Integer.valueOf(flagEmail ? 1 : 0),
						Integer.valueOf(flagPhone ? 1 : 0),
						Long.valueOf(id) });
	}

	/** 更新互动展示开关（flag_liked / flag_favorite；-1 = 不改，保留原值） */
	public void updateInteractionFlags(long id, int flagLiked, int flagFavorite) {
		if (flagLiked >= 0) {
			exec("UPDATE users SET flag_liked = ? WHERE id = ?",
					new Object[] { Integer.valueOf(flagLiked), Long.valueOf(id) });
		}
		if (flagFavorite >= 0) {
			exec("UPDATE users SET flag_favorite = ? WHERE id = ?",
					new Object[] { Integer.valueOf(flagFavorite), Long.valueOf(id) });
		}
	}

	/** 更新真实姓名 / 邮箱（手机号是登录账号，不允许改） */
	public void updateSensitive(long id, String realName, String email) {
		if (realName != null) {
			exec("UPDATE users SET real_name = ? WHERE id = ?",
					new Object[] { realName, Long.valueOf(id) });
		}
		if (email != null) {
			exec("UPDATE users SET email = ? WHERE id = ?",
					new Object[] { email, Long.valueOf(id) });
		}
	}

	/* ---------------- 登录失败锁定（login_fails 表） ---------------- */

	/**
	 * 查某手机号的失败记录。
	 *
	 * @return {fail_count, lock_until}；没有记录返回 null
	 */
	public Map findLoginFail(String phone) {
		return queryOne("SELECT fail_count, lock_until FROM login_fails WHERE phone = ?", phone);
	}

	/** 失败次数 +1；达到 5 次则锁定 15 分钟并把计数清零 */
	public void recordLoginFail(String phone) {
		try {
			Map rec = findLoginFail(phone);
			Connection con = DatabaseConn.getConnection();
			if (rec == null) {
				// 第一次失败：直接插一条
				PreparedStatement ps = con.prepareStatement(
						"INSERT INTO login_fails (phone, fail_count, lock_until) VALUES (?,1,0)");
				ps.setString(1, phone);
				ps.executeUpdate();
				ps.close();
			} else {
				int count = Sec_int(rec.get("fail_count")) + 1;
				long lockUntil = 0;
				if (count >= 5) {
					// 连续错 5 次：锁 15 分钟，计数清零（下次从 1 重新数）
					lockUntil = System.currentTimeMillis() + 15 * 60 * 1000L;
					count = 0;
				}
				PreparedStatement ps = con.prepareStatement(
						"UPDATE login_fails SET fail_count = ?, lock_until = ? WHERE phone = ?");
				ps.setInt(1, count);
				ps.setLong(2, lockUntil);
				ps.setString(3, phone);
				ps.executeUpdate();
				ps.close();
			}
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("记录登录失败出错", e);
		}
	}

	/** 登录成功：清空该手机号的失败记录 */
	public void clearLoginFail(String phone) {
		exec("DELETE FROM login_fails WHERE phone = ?", new Object[] { phone });
	}

	/* ---------------- 内部通用方法 ---------------- */

	/** 查询单行并装进 Map（列名 → 值）；没有结果返回 null */
	private Map queryOne(String sql, Object param) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(sql);
			ps.setObject(1, param);
			ResultSet rs = ps.executeQuery();
			Map row = null;
			if (rs.next()) {
				row = toMap(rs);
			}
			rs.close();
			ps.close();
			con.close();
			return row;
		} catch (SQLException e) {
			throw new RuntimeException("查询用户失败", e);
		}
	}

	/** 执行一条写 SQL（参数数组可变长度） */
	private void exec(String sql, Object[] params) {
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
			throw new RuntimeException("更新用户失败", e);
		}
	}

	/** ResultSet → Map（按列名取值，数值保持原类型） */
	static Map toMap(ResultSet rs) throws SQLException {
		Map row = new HashMap();
		java.sql.ResultSetMetaData md = rs.getMetaData();
		for (int i = 1; i <= md.getColumnCount(); i++) {
			row.put(md.getColumnLabel(i), rs.getObject(i));
		}
		return row;
	}

	/** 小工具：Object → int（MySQL 驱动可能给 Long / Integer / BigInteger） */
	static int Sec_int(Object v) {
		if (v instanceof Number) {
			return ((Number) v).intValue();
		}
		return 0;
	}
}
