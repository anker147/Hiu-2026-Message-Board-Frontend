package util;

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
 *  TokenAuth —— Bearer 令牌会话（sessions 表实现）
 * ------------------------------------------------------------
 *  与旧版 Session Cookie 方式不同，前端契约要求：
 *  1. 登录成功后后端发一个随机 token（48 位 hex）+ csrf 令牌（24 位 hex）；
 *  2. 前端把 token 放请求头 Authorization: Bearer <token>，
 *     把 csrf 放在每个写请求的参数里（参数名 csrf）；
 *  3. 会话空闲 30 分钟自动失效 → 再访问返回 401（PRD F2）；
 *  4. 退出登录后 token 立即删除 → 重放旧 token 返回 401；
 *  5. 读请求：校验 token 并“续期”（last_active 顺延 30 分钟）；
 *     写请求：还要比对参数里的 csrf，不一致 → 9002。
 *
 *  会话信息存在 sessions 表里，重启 Tomcat 也不丢。
 * ============================================================
 */
public class TokenAuth {

	/** 会话空闲超时时长：30 分钟（毫秒），与前端 mock 的 SESSION_TTL 一致 */
	public static final long TTL = 30 * 60 * 1000L;

	/**
	 * 会话信息容器：token / userId / csrf。
	 * 校验通过后把它传给各业务方法，避免重复查库。
	 */
	public static class Session {
		public String token;
		public long userId;
		public String csrf;
	}

	/**
	 * 新建会话：登录成功 / 注册成功时调用。
	 *
	 * @param userId 用户主键
	 * @return 填好的 Session（含 token 和 csrf，登录响应的 data 里要回给前端）
	 */
	public static Session create(long userId) {
		Session s = new Session();
		s.token = Sec.randHex(48);   // 48 位随机令牌，猜不出来
		s.csrf = Sec.randHex(24);    // 24 位 CSRF 令牌，写操作必带
		s.userId = userId;
		long now = System.currentTimeMillis();
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO sessions (token, user_id, csrf, last_active, created_at) VALUES (?,?,?,?,?)");
			ps.setString(1, s.token);
			ps.setLong(2, s.userId);
			ps.setString(3, s.csrf);
			ps.setLong(4, now);
			ps.setLong(5, now);
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("创建会话失败", e);
		}
		return s;
	}

	/**
	 * 按 token 校验会话。
	 *
	 * @param token Bearer 令牌；null 或库里没有 → 返回 null（上层抛 401）
	 * @param touch true = 读请求，校验通过顺便把 last_active 续期
	 * @return 会话信息；已超时 / 不存在时返回 null
	 */
	public static Session find(String token, boolean touch) {
		if (token == null || token.length() == 0) {
			return null;
		}
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement(
					"SELECT user_id, csrf, last_active FROM sessions WHERE token = ?");
			ps.setString(1, token);
			ResultSet rs = ps.executeQuery();
			Session s = null;
			if (rs.next()) {
				long lastActive = rs.getLong("last_active"); // 列是 BIGINT 毫秒，直接 getLong
				long now = System.currentTimeMillis();
				// 1.空闲超时检查：超过 30 分钟没动静 → 视为失效，顺手删掉
				if (now - lastActive > TTL) {
					PreparedStatement del = con.prepareStatement("DELETE FROM sessions WHERE token = ?");
					del.setString(1, token);
					del.executeUpdate();
					del.close();
				} else {
					s = new Session();
					s.token = token;
					s.userId = rs.getLong("user_id");
					s.csrf = rs.getString("csrf");
					// 2.读请求续期：把 last_active 刷成当前时间
					if (touch) {
						PreparedStatement up = con.prepareStatement(
								"UPDATE sessions SET last_active = ? WHERE token = ?");
						up.setLong(1, now);
						up.setString(2, token);
						up.executeUpdate();
						up.close();
					}
				}
			}
			rs.close();
			ps.close();
			con.close();
			return s;
		} catch (SQLException e) {
			throw new RuntimeException("会话查询失败", e);
		}
	}

	/**
	 * 退出登录：删除该 token 的会话记录，令牌立即作废（重放 → 401）。
	 */
	public static void destroy(String token) {
		if (token == null) {
			return;
		}
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement("DELETE FROM sessions WHERE token = ?");
			ps.setString(1, token);
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("销毁会话失败", e);
		}
	}

	/**
	 * 统一“读请求鉴权”：取 Bearer 令牌 → 校验会话（顺延超时）。
	 * 失败直接抛 ApiErr(401)，由 ApiServlet 统一转响应包。
	 */
	public static Session authRead(ApiReq q) {
		Session s = find(q.bearer(), true);
		if (s == null) {
			throw new ApiErr(ApiResp.UNAUTHORIZED); // 401 请先登录
		}
		return s;
	}

	/**
	 * 统一“写请求鉴权”：读鉴权 + CSRF 比对。
	 * 前端每个写请求都要带参数 csrf（JSON 体或表单均可），与登录时发的 csrf 一致。
	 * 缺失或不匹配 → 9002（防跨站请求伪造）。
	 */
	public static Session authWrite(ApiReq q) {
		Session s = authRead(q); // 先确认登录
		String csrf = q.pTrim("csrf");
		if (csrf == null || !csrf.equals(s.csrf)) {
			throw new ApiErr(ApiResp.CSRF_BAD); // 9002 CSRF 校验失败
		}
		return s;
	}

	/**
	 * 封禁用户的所有会话（GM 功能预留；本次核心接口也会在封禁时用到）：
	 * 把该用户全部 token 删掉，旧令牌重放 → 401。
	 */
	public static void revokeAll(long userId) {
		try {
			Connection con = DatabaseConn.getConnection();
			PreparedStatement ps = con.prepareStatement("DELETE FROM sessions WHERE user_id = ?");
			ps.setLong(1, userId);
			ps.executeUpdate();
			ps.close();
			con.close();
		} catch (SQLException e) {
			throw new RuntimeException("吊销会话失败", e);
		}
	}

	/**
	 * 禁言检查（6004）：封禁/禁言用户不能发留言、评论、回复、盲盒回复。
	 * mute_until 是毫秒时间戳，0 = 从未禁言；9999-12-31 表示永久禁言。
	 * 没被禁言时原样返回，被禁言时抛 6004。
	 */
	public static void muteGate(Map user) {
		long muteUntil = Sec.longOf(user, "mute_until", 0);
		if (muteUntil > System.currentTimeMillis()) {
			throw new ApiErr(ApiResp.MUTE_BLOCK); // 6004 对方处于禁言状态
		}
	}
}
