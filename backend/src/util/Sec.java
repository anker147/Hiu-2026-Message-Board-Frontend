package util;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.List;
import java.util.Map;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * ============================================================
 *  Sec —— 安全工具集（注册 / 登录 / 脱敏 / 敏感词都靠它）
 * ------------------------------------------------------------
 *  对应前端契约的几个硬性要求：
 *  1. 密码必须 PBKDF2WithHmacSHA1 加盐哈希（《API接口文档》§鉴权）；
 *     种子数据里的格式是 pbkdf2:10000:<盐的hex>:<哈希的hex>，必须兼容；
 *  2. 列表/主页只许输出掩码字段（F6 出口脱敏）：
 *     姓名首字+**、邮箱前3位+***、手机号前3后4；
 *  3. 敏感词（F10）：命中 settings 表里的词 → 4001；
 *  4. 富文本要转“纯文本”再计字数 / 敏感词 / 搜索；
 *  5. 注册用词库随机生成昵称、随机 8 位展示 ID。
 * ============================================================
 */
public class Sec {

	/** 注册昵称词库·形容词（与前端 seed.js 的 NICK_ADJ 一致） */
	public static final String[] NICK_ADJ = {
			"快乐的", "温柔的", "元气的", "安静的", "闪闪的",
			"好奇的", "软软的", "勇敢的", "慢慢来的", "爱笑的" };

	/** 注册昵称词库·动物（与前端 seed.js 的 NICK_ANIMAL 一致） */
	public static final String[] NICK_ANIMAL = {
			"小鹿", "兔子", "狐狸", "熊猫", "考拉",
			"海豚", "小熊", "刺猬", "松鼠", "小猫" };

	/** 话题白名单（seed.js TOPICS）：发布/编辑留言时校验话题标签 */
	public static final String[] TOPICS = {
			"校园日常", "互助", "食堂", "求助", "盲盒", "日常" };

	/** 头像 emoji 个数（seed.js AVATARS 长度 = 8）：avatarEnum 合法范围 1~8 */
	public static final int AVATAR_COUNT = 8;

	/** 密码哈希迭代次数（与种子数据 pbkdf2:10000:... 保持一致） */
	private static final int ITERATIONS = 10000;

	/** 哈希输出长度：20 字节 = 160 位（SHA1 输出），种子数据就是 40 个 hex 字符 */
	private static final int KEY_BITS = 160;

	private static final SecureRandom RANDOM = new SecureRandom();

	/* ---------------- 随机串 ---------------- */

	/** 生成 len 个十六进制字符（0~9 a~f），用于令牌 / 撒盐 / 留言编号 no */
	public static String randHex(int len) {
		char[] chars = "0123456789abcdef".toCharArray();
		StringBuffer sb = new StringBuffer();
		for (int i = 0; i < len; i++) {
			sb.append(chars[RANDOM.nextInt(16)]);
		}
		return sb.toString();
	}

	/** 生成 len 位数字串（用于 8 位展示 ID，首位不能是 0 由调用方重试控制） */
	public static String randDigits(int len) {
		StringBuffer sb = new StringBuffer();
		for (int i = 0; i < len; i++) {
			sb.append(RANDOM.nextInt(10));
		}
		return sb.toString();
	}

	/**
	 * 生成新的 resourceId（36 字符以内）：u + 毫秒36进制 + 随机段。
	 * 与前端 mock 的 uuid() 形状一致，前端只当不透明字符串用。
	 */
	public static String newId() {
		return "u" + Long.toString(System.currentTimeMillis(), 36)
				+ "-" + randHex(4) + "-" + randHex(4) + "-" + randHex(12);
	}

	/** 随机昵称 = 形容词 + 动物，例如“快乐的小鹿” */
	public static String randomNickname() {
		return NICK_ADJ[RANDOM.nextInt(NICK_ADJ.length)]
				+ NICK_ANIMAL[RANDOM.nextInt(NICK_ANIMAL.length)];
	}

	/* ---------------- 密码哈希（PBKDF2WithHmacSHA1） ---------------- */

	/**
	 * 明文密码 → 存库字符串：pbkdf2:10000:<盐hex>:<哈希hex>
	 * 注册新用户时用。
	 */
	public static String hashPassword(String plain) {
		try {
			byte[] salt = new byte[16];
			RANDOM.nextBytes(salt); // 每个用户独立撒盐
			byte[] key = pbkdf2(plain, salt);
			return "pbkdf2:" + ITERATIONS + ":" + toHex(salt) + ":" + toHex(key);
		} catch (Exception e) {
			throw new RuntimeException("密码加密失败", e);
		}
	}

	/**
	 * 校验密码：把明文按存储串里的盐重新算一遍，比较结果是否一致。
	 *
	 * @param plain  用户输入的明文密码
	 * @param stored 数据库里的 pbkdf2:10000:盐:哈希
	 * @return true = 密码正确
	 */
	public static boolean verifyPassword(String plain, String stored) {
		if (plain == null || stored == null) {
			return false;
		}
		// 1.按格式拆开：pbkdf2:10000:盐:哈希
		String[] parts = stored.split(":");
		if (parts.length != 4 || !"pbkdf2".equals(parts[0])) {
			return false; // 格式不对一律算密码错误，不抛异常
		}
		try {
			byte[] salt = fromHex(parts[2]);
			byte[] expect = fromHex(parts[3]);
			byte[] actual = pbkdf2(plain, salt);
			// 2.恒定时间比较：一位一位比完，不给时序攻击留口子
			return MessageDigest.isEqual(expect, actual);
		} catch (Exception e) {
			return false;
		}
	}

	/** 真正调用 JCE 算 PBKDF2 的地方（静态参数与种子数据完全对齐） */
	private static byte[] pbkdf2(String plain, byte[] salt) throws Exception {
		PBEKeySpec spec = new PBEKeySpec(plain.toCharArray(), salt, ITERATIONS, KEY_BITS);
		SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1");
		return f.generateSecret(spec).getEncoded();
	}

	private static String toHex(byte[] b) {
		StringBuffer sb = new StringBuffer();
		for (int i = 0; i < b.length; i++) {
			String h = Integer.toHexString(b[i] & 0xff);
			if (h.length() == 1) {
				sb.append('0');
			}
			sb.append(h);
		}
		return sb.toString();
	}

	private static byte[] fromHex(String s) {
		byte[] out = new byte[s.length() / 2];
		for (int i = 0; i < out.length; i++) {
			out[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
		}
		return out;
	}

	/* ---------------- F6 出口脱敏 ---------------- */

	/** 姓名掩码：首字保留，中间打星（最长 2 个星）。“王小满” → “王**” */
	public static String maskName(String name) {
		if (name == null || name.length() == 0) {
			return "";
		}
		if (name.length() == 1) {
			return name;
		}
		int stars = Math.min(2, Math.max(1, name.length() - 2));
		StringBuffer sb = new StringBuffer();
		sb.append(name.charAt(0));
		for (int i = 0; i < stars; i++) {
			sb.append('*');
		}
		return sb.toString();
	}

	/** 邮箱掩码：@ 前 3 位 + ***@域名。“xiaoman@x.cn” → “xia***@x.cn” */
	public static String maskEmail(String email) {
		if (email == null || email.length() == 0) {
			return "";
		}
		int at = email.indexOf('@');
		if (at < 0) {
			return maskName(email); // 不是邮箱就按姓名规则打码
		}
		String local = email.substring(0, at);
		String domain = email.substring(at + 1);
		if (local.length() >= 4) {
			return local.substring(0, 3) + "***@" + domain;
		}
		return local.charAt(0) + "@***";
	}

	/** 手机号掩码：前 3 + **** + 后 4。“13800000001” → “138****0001” */
	public static String maskPhone(String phone) {
		if (phone == null || phone.length() != 11) {
			return "";
		}
		return phone.substring(0, 3) + "****" + phone.substring(7);
	}

	/* ---------------- 富文本 → 纯文本 ---------------- */

	/**
	 * 去掉 HTML 标签后的可见文字。前端发来的 content 允许是富文本，
	 * 字数校验 / 敏感词 / 搜索都必须按“用户看到的文字”算，不能按标签算。
	 * 后端没有浏览器 DOM，这里用正则近似实现：script/style 整段剔除，其余标签替换为空格。
	 */
	public static String plainContent(String content) {
		if (content == null) {
			return "";
		}
		// 1.整段剔除 <script>...</script> 和 <style>...</style>
		String s = content.replaceAll("(?is)<(script|style)[\\s\\S]*?</\\1>", " ");
		// 2.其余标签 <xxx> 全部替换成空格
		s = s.replaceAll("<[^>]*>", " ");
		return s.trim();
	}

	/* ---------------- F10 敏感词 ---------------- */

	/**
	 * 检查文本是否命中敏感词。词库从 settings 表读（GM 可配置）。
	 *
	 * @param words 敏感词列表（来自 settings.sensitive_words 的 JSON 数组）
	 * @param text  待检文本（纯文本）
	 * @return 命中的词；没命中返回 null
	 */
	public static String hitSensitive(List words, String text) {
		if (text == null || text.length() == 0 || words == null) {
			return null;
		}
		for (int i = 0; i < words.size(); i++) {
			Object w = words.get(i);
			if (w != null && text.indexOf(w.toString()) >= 0) {
				return w.toString();
			}
		}
		return null;
	}

	/**
	 * 从 settings 表的 JSON 字符串里取敏感词数组。
	 * settings.sensitive_words 存的是 ["加微信","代考",...] 这样的 JSON 数组。
	 */
	public static List parseWordList(String json) {
		Object o = Json.parse(json == null ? "[]" : json);
		if (o instanceof List) {
			return (List) o;
		}
		return new java.util.ArrayList(); // 解析失败就当空词库，不拦人
	}

	/* ---------------- localimg 引用校验 ---------------- */

	/**
	 * 封面 / 头像 / 文末图片都存 “localimg://id” 这种字符串引用
	 * （图片二进制留在前端 localStorage，后端只存引用，省流量也免上传接口）。
	 * 这里校验引用格式：必须是 localimg:// 开头且带 id，否则返回空串。
	 */
	public static String sanitizeRef(String ref) {
		if (ref == null) {
			return "";
		}
		String s = ref.trim();
		if (s.startsWith("localimg://") && s.length() > 11) {
			return s;
		}
		return "";
	}

	/**
	 * 校验一组文末图片引用：只保留合法的 localimg:// 项，去重，最多 10 张。
	 * images 参数是 Json.parse 出来的 List（元素是 String），拼回 JSON 数组字符串。
	 *
	 * @return 合法的图片引用 JSON 数组字符串，例如 ["localimg://a","localimg://b"]
	 */
	public static String sanitizeImagesJson(Object images) {
		StringBuffer sb = new StringBuffer("[");
		int kept = 0;
		if (images instanceof List) {
			List list = (List) images;
			for (int i = 0; i < list.size() && kept < 10; i++) {
				String s = sanitizeRef(Json.asString(list.get(i)));
				if (s.length() == 0) {
					continue;
				}
				if (sb.length() > 1) {
					sb.append(',');
				}
				sb.append('"').append(JsonUtil.esc(s)).append('"');
				kept++;
			}
		}
		sb.append(']');
		return sb.toString();
	}

	/**
	 * 从 Map 里取 int 值（列名对应数据库字段），取不到给默认值。
	 * 特别注意：MySQL 驱动会把 tinyint(1) 列自动映射成 Boolean
	 * （is_public/edited/is_new/hidden/is_anonymous 这些列全是），
	 * 所以这里必须先处理 Boolean，否则恒取默认值（联调踩过的坑）。
	 */
	public static int intOf(Map row, String key, int def) {
		Object v = row.get(key);
		if (v instanceof Boolean) {
			return ((Boolean) v).booleanValue() ? 1 : 0;
		}
		if (v instanceof Number) {
			return ((Number) v).intValue();
		}
		if (v instanceof String && ((String) v).length() > 0) {
			try {
				return Integer.parseInt(((String) v).trim());
			} catch (NumberFormatException e) {
				return def;
			}
		}
		return def;
	}

	/** 从 Map 里取 long 值（时间戳列都是 BIGINT），取不到给默认值 */
	public static long longOf(Map row, String key, long def) {
		Object v = row.get(key);
		if (v instanceof Boolean) {
			return ((Boolean) v).booleanValue() ? 1L : 0L;
		}
		if (v instanceof Number) {
			return ((Number) v).longValue();
		}
		if (v instanceof String && ((String) v).length() > 0) {
			try {
				return Long.parseLong(((String) v).trim());
			} catch (NumberFormatException e) {
				return def;
			}
		}
		return def;
	}

	/** 从 Map 里取字符串（数据库 NULL → 默认空串） */
	public static String strOf(Map row, String key) {
		Object v = row.get(key);
		return v == null ? "" : v.toString();
	}
}
