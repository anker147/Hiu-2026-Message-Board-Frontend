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

//发表评论 / 回复别人的 servlet
//parent_id 传 0 → 评论留言；parent_id 传某条评论的 id → 回复那条评论
public class AddCommentServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理（评论内容有中文，必须写）
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

		//3.判断登录
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

		//4.接收参数
		String messageIdStr = request.getParameter("message_id");  //属于哪条留言
		String parentIdStr = request.getParameter("parent_id");    //回复谁（0 表示评论留言）
		String content = request.getParameter("content");          //评论内容

		//5.参数校验（防止空指针）
		if (messageIdStr == null || messageIdStr.trim().equals("")) {
			response.sendRedirect("QueryMessageServlet");
			return;
		}
		int messageId = 0;
		try {
			//【2026-11-19 新增】加 try-catch：万一有人手动拼一个非法 id，
			//不至于让页面直接 500，而是给前端一句友好的提示
			messageId = Integer.parseInt(messageIdStr.trim());
		} catch (NumberFormatException e) {
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"参数不正确，请刷新页面后再试\"}");
				return;
			}
			response.sendRedirect("QueryMessageServlet");
			return;
		}
		int parentId = 0;
		if (parentIdStr != null && !parentIdStr.trim().equals("")) {
			parentId = Integer.parseInt(parentIdStr);
		}

		//6.评论内容不能为空
		if (content == null || content.trim().equals("")) {
			if (isAjax) {
				writeJson(response, "{\"success\":false,\"message\":\"评论内容不能为空哦～\"}");
				return;
			}
			session.setAttribute("tip", "评论内容不能为空哦～");
			response.sendRedirect("QueryMessageServlet");
			return;
		}

		//7.组装评论对象（昵称、头像都从 session 里的当前用户拿，不用页面传，避免有人伪造）
		CommentDomain c = new CommentDomain();
		c.setMessage_id(messageId);
		c.setUser_id(loginUser.getId());
		//评论人昵称用用户设置的网名（例如“快乐的小狗”），
		//不能用 account（那是手机号），这就是之前评论区显示手机号的原因
		String nick = loginUser.getNickname();
		if (nick == null || nick.trim().equals("")) {
			nick = "匿名小伙伴";
		}
		c.setNickname(nick);
		c.setAvatar(loginUser.getAvatar());               //评论人头像
		c.setContent(content.trim());
		c.setParent_id(parentId);                         //0=评论留言，其它=回复
		c.setCreate_time(new java.util.Date());

		//8.保存
		CommentService cs = new CommentService();
		//【2026-11-19 改造】拿到新评论的 id，Ajax 返回给前端，
		//前端用 [data-cid="新id"] 就能精准定位到这条评论并平滑滚动过去
		int newId = cs.addComment(c);

		//9.【2026-11-19 改造】Ajax 提交 → 返回 JSON，页面不刷新、不跳顶部
		//   message_id / parent_id 也一起返回，前端据此知道该滚动到哪条留言、
		//   以及发完评论后要重新展开哪个输入框，方便用户连续发言
		if (isAjax) {
			writeJson(response, "{\"success\":true,\"type\":\"comment\",\"id\":" + newId
					+ ",\"message_id\":" + messageId
					+ ",\"parent_id\":" + parentId
					+ ",\"message\":\"发布成功啦～\"}");
			return;
		}

		//10.普通提交（没 JS 兜底）：回到列表，页面会重新查一遍评论
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
