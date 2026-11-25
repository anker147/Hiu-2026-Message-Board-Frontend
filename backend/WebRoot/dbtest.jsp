<%@ page language="java" pageEncoding="UTF-8"%>
<%@page import="java.sql.*"%>
<%@page import="db.DatabaseConn"%>
<%-- ============================================================
     dbtest.jsp —— 数据库连接自检页
     访问方式：http://localhost:8080/TestJDBC/dbtest.jsp
     作用：只做一件事，告诉你“数据库到底连上没有”。
     原来那份代码在 finally 里直接 rs.close()，
     一旦连接失败 rs 是 null，就会抛 NullPointerException（你看到的 500 就是它）。
     这里改成“先判断非空再关闭”，并且统一走 DatabaseConn，配置只维护一处。
     ============================================================ --%>
<%
String path = request.getContextPath();
String basePath = request.getScheme() + "://" + request.getServerName() + ":" + request.getServerPort() + path + "/";
%>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
<base href="<%=basePath%>">
<title>数据库连接自检</title>
<meta http-equiv="pragma" content="no-cache">
<style>
	body { font-family: "Microsoft YaHei", Arial; background: #fff5f9; padding: 30px; color: #4a3b42; }
	.box { background: #fff; border-radius: 14px; padding: 24px 28px; max-width: 780px;
	       box-shadow: 0 8px 30px rgba(255, 105, 150, .12); }
	h2 { color: #ff6b9d; margin: 0 0 6px; }
	.ok { color: #2e9e5b; font-weight: bold; }
	.bad { color: #e0466b; font-weight: bold; }
	code { background: #fff0f6; padding: 2px 6px; border-radius: 5px; color: #d6336c; }
	li { line-height: 1.9; }
</style>
</head>

<body>
<div class="box">
	<h2>数据库连接自检</h2>
	<p>当前配置：<code><%=DatabaseConn.URL%></code> 账号 <code><%=DatabaseConn.USERNAME%></code></p>

<%
	Connection con = null;
	Statement stmt = null;
	ResultSet rs = null;

	try {
		// 统一从 DatabaseConn 拿连接（端口 3307、库名 project 都在那边配好了）
		con = DatabaseConn.getConnection();

		if (con != null) {
			out.print("<p class=\"ok\">✔ 连接成功！</p>");

			stmt = con.createStatement();
			rs = stmt.executeQuery("select database(), version()");
			if (rs.next()) {
				out.print("<p>当前数据库：<b>" + rs.getString(1) + "</b>　MySQL 版本：<b>" + rs.getString(2) + "</b></p>");
			}
			rs.close();
			rs = null;

			// 顺便看看留言板的四张表在不在
			rs = stmt.executeQuery("select table_name from information_schema.tables where table_schema='project' order by table_name");
			out.print("<p>project 库中的表：</p><ul>");
			while (rs.next()) {
				out.print("<li>" + rs.getString(1) + "</li>");
			}
			out.print("</ul>");
			out.print("<p>看不到 mb_user / mb_message / mb_comment / mb_like？"
					+ "说明还没执行过 <code>sql/messageboard.sql</code>。</p>");
		}
	} catch (Exception e) {
		// 连不上时把原因打出来，而不是让页面直接 500
		out.print("<p class=\"bad\">✘ 连接失败</p>");
		out.print("<pre style=\"white-space:pre-wrap;background:#fff5f7;padding:12px;border-radius:8px;\">");
		out.print(e.getMessage());
		out.print("</pre>");
		e.printStackTrace();
	} finally {
		// 关键：每个 close 之前都先判断 != null，避免空指针
		try { if (rs != null) rs.close(); } catch (Exception e) { }
		try { if (stmt != null) stmt.close(); } catch (Exception e) { }
		try { if (con != null) con.close(); } catch (Exception e) { }
	}
%>

	<p style="margin-top:22px;"><a href="index.jsp">← 返回首页</a></p>
</div>
</body>
</html>
