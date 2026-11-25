package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.UserDomain;
import service.UserService;

//换头像的 servlet：页面右侧头像卡片上选一个头像，点“保存”就提交到这里
public class UpdateAvatarServlet extends HttpServlet {

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

		//3.拿到选中的头像编号（av1~av8）
		String avatar = request.getParameter("avatar");
		if (avatar == null || avatar.trim().equals("")) {
			avatar = "av1";
		}

		//4.更新数据库
		UserService us = new UserService();
		us.updateAvatar(loginUser.getId(), avatar);

		//5.把最新的用户信息重新查出来，替换掉 session 里的旧对象
		//   （否则页面顶部还是显示旧头像）
		UserDomain newUser = us.queryById(loginUser.getId());
		if (newUser != null) {
			session.setAttribute("loginUser", newUser);
		}

		//6.提示 + 回列表
		session.setAttribute("tip", "头像更换成功！");
		response.sendRedirect("QueryMessageServlet");
	}

	public void init() throws ServletException {
	}
}
