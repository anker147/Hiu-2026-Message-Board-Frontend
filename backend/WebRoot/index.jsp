<%@ page language="java" pageEncoding="UTF-8"%>
<%-- ============================================================
     index.jsp 是项目的“欢迎页”（web.xml 里 welcome-file 配的就是它）
     作用：判断用户有没有登录
           没登录 → 去 login.jsp
           已登录 → 去 QueryMessageServlet（查询留言并进留言板）
     说明：你原来那个“测试数据库连接”的页面我保留成了 dbtest.jsp，
           需要时访问 /项目名/dbtest.jsp 还能看到。
     ============================================================ --%>
<%
// 1.从 session 里取登录用户（LoginServlet 登录成功时存进去的）
Object loginUser = session.getAttribute("loginUser");

// 2.根据有没有登录，决定跳去哪个页面
if (loginUser == null) {
	// 没登录：跳登录页
	response.sendRedirect("login.jsp");
} else {
	// 已登录：跳留言列表（QueryMessageServlet 会查库再转发到 board.jsp）
	response.sendRedirect("QueryMessageServlet");
}
%>
