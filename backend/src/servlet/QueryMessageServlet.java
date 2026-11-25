package servlet;

import java.io.IOException;
import java.util.List;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.MessageDomain;
import domain.UserDomain;
import service.MessageService;

//查询留言列表的 servlet：整个留言板首页的数据都由它准备，然后转发到 board.jsp
public class QueryMessageServlet extends HttpServlet {

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

		//2.先判断有没有登录（没有登录不让进留言板，直接踢回登录页）
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");
		if (loginUser == null) {
			response.sendRedirect("login.jsp");
			return;
		}

		//3.调用 service 查询所有留言（把自己的 id 传进去，用来判断哪些留言是我的、我点过赞没有）
		MessageService ms = new MessageService();
		List<MessageDomain> list = ms.queryAll(loginUser.getId());

		//4.把集合放进 request，名字叫 msgList，board.jsp 用 ${msgList} 取（JSTL 遍历）
		request.setAttribute("msgList", list);

		//5.把 session 里存的“操作提示”取出来给页面显示，取完立刻删掉（只提示一次）
		Object tip = session.getAttribute("tip");
		if (tip != null) {
			request.setAttribute("tip", tip);
			session.removeAttribute("tip");
		}

		//5.1 取出安全过滤器（SafetyFilter）留下的弹窗提示
		//    比如“包含违规词汇”“发言太快了，请 X 秒后再试”
		//    同样取一次就删，避免用户刷新页面时反复弹窗
		Object safetyAlert = session.getAttribute("safetyAlert");
		if (safetyAlert != null) {
			request.setAttribute("safetyAlert", safetyAlert);
			session.removeAttribute("safetyAlert");
		}

		//6.转发到 board.jsp（转发：地址栏不变，数据能带过去）
		request.getRequestDispatcher("board.jsp").forward(request, response);
	}

	public void init() throws ServletException {
	}
}
