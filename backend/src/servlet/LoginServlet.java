package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.UserDomain;
import service.UserService;

//登录的 servlet：校验账号密码，成功就把用户对象存进 session（会话）
public class LoginServlet extends HttpServlet {

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

		//2.拿到页面输入的账号和密码
		String account = request.getParameter("account");
		String password = request.getParameter("password");

		//3.空值校验
		if (account == null || account.trim().equals("") || password == null || password.trim().equals("")) {
			request.setAttribute("error", "账号和密码都要填哦～");
			request.getRequestDispatcher("login.jsp").forward(request, response);
			return;
		}

		//4.调用 service 层查询数据库
		UserService us = new UserService();
		UserDomain user = us.login(account, password);

		//5.判断结果
		if (user != null) {
			//登录成功：把用户对象放进 session，后面所有页面都能用 ${sessionScope.loginUser} 取到
			HttpSession session = request.getSession();
			session.setAttribute("loginUser", user);
			//重定向到查询留言的 servlet（重定向会让地址栏变成 QueryMessageServlet）
			response.sendRedirect("QueryMessageServlet");
		} else {
			//登录失败：回到登录页，显示错误提示
			request.setAttribute("error", "账号或密码不正确，请重新输入");
			request.getRequestDispatcher("login.jsp").forward(request, response);
		}
	}

	public void init() throws ServletException {
	}
}
