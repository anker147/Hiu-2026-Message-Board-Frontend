package servlet;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.MessageDomain;
import domain.UserDomain;
import service.MessageService;

//发布留言的 servlet：接收首页上半部分表单（昵称、姓名、邮箱、电话、留言内容）
public class AddMessageServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理（必须放在 getParameter 前面）
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

		//3.判断登录状态
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			//没登录：Ajax 就回一个 JSON，前端弹窗提示；普通提交就跳登录页
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"登录状态已过期，请重新登录\"}");
				return;
			}
			response.sendRedirect("login.jsp");
			return;
		}

		//4.接收表单参数（name 要和 board.jsp 里 input 的 name 对应）
		String nickname = request.getParameter("nickname");   //昵称（默认是随机网名，用户可以改）
		String realName = request.getParameter("real_name");  //姓名
		String email = request.getParameter("email");         //邮箱地址
		String phone = request.getParameter("phone");         //联系电话
		String content = request.getParameter("content");     //留言内容

		//4.1 三个“公开显示”复选框：勾上了浏览器才会提交这个参数，所以
		//    getParameter 不为 null 就是 1（公开），为 null 就是 0（打码）
		int namePublic = (request.getParameter("is_name_public") != null) ? 1 : 0;
		int emailPublic = (request.getParameter("is_email_public") != null) ? 1 : 0;
		int phonePublic = (request.getParameter("is_phone_public") != null) ? 1 : 0;

		//5.留言内容不能是空的
		if (content == null || content.trim().equals("")) {
			//Ajax：把错误原因用 JSON 告诉前端，前端用粉色弹窗显示，页面不动
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"留言内容不能为空哦～\"}");
				return;
			}
			session.setAttribute("tip", "留言内容不能为空哦～");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//6.组装实体对象
		MessageDomain m = new MessageDomain();
		m.setUser_id(loginUser.getId());        //这条留言属于当前登录的人

		//6.1 昵称：页面没填就用用户自己的网名（例如“快乐的小狗”），
		//    绝对不能退回手机号——这正是之前列表里出现手机号的原因
		String finalNick;
		if (nickname == null || nickname.trim().equals("")) {
			finalNick = (loginUser.getNickname() == null || loginUser.getNickname().trim().equals(""))
					? "匿名小伙伴" : loginUser.getNickname();
		} else {
			finalNick = nickname.trim();
		}
		m.setNickname(finalNick);

		m.setReal_name(realName);
		m.setEmail(email);
		m.setPhone(phone);
		m.setIs_name_public(namePublic);        //存姓名公开状态
		m.setIs_email_public(emailPublic);      //存邮箱公开状态
		m.setIs_phone_public(phonePublic);      //存电话公开状态
		m.setContent(content);

		//7.调用 service 保存到数据库
		MessageService ms = new MessageService();
		//【2026-11-19 改造】接收 dao 返回的新留言 id，Ajax 成功后要把它交给前端，
		//前端拿到 id 才能用 document.querySelector 找到刚插入的那条留言并滚动过去
		int newId = ms.addMessage(m);

		//7.1 如果用户这次把昵称改成了别的名字，就把账号的网名也一起改掉，
		//    这样他的留言、评论显示的名字完全一致
		if (!finalNick.equals(loginUser.getNickname())) {
			new service.UserService().updateNickname(loginUser.getId(), finalNick);
			loginUser.setNickname(finalNick);          //同步 session 里的对象
			session.setAttribute("loginUser", loginUser);
		}

		//8.【2026-11-19 改造】分两种情况返回
		//   8.1 Ajax 提交：返回 JSON，前端自己刷新列表并滚动到新留言，页面不会跳到顶部
		if (isAjax) {
			writeJson(response, "{\"success\":true,\"type\":\"message\",\"id\":" + newId
					+ ",\"message\":\"留言发布成功啦～\"}");
			return;
		}

		//   8.2 普通表单提交（没 JS 时的兜底）：给一个提示，然后重定向回列表
		//       （重定向可以避免刷新页面重复提交）
		session.setAttribute("tip", "留言发布成功啦～");
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
