package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.CommentDomain;
import domain.UserDomain;
import service.CommentService;

//删除评论 / 回复的 servlet
//点“删除”会先弹一个确认框，确认后进来这里
public class DeleteCommentServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");
		response.setContentType("text/html;charset=UTF-8");

		//2.必须登录
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			response.sendRedirect("login.jsp");
			return;
		}

		//3.拿到要删除的评论 id（链接上带过来的）
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.trim().equals("")) {
			response.sendRedirect("QueryMessageServlet");
			return;
		}
		int id = Integer.parseInt(idStr);

		//4.权限校验：只能删自己发的
		CommentService cs = new CommentService();
		CommentDomain old = cs.queryById(id);
		if (old == null || old.getUser_id() != loginUser.getId()) {
			session.setAttribute("tip", "只能删除自己发的内容哦");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//5.删除（如果删的是一级评论，它下面的回复也会一起删掉）
		cs.deleteById(id);

		//6.提示 + 回留言板
		session.setAttribute("tip", "已删除");
		response.sendRedirect("QueryMessageServlet");
	}

	public void init() throws ServletException {
	}
}
