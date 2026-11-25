package servlet;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.UserDomain;
import service.CommentService;

/**
 * ============================================================
 *  LikeCommentServlet —— 给【评论 / 回复】点赞或取消点赞
 * ------------------------------------------------------------
 *  和 LikeServlet 的思路完全一样：
 *  · Ajax 请求 → 返回 JSON，前端不刷新页面，只改红心和数字；
 *  · 普通请求 → 保持原来的重定向刷新，兼容老页面。
 *
 *  返回的 JSON：{"success":true,"liked":true,"count":3}
 * ============================================================
 */
public class LikeCommentServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.编码统一
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");

		//2.判断是不是 Ajax
		boolean isAjax = "XMLHttpRequest".equals(request.getHeader("X-Requested-With"))
				|| "1".equals(request.getParameter("ajax"));

		//3.必须登录
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			if (isAjax) {
				response.setContentType("application/json;charset=UTF-8");
				PrintWriter out = response.getWriter();
				out.print("{\"success\":false,\"message\":\"登录后才能点赞哦～\"}");
				out.flush();
			} else {
				response.sendRedirect("login.jsp");
			}
			return;
		}

		//4.拿评论 id（按钮的 data-id → 提交时叫 comment_id）
		String idStr = request.getParameter("comment_id");
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
		int commentId = Integer.parseInt(idStr);

		//5.切换点赞状态
		CommentService cs = new CommentService();
		boolean liked = cs.toggleLike(commentId, loginUser.getId());

		//6.查最新赞数
		int count = cs.countLikes(commentId);

		//7.输出
		if (isAjax) {
			response.setContentType("application/json;charset=UTF-8");
			PrintWriter out = response.getWriter();
			out.print("{\"success\":true,\"liked\":" + liked + ",\"count\":" + count + "}");
			out.flush();
		} else {
			response.setContentType("text/html;charset=UTF-8");
			response.sendRedirect("QueryMessageServlet");
		}
	}

	public void init() throws ServletException {
	}
}
