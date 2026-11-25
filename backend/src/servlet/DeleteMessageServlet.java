package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.MessageDomain;
import domain.UserDomain;
import service.MessageService;

//删除留言的 servlet（“三个点”菜单里的“删除”）
//会连带把这条留言的评论、点赞一起删掉
public class DeleteMessageServlet extends HttpServlet {

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

		//2.判断登录
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			response.sendRedirect("login.jsp");
			return;
		}

		//3.接收要删除的留言 id
		int id = Integer.parseInt(request.getParameter("id"));

		//4.权限校验：只能删自己的留言
		MessageService ms = new MessageService();
		MessageDomain m = ms.queryById(id);
		if (m == null || m.getUser_id() != loginUser.getId()) {
			session.setAttribute("tip", "你没有权限删除这条留言");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//5.删除（dao 里会先删评论、再删点赞、最后删留言）
		ms.deleteById(id);

		//6.提示 + 回列表
		session.setAttribute("tip", "留言已删除");
		response.sendRedirect("QueryMessageServlet");
	}

	public void init() throws ServletException {
	}
}
