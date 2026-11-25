package util;

/**
 * ============================================================
 *  ApiErr —— /api/* 接口的“业务异常”
 * ------------------------------------------------------------
 *  为什么需要它？
 *  REST 接口里有大量“提前结束”的场景：没登录(401)、参数错(9001)、
 *  不是本人(5002)……如果每个分支都要层层 return，代码会非常绕。
 *  所以约定：任何一步校验不过，直接 throw new ApiErr(code)，
 *  由最外层的 ApiServlet 统一捕获，转成前端契约的统一响应包：
 *
 *      { "success": false, "code": 5002, "message": "...", "data": {} }
 *
 *  code 必须是 ApiResp 里定义过的错误码，禁止自造数字。
 * ============================================================
 */
public class ApiErr extends RuntimeException {

	private static final long serialVersionUID = 1L;

	/** 前端契约错误码（ApiResp 里定义的那套） */
	private int code;

	/**
	 * 只给错误码：文案自动用 ApiResp.defaultMsg(code) 里的默认中文提示。
	 * 90% 的场景用这个构造方法就够了。
	 */
	public ApiErr(int code) {
		super(ApiResp.defaultMsg(code));
		this.code = code;
	}

	/**
	 * 错误码 + 自定义文案：用于需要带动态数字的提示，
	 * 例如 4002 限流时提示“操作太频繁，请 N 秒后再试”。
	 */
	public ApiErr(int code, String message) {
		super(message);
		this.code = code;
	}

	/** 取出错误码，给 ApiServlet 转响应包用 */
	public int getCode() {
		return code;
	}
}
