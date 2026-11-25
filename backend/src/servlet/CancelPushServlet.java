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

//取消推送 / 重新推送 的 servlet
//页面上的“取消推送”链接会传 status=0，“重新推送”传 status=1
public class CancelPushServlet extends HttpServlet {

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

		//3.接收参数：留言 id、目标状态
		int id = Integer.parseInt(request.getParameter("id"));
		int status = Integer.parseInt(request.getParameter("status")); //0=取消推送，1=重新推送

		//4.确认这条留言是自己的
		MessageService ms = new MessageService();
		MessageDomain m = ms.queryById(id);
		if (m == null || m.getUser_id() != loginUser.getId()) {
			session.setAttribute("tip", "你没有权限操作这条留言");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//5.更新状态（status=0 后，别人就看不到这条留言了，自己还能看到灰色标记）
		ms.updateStatus(id, status);

		//6.提示 + 回列表
		if (status == 0) {
			session.setAttribute("tip", "已取消推送，这条留言现在只有你自己能看到");
		} else {
			session.setAttribute("tip", "已重新推送，大家又能看到啦～");
		}
		response.sendRedirect("QueryMessageServlet");
	}

	public void init() throws ServletException {
	}
}
