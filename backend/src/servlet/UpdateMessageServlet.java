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

//保存修改的 servlet：updateMsg.jsp 点“重新提交”后，把新内容更新到数据库
public class UpdateMessageServlet extends HttpServlet {

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

		//3.接收参数（id 用隐藏域带过来）
		int id = Integer.parseInt(request.getParameter("id"));
		String nickname = request.getParameter("nickname");
		String realName = request.getParameter("real_name");
		String email = request.getParameter("email");
		String phone = request.getParameter("phone");
		String content = request.getParameter("content");
		//3.1 三个“公开显示”复选框，勾上=1，没勾=0
		int namePublic = (request.getParameter("is_name_public") != null) ? 1 : 0;
		int emailPublic = (request.getParameter("is_email_public") != null) ? 1 : 0;
		int phonePublic = (request.getParameter("is_phone_public") != null) ? 1 : 0;

		//4.先查一次，确认这条留言是自己的（防止有人手动改 URL 里的 id）
		MessageService ms = new MessageService();
		MessageDomain old = ms.queryById(id);
		if (old == null || old.getUser_id() != loginUser.getId()) {
			session.setAttribute("tip", "你没有权限修改这条留言");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//5.把新内容装进对象
		MessageDomain m = new MessageDomain();
		m.setId(id);
		//昵称没填就继续用原来的网名，避免把名字改空
		if (nickname == null || nickname.trim().equals("")) {
			m.setNickname(loginUser.getNickname());
		} else {
			m.setNickname(nickname.trim());
		}
		m.setReal_name(realName);
		m.setEmail(email);
		m.setPhone(phone);
		m.setIs_name_public(namePublic);        //姓名公开状态
		m.setIs_email_public(emailPublic);      //邮箱公开状态
		m.setIs_phone_public(phonePublic);      //电话公开状态
		m.setContent(content);

		//6.保存
		ms.updateMessage(m);

		//6.1 昵称改了就同步到账号网名（这样评论里显示的名字也一起变）
		if (!m.getNickname().equals(loginUser.getNickname())) {
			new service.UserService().updateNickname(loginUser.getId(), m.getNickname());
			loginUser.setNickname(m.getNickname());
			session.setAttribute("loginUser", loginUser);
		}

		//7.提示 + 回到列表页
		session.setAttribute("tip", "留言修改成功！");
		response.sendRedirect("QueryMessageServlet");
	}

	public void init() throws ServletException {
	}
}
