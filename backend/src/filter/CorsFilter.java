package filter;

import java.io.IOException;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * ============================================================
 *  CorsFilter —— 跨域过滤器（前后端分离联调的关键！）
 * ------------------------------------------------------------
 *  背景：队友的前端是独立跑的（例如 http://localhost:3000 或
 *  直接双击打开的静态页），而本后端在 http://localhost:8080/TestJDBC。
 *  浏览器的“同源策略”会拦截跨域请求 —— 后端必须在响应里
 *  带上 CORS 头，浏览器才放行前端读取响应。
 *
 *  做三件事：
 *  1. 每个响应都补上 Access-Control-Allow-* 响应头；
 *  2. 放行自定义头 Content-Type / Authorization（我们的 Bearer
 *     令牌就放在 Authorization 里）；
 *  3. OPTIONS 预检请求直接回 200 短路 —— 预检不进业务逻辑，
 *     否则会被当成接口请求报错。
 *
 *  web.xml 里配置在 CorsFilter → /api/*，只拦 REST 接口，
 *  不影响旧 JSP 页面的正常访问。
 * ============================================================
 */
public class CorsFilter implements Filter {

	/** 初始化（本过滤器不需要读配置参数，留空实现） */
	public void init(FilterConfig config) throws ServletException {
	}

	/**
	 * 过滤主逻辑：补 CORS 响应头；OPTIONS 预检短路返回。
	 */
	public void doFilter(ServletRequest request, ServletResponse response,
			FilterChain chain) throws IOException, ServletException {

		HttpServletRequest req = (HttpServletRequest) request;
		HttpServletResponse resp = (HttpServletResponse) response;

		// 1.允许的来源：先用请求自带的 Origin 回显（开发阶段最省事）。
		//    没带 Origin 的请求（同源调用 / curl 测试）给 * 兜底。
		String origin = req.getHeader("Origin");
		if (origin == null || origin.length() == 0) {
			origin = "*";
		}
		resp.setHeader("Access-Control-Allow-Origin", origin);

		// 2.允许的 HTTP 方法：前端适配层会用 GET/POST/PUT/DELETE/OPTIONS
		resp.setHeader("Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS");

		// 3.允许的自定义请求头：Content-Type（JSON 体）、
		//   Authorization（Bearer 令牌）、X-Requested-With（Ajax 标记）
		resp.setHeader("Access-Control-Allow-Headers",
				"Content-Type, Authorization, X-Requested-With");

		// 4.预检结果让浏览器缓存 1 小时，减少 OPTIONS 次数
		resp.setHeader("Access-Control-Max-Age", "3600");

		// 5.明确不需要携带 Cookie（我们用 Bearer 令牌，不走 Cookie）
		resp.setHeader("Access-Control-Allow-Credentials", "false");

		// 6.OPTIONS 预检：直接 200 短路，不进业务 Servlet
		if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
			resp.setStatus(HttpServletResponse.SC_OK);
			return;
		}

		// 7.正常请求：放行，继续走 ApiServlet
		chain.doFilter(request, response);
	}

	/** 销毁（无资源需要释放） */
	public void destroy() {
	}
}
