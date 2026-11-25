package servlet;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.CommentDomain;
import domain.UserDomain;
import service.CommentService;

//修改评论 / 回复的 servlet
//页面上点“修改”会展开一个小输入框（已经填好原来的内容），改完提交到这里
public class UpdateCommentServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理（评论内容有中文，必须写，而且要放在 getParameter 之前）
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");
		response.setContentType("text/html;charset=UTF-8");

		//2.【2026-11-19 新增】判断这次提交是不是 Ajax
		//  原理：board.js 里的 ajaxPost 会给请求加一个 X-Requested-With: XMLHttpRequest 头，
		//        Servlet 读到这个头就知道“用户没有整页提交，而是在原地等 JSON”，
		//        于是返回 JSON；否则还是走老流程（重定向回留言板），
		//        这样即使浏览器禁用了 JS，功能也不会坏。
		boolean isAjax = "XMLHttpRequest".equals(request.getHeader("X-Requested-With"))
				|| "1".equals(request.getParameter("ajax"));

		//3.必须登录
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"登录状态已过期，请重新登录\"}");
				return;
			}
			response.sendRedirect("login.jsp");
			return;
		}

		//3.接收参数
		String idStr = request.getParameter("id");            //要改哪条评论/回复
		String content = request.getParameter("content");     //新的内容

		//4.参数校验
		if (idStr == null || idStr.trim().equals("")) {
			response.sendRedirect("QueryMessageServlet");
			return;
		}
		if (content == null || content.trim().equals("")) {
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"内容不能为空哦～\"}");
				return;
			}
			session.setAttribute("tip", "内容不能为空哦～");
			response.sendRedirect("QueryMessageServlet");
			return;
		}
		int id = Integer.parseInt(idStr);

		//5.权限校验：只能改自己发的评论（防止有人手动改 URL 里的 id）
		CommentService cs = new CommentService();
		CommentDomain old = cs.queryById(id);
		if (old == null || old.getUser_id() != loginUser.getId()) {
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"只能修改自己发的内容哦\"}");
				return;
			}
			session.setAttribute("tip", "只能修改自己发的内容哦");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//6.更新内容
		cs.updateContent(id, content.trim());

		//7.【2026-11-19 改造】Ajax 提交：返回 JSON，前端刷新列表后
		//  直接滚动到这条被修改的评论，不会跳回页面顶部
		if (isAjax) {
			writeJson(response, "{\"success\":true,\"type\":\"update\",\"id\":" + id
					+ ",\"message_id\":" + old.getMessage_id()
					+ ",\"message\":\"已经改好啦～\"}");
			return;
		}

		//8.普通提交（兜底）：提示 + 回留言板
		session.setAttribute("tip", "已经改好啦～");
		response.sendRedirect("QueryMessageServlet");
	}

	/**
	 * 【2026-11-19 新增】把一段 JSON 字符串写给浏览器。
	 * 响应头的 charset 一定要写 UTF-8，否则前端 JSON.parse 出来的中文会是乱码。
	 */
	private void writeJson(HttpServletResponse response, String json) throws IOException {
		response.setContentType("application/json;charset=UTF-8");
		PrintWriter out = response.getWriter();
		out.print(json);
		out.flush();
	}


	public void init() throws ServletException {
	}
}
