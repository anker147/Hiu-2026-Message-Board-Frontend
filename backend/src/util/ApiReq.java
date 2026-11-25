package util;

import java.io.BufferedReader;
import java.io.IOException;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

/**
 * ============================================================
 *  ApiReq —— /api/* 请求的“参数读取器”
 * ------------------------------------------------------------
 *  解决什么问题？
 *  1. 前端 fetch 可能发 JSON 请求体（Content-Type: application/json），
 *     Servlet 2.5 的 request.getParameter() 读不到 JSON 里的字段；
 *  2. 也可能发表单格式（application/x-www-form-urlencoded）；
 *  3. 还可能有 URL 查询参数（GET /api/messages?tab=mine&q=晚霞）。
 *
 *  所以做一个统一入口 p(name)：按 “URL 参数 → 表单参数 → JSON 体”
 *  的顺序找，找到第一个非空值就返回。业务代码不用关心前端发的是哪种。
 *
 *  另外提供 bearer() 取 Authorization 头里的 token（前端契约：
 *  登录令牌放在 "Authorization: Bearer <token>" 头里，而不是 Cookie）。
 * ============================================================
 */
public class ApiReq {

	/** 原始请求对象，取查询参数、请求头时要用 */
	private HttpServletRequest req;

	/** JSON 请求体解析出来的 Map（不是 JSON 请求时为 null） */
	private Map bodyMap;

	/**
	 * 构造时就把请求体读完并尝试解析。
	 * 注意：请求体流只能读一次，所以必须在构造时读走并保存。
	 *
	 * @param req 当前请求
	 */
	public ApiReq(HttpServletRequest req) {
		this.req = req;
		readBody();
	}

	/**
	 * 读请求体：只处理 application/json 格式，解析成 Map 存起来。
	 * 表单格式不用管 —— Tomcat 会自己解析并放进 getParameter() 里。
	 */
	private void readBody() {
		String ct = req.getContentType();
		if (ct == null || ct.indexOf("application/json") < 0) {
			return; // 不是 JSON 请求体，直接跳过
		}
		try {
			StringBuffer sb = new StringBuffer();
			BufferedReader r = req.getReader(); // 按请求编码读文本
			String line;
			while ((line = r.readLine()) != null) {
				sb.append(line).append('\n');
			}
			Object o = Json.parse(sb.toString()); // 用我们自己的零依赖解析器
			if (o instanceof Map) {
				this.bodyMap = (Map) o; // 合法的 JSON 对象才存
			}
		} catch (IOException e) {
			// 读体失败按“没有请求体”处理，后续按参数缺失报 9001
			this.bodyMap = null;
		}
	}

	/**
	 * 统一取参数：URL 查询参数 → 表单参数 → JSON 请求体字段。
	 *
	 * @param name 参数名（例如 "csrf"、"content"）
	 * @return 找到的字符串值；全都没有时返回 null
	 */
	public String p(String name) {
		// 1.URL 查询参数（?tab=mine）
		String v = req.getParameter(name);
		if (v != null && v.trim().length() > 0) {
			return v;
		}
		// 2.JSON 请求体里的同名字段（fetch 适配层主要走这条路）
		if (bodyMap != null && bodyMap.containsKey(name)) {
			return Json.asString(bodyMap.get(name));
		}
		// 3.都没有
		return null;
	}

	/**
	 * 取参数并去掉首尾空格。业务校验前统一用它，防止“多打了一个空格”。
	 */
	public String pTrim(String name) {
		String v = p(name);
		return v == null ? null : v.trim();
	}

	/**
	 * 从 Authorization 请求头取 Bearer 令牌。
	 * 前端约定头格式： Authorization: Bearer xxxxxxxx
	 *
	 * @return 令牌字符串；没有头或格式不对时返回 null
	 */
	public String bearer() {
		String h = req.getHeader("Authorization");
		if (h == null) {
			return null;
		}
		if (h.startsWith("Bearer ")) {
			return h.substring(7).trim(); // 去掉 "Bearer " 前缀
		}
		return null;
	}

	/** 暴露原始请求，偶尔需要读请求头（比如 Origin）时用 */
	public HttpServletRequest raw() {
		return req;
	}
}
