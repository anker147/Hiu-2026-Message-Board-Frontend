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

//点“修改内容”时进入的 servlet：先按 id 查出这条留言，再把内容填到 updateMsg.jsp 的表单里
public class QueryMessageByIdServlet extends HttpServlet {

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

		//3.拿到要修改的留言 id（链接上传过来的）
		int id = Integer.parseInt(request.getParameter("id"));

		//4.查询这条留言
		MessageService ms = new MessageService();
		MessageDomain m = ms.queryById(id);

		//5.安全校验：留言不存在，或者这条留言不是当前登录人发的，就不允许修改
		if (m == null || m.getUser_id() != loginUser.getId()) {
			session.setAttribute("tip", "你没有权限修改这条留言");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//6.把留言对象放进 request，updateMsg.jsp 用 ${onemsg.content} 之类取值
		request.setAttribute("onemsg", m);
		request.getRequestDispatcher("updateMsg.jsp").forward(request, response);
	}

	public void init() throws ServletException {
	}
}
