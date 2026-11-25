package util;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.http.HttpServletResponse;

/**
 * ============================================================
 *  ApiResp —— REST 接口统一响应包 + 错误码常量
 * ------------------------------------------------------------
 *  前端契约（见《API接口文档》§0.1）：所有 /api/* 接口必须返回
 *
 *      { "success": true, "code": 0, "message": "ok", "data": { } }
 *
 *  失败时 success=false、code 为 §0.3 错误码表里的固定值、
 *  message 是可以直接展示给用户的中文文案、data 恒为 {}。
 *  前端只看 code 做逻辑分支（不解析 message），所以 code 一个都不能错。
 * ============================================================
 */
public class ApiResp {

	/* ---------------- 错误码常量（与文档 §0.3 逐一对应，禁止改动数值） ---------------- */
	public static final int OK              = 0;     // 成功
	public static final int PHONE_BAD        = 1001;  // 手机号格式错误
	public static final int PHONE_USED       = 1002;  // 手机号已注册
	public static final int PWD_WEAK         = 1003;  // 密码强度不足
	public static final int DISPLAY_ID_FAIL  = 1009;  // 展示 ID 生成失败
	public static final int LOGIN_BAD        = 2001;  // 账号或密码错误
	public static final int LOGIN_LOCKED     = 2002;  // 连续失败 5 次锁定 15 分钟
	public static final int BANNED           = 2003;  // 账号已被封禁
	public static final int SENSITIVE        = 4001;  // 敏感词拦截
	public static final int RATE_LIMITED     = 4002;  // 发留言限流
	public static final int NOT_FOUND        = 5001;  // 内容不存在（含私密帖被他人直开）
	public static final int NOT_OWNER        = 5002;  // 非本人操作
	public static final int DEPTH_OVER       = 5003;  // 评论层级超限（最多两级）
	public static final int MUTE_BLOCK       = 6004;  // 对方处于封禁/禁言状态
	public static final int PARAM_BAD        = 9001;  // 参数校验失败
	public static final int CSRF_BAD         = 9002;  // CSRF 校验失败
	public static final int SERVER_ERROR     = 9003;  // 服务异常
	public static final int UNAUTHORIZED     = 401;   // 未登录 / 会话失效

	/**
	 * 按错误码返回文档里的默认中文文案（{min}/{sec} 占位由调用方替换）。
	 */
	public static String defaultMsg(int code) {
		switch (code) {
			case OK:             return "ok";
			case PHONE_BAD:      return "请输入 11 位大陆手机号";
			case PHONE_USED:     return "该手机号已注册，可直接登录";
			case PWD_WEAK:       return "密码至少 8 位，且需同时包含字母与数字";
			case DISPLAY_ID_FAIL:return "展示 ID 生成失败，请稍后重试";
			case LOGIN_BAD:      return "账号或密码错误";
			case BANNED:         return "账号已被封禁，如有疑问请联系管理员";
			case SENSITIVE:      return "请文明发言";
			case RATE_LIMITED:   return "操作太频繁，请稍后再试";
			case NOT_FOUND:      return "内容不存在或已被删除";
			case NOT_OWNER:      return "只能修改或删除自己的内容";
			case DEPTH_OVER:     return "评论最多两级，无法继续回复";
			case MUTE_BLOCK:     return "对方当前无法执行该操作";
			case PARAM_BAD:      return "参数有误，请检查后重试";
			case CSRF_BAD:       return "登录状态已失效，请刷新后重试";
			case SERVER_ERROR:   return "服务开小差了，请稍后重试";
			case UNAUTHORIZED:   return "请先登录后继续";
			default:             return "操作失败，请稍后重试";
		}
	}

	/**
	 * 成功响应。
	 *
	 * @param resp    响应对象
	 * @param dataJson data 部分的 JSON 字符串（例如 "{\"liked\":true}"）；
	 *                 传 null 或空串时输出 {}
	 */
	public static void ok(HttpServletResponse resp, String dataJson) throws IOException {
		write(resp, OK, "ok", dataJson);
	}

	/** 失败响应：code + 自定义文案（文案里的占位已由调用方替换好） */
	public static void fail(HttpServletResponse resp, int code, String message) throws IOException {
		write(resp, code, message, null);
	}

	/** 失败响应：code + 文档默认文案（最常用） */
	public static void failCode(HttpServletResponse resp, int code) throws IOException {
		write(resp, code, defaultMsg(code), null);
	}

	/**
	 * 真正输出响应包的地方。注意三件事：
	 * 1. Content-Type 必须是 application/json;charset=UTF-8（前端 fetch 靠它解码中文）；
	 * 2. 未登录（401）等错误码也是放在包体里返回，HTTP 状态码保持 200——
	 *    这与前端 Mock 层的行为一致，避免 fetch 层因 4xx 直接走 catch 分支；
	 * 3. data 为空时输出 {} 而不是 null，前端拿到的结构永远一致。
	 */
	private static void write(HttpServletResponse resp, int code, String message, String dataJson) throws IOException {
		resp.setContentType("application/json;charset=UTF-8");
		resp.setHeader("Cache-Control", "no-store");   // 接口数据不允许缓存，防止拿到旧列表
		PrintWriter out = resp.getWriter();
		String data = (dataJson == null || dataJson.trim().length() == 0) ? "{}" : dataJson;
		out.print("{\"success\":" + (code == OK)
				+ ",\"code\":" + code
				+ ",\"message\":\"" + JsonUtil.esc(message)
				+ "\",\"data\":" + data + "}");
		out.flush();
	}
}
