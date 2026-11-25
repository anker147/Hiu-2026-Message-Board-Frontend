package filter;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

/**
 * ============================================================
 *  SafetyFilter —— 安全防御过滤器（答辩加分项）
 * ------------------------------------------------------------
 *  过滤器（Filter）是什么？
 *  它像一道“安检门”立在 Servlet 前面：浏览器发来的请求先经过它，
 *  它检查通过才放行（chain.doFilter），检查不通过就直接拦下来。
 *  好处是：原有的 AddMessageServlet / AddCommentServlet 一行都不用改。
 *
 *  本类负责两件事：
 *  1. 敏感词过滤：留言 / 评论内容里只要出现“加微信、代考、办证”等词，
 *     直接拒绝，不写入数据库，并提示“包含违规词汇，请文明发言”；
 *  2. 防刷（限流）：同一个账号两次发留言的间隔小于 10 秒，直接拦截，
 *     提示“发言太快了，请稍后再试”。（用 Session 记上次发言时间）
 *
 *  在 web.xml 里注册后，只对下面两个地址生效：
 *      /AddMessageServlet   （发留言）
 *      /AddCommentServlet   （发评论 / 回复）
 * ============================================================
 */
public class SafetyFilter implements Filter {

	/**
	 * 敏感词数组。
	 * 想加新词，直接往数组里加一项就行，不用改任何其它代码。
	 * 判断方式很简单：内容.indexOf(词) >= 0 就说明包含。
	 */
	private static final String[] BAD_WORDS = {
			"加微信", "代考", "办证", "傻逼", "广告",
			"刷单", "博彩", "裸聊", "代写论文"
	};

	/** 两次留言之间最小间隔：10 秒（单位是毫秒，所以 10 * 1000） */
	private static final long MIN_GAP_MILLIS = 10 * 1000L;

	/** 过滤器初始化：这里不需要做什么，但方法是接口要求的，必须留着 */
	public void init(FilterConfig config) throws ServletException {
	}

	/**
	 * 核心方法：每个被拦截的请求都会进来。
	 *
	 * @param req  请求对象（其实是 HttpServletRequest，需要强转）
	 * @param resp 响应对象（其实是 HttpServletResponse，需要强转）
	 * @param chain 过滤器链，调用 chain.doFilter 表示“放行，交给后面的 Servlet”
	 */
	public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
			throws IOException, ServletException {

		//1.转成 HTTP 版的对象，才能用 session、请求头、重定向这些功能
		HttpServletRequest request = (HttpServletRequest) req;
		HttpServletResponse response = (HttpServletResponse) resp;

		//2.统一 UTF-8（必须在 getParameter 之前设置，否则中文会是乱码）
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");

		//3.判断当前请求是“发留言”还是“发评论”，后面防刷只对留言生效
		String uri = request.getServletPath();                     //例如 /AddMessageServlet
		boolean isAddMessage = uri != null && uri.indexOf("AddMessageServlet") > -1;

		//4.判断是不是 Ajax 请求：
		//  a) 我们自己写的 JS 会加一个 X-Requested-With 请求头；
		//  b) 也支持手动传 ajax=1 参数，方便测试。
		//  为什么区分？因为 Ajax 要返回 JSON，普通表单提交要重定向回页面。
		boolean isAjax = "XMLHttpRequest".equals(request.getHeader("X-Requested-With"))
				|| "1".equals(request.getParameter("ajax"));

		//5.============ 第一道安检：敏感词 ============
		String content = request.getParameter("content");          //留言内容 / 评论内容
		String nickname = request.getParameter("nickname");        //留言昵称（防止用昵称打广告）

		//先在内容里找，内容没问题再找昵称
		String badWord = findBadWord(content);
		if (badWord == null) {
			badWord = findBadWord(nickname);
		}

		//找到了违规词 → 拦下来，不让他进 Servlet，数据库自然也就不会出现这条内容
		if (badWord != null) {
			block(request, response, isAjax, "包含违规词汇【" + badWord + "】，请文明发言！");
			return;                                                //直接结束，不调用 chain.doFilter
		}

		//6.============ 第二道安检：防刷（只针对发留言） ============
		if (isAddMessage) {
			HttpSession session = request.getSession();            //拿到当前用户的 session
			Long lastTime = (Long) session.getAttribute("lastMessageTime"); //上次发言时间（毫秒）
			long now = System.currentTimeMillis();                 //现在的时间（毫秒）

			if (lastTime != null) {
				//算出两次发言相隔多少秒（整数除法，不足 1 秒算 0 秒）
				long gapSeconds = (now - lastTime.longValue()) / 1000;
				if (gapSeconds < 10) {
					long wait = 10 - gapSeconds;                   //还要等几秒
					block(request, response, isAjax, "发言太快了，请 " + wait + " 秒后再试～");
					return;                                        //拦下来
				}
			}

			//检查通过：把这次的时间记到 session 里，下次提交时用来比较
			session.setAttribute("lastMessageTime", Long.valueOf(now));
		}

		//7.两道安检都通过 → 放行，交给后面的 AddMessageServlet / AddCommentServlet 处理
		chain.doFilter(req, resp);
	}

	/**
	 * 在文本里查找敏感词。
	 *
	 * @param text 要检查的文本，可以是 null
	 * @return 命中的第一个敏感词；没命中返回 null
	 */
	private String findBadWord(String text) {
		//1.空文本不用检查
		if (text == null || text.trim().equals("")) {
			return null;
		}
		//2.把内容转成小写，这样英文敏感词（以后要加的话）也能匹配
		String lower = text.toLowerCase();
		//3.挨个比对数组里的词
		for (int i = 0; i < BAD_WORDS.length; i++) {
			if (lower.indexOf(BAD_WORDS[i].toLowerCase()) > -1) {
				return BAD_WORDS[i];                                //命中，返回这个词
			}
		}
		return null;                                                //全部没命中
	}

	/**
	 * 拦截之后的统一处理。
	 *
	 * Ajax 请求：返回 JSON，前端用弹窗显示 message；
	 * 普通表单：把提示塞进 session，然后重定向回留言板，
	 *           board.jsp 加载时会用 JS 弹出提示框。
	 */
	private void block(HttpServletRequest request, HttpServletResponse response,
			boolean isAjax, String message) throws IOException {

		if (isAjax) {
			//---- Ajax：返回 {"success":false,"message":"..."} ----
			response.setContentType("application/json;charset=UTF-8");
			PrintWriter out = response.getWriter();
			out.print("{\"success\":false,\"message\":\"" + util.JsonUtil.esc(message) + "\"}");
			out.flush();
			return;
		}

		//---- 普通表单：提示 + 重定向 ----
		HttpSession session = request.getSession();
		//tip 是页面顶部那条小提示（原来就有的机制，保持不变）
		session.setAttribute("tip", message);
		//safetyAlert 是给 JS 弹窗用的，页面读一次就删，避免反复弹
		session.setAttribute("safetyAlert", message);

		//重定向回留言列表（加 contextPath 是为了部署路径变化时也不会 404）
		response.sendRedirect(request.getContextPath() + "/QueryMessageServlet");
	}

	/** 过滤器销毁：不需要处理 */
	public void destroy() {
	}
}
