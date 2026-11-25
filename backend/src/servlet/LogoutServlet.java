package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

//退出登录的 servlet：把 session 清空，再回到登录页
public class LogoutServlet extends HttpServlet {

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理（这里其实用不到中文，但养成习惯写上）
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");
		response.setContentType("text/html;charset=UTF-8");

		//2.禁止浏览器缓存这个跳转
		//   （之前“点了退出没反应”，很多时候是浏览器把留言板缓存了，
		//    点后退/退出后看到的还是缓存页，加上这三行就干净了）
		response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
		response.setHeader("Pragma", "no-cache");
		response.setDateHeader("Expires", 0);

		//3.拿到 session，调用 invalidate() 让整个会话失效（相当于退出）
		HttpSession session = request.getSession(false); //传 false：没有 session 就返回 null，不会新建
		if (session != null) {
			session.removeAttribute("loginUser");        //先清掉登录用户
			session.invalidate();                        //再把整个 session 作废
		}

		//4.回到登录页
		//  用 getContextPath() 拼绝对路径，不管从哪个页面点退出都能正确回到 /项目名/login.jsp
		response.sendRedirect(request.getContextPath() + "/login.jsp");
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doGet(request, response);
	}
}
