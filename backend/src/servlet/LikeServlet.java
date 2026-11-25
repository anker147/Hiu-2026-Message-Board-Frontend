package servlet;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.UserDomain;
import service.MessageService;

/**
 * ============================================================
 *  LikeServlet —— 给【留言】点赞 / 取消点赞
 * ------------------------------------------------------------
 *  改造说明（本次为“Ajax 无刷新点赞”）：
 *  以前：表单提交 → 后端改数据库 → sendRedirect 刷新整个页面。
 *  现在：前端用 Ajax 请求这个 Servlet → 后端改完数据库直接返回 JSON
 *        → 前端只改按钮上的图标和数字，页面完全不刷新。
 *
 *  为了兼容旧代码，这里做了两种处理：
 *  · 是 Ajax 请求 → 返回 JSON：{"success":true,"liked":true,"count":5}
 *  · 不是 Ajax（比如用户禁用 JS，或老表单还在用）→ 保持原来的重定向刷新
 * ============================================================
 */
public class LikeServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理（点赞没有中文参数，但保持项目统一习惯）
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");

		//2.判断这次是不是 Ajax 请求
		//  我们自己的 JS 会带上 X-Requested-With 头；另外也支持 ?ajax=1 方便用浏览器/curl 测试
		boolean isAjax = "XMLHttpRequest".equals(request.getHeader("X-Requested-With"))
				|| "1".equals(request.getParameter("ajax"));

		//3.判断登录：点赞必须知道是谁点的
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			if (isAjax) {
				//没登录的 Ajax 请求：返回 JSON 提示，前端弹窗让他去登录
				response.setContentType("application/json;charset=UTF-8");
				PrintWriter out = response.getWriter();
				out.print("{\"success\":false,\"message\":\"登录后才能点赞哦～\"}");
				out.flush();
			} else {
				//普通请求：还是跳登录页
				response.sendRedirect("login.jsp");
			}
			return;
		}

		//4.拿到留言 id（页面按钮上的 data-id，提交时会变成 message_id 参数）
		String idStr = request.getParameter("message_id");
		if (idStr == null || idStr.trim().equals("")) {
			if (isAjax) {
				response.setContentType("application/json;charset=UTF-8");
				PrintWriter out = response.getWriter();
				out.print("{\"success\":false,\"message\":\"参数不正确\"}");
				out.flush();
			} else {
				response.sendRedirect("QueryMessageServlet");
			}
			return;
		}
		int messageId = Integer.parseInt(idStr);

		//5.调用 service 切换点赞状态：点过就取消，没点过就点上
		//   toggleLike 的返回值表示“操作完之后是不是已点赞”
		MessageService ms = new MessageService();
		boolean liked = ms.toggleLike(messageId, loginUser.getId());

		//6.再查一次最新的总赞数（不要自己在旧数字上 +1，因为可能别人也点了赞）
		int count = ms.countLikes(messageId);

		//7.根据请求类型返回不同结果
		if (isAjax) {
			//---- Ajax：返回 JSON ----
			response.setContentType("application/json;charset=UTF-8");
			PrintWriter out = response.getWriter();
			//liked 是 true/false，count 是数字，前端拿到后直接改按钮
			out.print("{\"success\":true,\"liked\":" + liked + ",\"count\":" + count + "}");
			out.flush();
		} else {
			//---- 普通表单：和原来一样，刷新列表页 ----
			response.setContentType("text/html;charset=UTF-8");
			response.sendRedirect("QueryMessageServlet");
		}
	}

	public void init() throws ServletException {
	}
}
