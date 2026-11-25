package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import domain.UserDomain;
import service.UserService;

//注册的 servlet：接收 register.jsp 提交的账号、邮箱、密码、确认密码、头像、默认ID
public class RegisterServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);   //GET 请求也交给 doPost 处理，和老代码写法一致
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.处理中文乱码（这三行必须写在所有 getParameter 之前，否则中文会变成问号）
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");
		response.setContentType("text/html;charset=UTF-8");

		//2.接收页面传过来的参数（参数名要和 register.jsp 里 input 的 name 一模一样）
		String account = request.getParameter("account");       //账号 = 手机号（字段名没变，只是页面文案改了）
		String email = request.getParameter("email");           //邮箱
		String password = request.getParameter("password");     //密码
		String confirm = request.getParameter("confirm");       //确认密码
		String avatar = request.getParameter("avatar");         //头像编号 av1~av8
		String userNo = request.getParameter("user_no");        //页面生成的默认ID（如 0456e3e1）

		//3.做几个简单校验，出错就带着提示信息回到注册页
		//3.1 手机号不能为空
		if (account == null || account.trim().equals("")) {
			request.setAttribute("error", "手机号不能为空！");
			request.getRequestDispatcher("register.jsp").forward(request, response);
			return;                                             //方法到此结束，不再往下执行
		}
		//3.2 手机号必须是 11 位、1 开头、第二位 3~9（前端也校验了，这里再挡一次，防止绕过页面直接提交）
		if (!account.trim().matches("^1[3-9]\\d{9}$")) {
			request.setAttribute("error", "请输入正确的 11 位手机号！");
			request.getRequestDispatcher("register.jsp").forward(request, response);
			return;
		}
		//3.3 密码不能为空，且两次输入必须一致
		if (password == null || password.trim().equals("")) {
			request.setAttribute("error", "密码不能为空！");
			request.getRequestDispatcher("register.jsp").forward(request, response);
			return;
		}
		if (!password.equals(confirm)) {
			request.setAttribute("error", "两次输入的密码不一致，请重新输入！");
			request.getRequestDispatcher("register.jsp").forward(request, response);
			return;
		}

		//4.把参数装进实体对象（这里不用一个个 set，直接用有参构造）
		UserDomain user = new UserDomain(account.trim(), email, password, avatar, userNo);

		//5.调用 service 层去注册
		//   service 里会做三件事：判断手机号是否已注册、补齐/生成默认ID、随机生成一个网名
		UserService us = new UserService();
		boolean ok = us.register(user);

		//6.根据结果跳页面
		if (ok) {
			//注册成功：回到登录页，并给出成功提示（顺便告诉用户系统送的ID和网名）
			request.setAttribute("ok", "注册成功！你的ID是 " + user.getUser_no()
					+ "，网名是「" + user.getNickname() + "」，现在可以登录了");
			request.getRequestDispatcher("login.jsp").forward(request, response);
		} else {
			//手机号已存在：回到注册页并提示
			request.setAttribute("error", "手机号【" + account + "】已经被注册了，换一个试试");
			request.getRequestDispatcher("register.jsp").forward(request, response);
		}
	}

	public void init() throws ServletException {
	}
}
