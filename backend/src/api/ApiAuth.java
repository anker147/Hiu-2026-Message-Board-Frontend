package api;

import java.util.Map;
import java.util.regex.Pattern;

import util.ApiErr;
import util.ApiReq;
import util.ApiResp;
import util.Sec;
import util.TokenAuth;
import dao.ApiUserDao;

/**
 * ============================================================
 *  ApiAuth —— 账号相关接口（API-01~03 + session 查询）
 * ------------------------------------------------------------
 *  register  POST /api/register  手机号注册（自动随机 ID/网名，注册即登录）
 *  login     POST /api/login     手机号+密码登录（5 次失败锁 15 分钟）
 *  logout    POST /api/logout    退出登录（令牌立即作废）
 *  session   GET  /api/session   查询当前登录状态（前端启动时调用）
 * ============================================================
 */
public class ApiAuth {

	/** 大陆手机号格式：1 开头，第二位 3~9，共 11 位 */
	private static final Pattern PHONE = Pattern.compile("^1[3-9]\\d{9}$");

	/** 邮箱格式（选填项，填了才校验） */
	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

	/**
	 * API-01 注册。
	 * 流程：格式校验 → 查重 → 密码强度 → 随机展示 ID/昵称/头像 →
	 * 落库 → 建立会话 → 返回 {displayId, nickname, avatar}。
	 * 注册成功即建立会话（流程 A：免二次登录）。
	 */
	public static String register(ApiReq q) {
		// 1.手机号：去掉空格后正则校验 → 1001
		String phone = q.pTrim("phone");
		if (phone == null || !PHONE.matcher(phone).matches()) {
			throw new ApiErr(ApiResp.PHONE_BAD);
		}
		ApiUserDao dao = new ApiUserDao();
		// 2.查重：该手机号已注册 → 1002
		if (dao.findByAccount(phone) != null) {
			throw new ApiErr(ApiResp.PHONE_USED);
		}
		// 3.密码强度：≥8 位且同时含字母和数字 → 1003
		String pwd = q.p("password");
		if (!validPassword(pwd)) {
			throw new ApiErr(ApiResp.PWD_WEAK);
		}
		// 4.8 位展示 ID：随机生成，首位不为 0，撞车重试 5 次 → 全失败 1009
		String displayId = null;
		for (int i = 0; i < 5 && displayId == null; i++) {
			String cand = Sec.randDigits(8);
			if (cand.charAt(0) != '0' && !dao.displayIdExists(cand)) {
				displayId = cand;
			}
		}
		if (displayId == null) {
			throw new ApiErr(ApiResp.DISPLAY_ID_FAIL);
		}
		// 5.随机网名 + 随机 emoji 头像（词库与前端 seed.js 一致）
		String nickname = Sec.randomNickname();
		int avatar = 1 + (int) (Math.random() * Sec.AVATAR_COUNT);
		// 6.落库：密码 PBKDF2 加盐哈希，明文不存
		long id = dao.insert(phone, Sec.hashPassword(pwd), displayId, nickname,
				avatar, q.pTrim("name"), q.pTrim("email"));
		// 7.注册成功即登录：建立 Bearer 会话（token/csrf 回给前端适配层保存）
		TokenAuth.Session s = TokenAuth.create(id);
		// 8.按契约回显（契约三项 + 适配层必需的 token/csrf）
		return "{\"displayId\":\"" + displayId + "\",\"nickname\":\"" + nickname
				+ "\",\"avatar\":" + avatar
				+ ",\"token\":\"" + s.token + "\",\"csrf\":\"" + s.csrf + "\"}";
	}

	/**
	 * API-02 登录。
	 * 防爆破：同手机号连续失败 5 次 → 锁定 15 分钟（2002 带剩余分钟）。
	 * 成功：清失败记录 → 刷 last_login_at → 建会话 → 回显用户面。
	 */
	public static String login(ApiReq q) {
		String phone = q.pTrim("phone");
		ApiUserDao dao = new ApiUserDao();
		// 1.先查锁定记录：还在锁定期内直接拒绝（不管密码对不对）
		Map rec = dao.findLoginFail(phone == null ? "" : phone);
		if (rec != null) {
			long lockUntil = Sec.longOf(rec, "lock_until", 0);
			if (lockUntil > System.currentTimeMillis()) {
				// 剩余分钟数（向上取整，最少 1 分钟）
				long min = Math.max(1, (lockUntil - System.currentTimeMillis() + 59999) / 60000);
				throw new ApiErr(ApiResp.LOGIN_LOCKED,
						"尝试次数过多，请 " + min + " 分钟后再试");
			}
		}
		// 2.查用户 + 验密码（PBKDF2 恒定时间比较）
		Map user = phone == null ? null : dao.findByAccount(phone);
		boolean pass = user != null && Sec.verifyPassword(q.p("password"),
				Sec.strOf(user, "password_hash"));
		if (!pass) {
			// 3.失败计数：+1；攒满 5 次锁定 15 分钟
			dao.recordLoginFail(phone == null ? "" : phone);
			Map fresh = dao.findLoginFail(phone == null ? "" : phone);
			if (fresh != null && Sec.longOf(fresh, "lock_until", 0) > System.currentTimeMillis()) {
				throw new ApiErr(ApiResp.LOGIN_LOCKED, "尝试次数过多，请 15 分钟后再试");
			}
			throw new ApiErr(ApiResp.LOGIN_BAD); // 2001 账号或密码错误（文案固定，不暴露哪个错）
		}
		// 4.封禁检查：被封账号不给登录（2003）
		if ("banned".equals(Sec.strOf(user, "status"))) {
			throw new ApiErr(ApiResp.BANNED);
		}
		// 5.登录成功：清失败记录 → 刷最后登录时间 → 建会话
		dao.clearLoginFail(phone);
		dao.touchLastLogin(Sec.longOf(user, "id", 0));
		TokenAuth.Session s = TokenAuth.create(Sec.longOf(user, "id", 0));
		return "{\"displayId\":\"" + Sec.strOf(user, "display_id")
				+ "\",\"nickname\":\"" + Sec.strOf(user, "nickname")
				+ "\",\"avatar\":" + Sec.intOf(user, "avatar_enum", 1)
				+ ",\"token\":\"" + s.token + "\",\"csrf\":\"" + s.csrf + "\"}";
	}

	/**
	 * API-03 退出登录。
	 * 会话不存在也返回 ok（幂等）；存在则要求 csrf 正确才销毁。
	 */
	public static String logout(ApiReq q) {
		TokenAuth.Session s = TokenAuth.find(q.bearer(), false);
		if (s == null) {
			return "{}"; // 本来就没登录，退出也是成功
		}
		String csrf = q.pTrim("csrf");
		if (csrf == null || !csrf.equals(s.csrf)) {
			throw new ApiErr(ApiResp.CSRF_BAD); // 9002
		}
		TokenAuth.destroy(s.token);
		return "{}";
	}

	/**
	 * session 查询：前端启动/刷新页面时调，决定导航栏显示登录还是头像。
	 * 未登录返回 {loggedIn:false}；登录返回基本信息 + csrf。
	 */
	public static String session(ApiReq q) {
		TokenAuth.Session s = TokenAuth.find(q.bearer(), true);
		if (s == null) {
			return "{\"loggedIn\":false}";
		}
		ApiUserDao dao = new ApiUserDao();
		Map u = dao.findById(s.userId);
		if (u == null || "banned".equals(Sec.strOf(u, "status"))) {
			return "{\"loggedIn\":false}";
		}
		boolean admin = "admin".equals(Sec.strOf(u, "role"));
		StringBuffer sb = new StringBuffer();
		sb.append("{\"loggedIn\":true,\"userId\":").append(Sec.longOf(u, "id", 0))
				.append(",\"nickname\":\"").append(Sec.strOf(u, "nickname"))
				.append("\",\"avatarEnum\":").append(Sec.intOf(u, "avatar_enum", 1))
				.append(",\"avatarUrl\":\"").append(Sec.strOf(u, "avatar_url"))
				.append("\",\"displayId\":\"").append(Sec.strOf(u, "display_id"))
				.append("\",\"role\":\"").append(Sec.strOf(u, "role").length() == 0
						? "user" : Sec.strOf(u, "role"))
				.append("\",\"isAdmin\":").append(admin)
				.append(",\"csrf\":\"").append(s.csrf).append("\"}");
		return sb.toString();
	}

	/** 密码强度：≥8 位，同时包含字母和数字 */
	private static boolean validPassword(String pwd) {
		if (pwd == null || pwd.length() < 8) {
			return false;
		}
		boolean hasLetter = false;
		boolean hasDigit = false;
		for (int i = 0; i < pwd.length(); i++) {
			char c = pwd.charAt(i);
			if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
				hasLetter = true;
			}
			if (c >= '0' && c <= '9') {
				hasDigit = true;
			}
		}
		return hasLetter && hasDigit;
	}
}
