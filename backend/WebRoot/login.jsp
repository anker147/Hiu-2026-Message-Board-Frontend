<%@ page language="java" pageEncoding="UTF-8"%>
<%-- 引入 JSTL 的核心标签库，prefix="c" 表示后面用 <c:if> / <c:forEach> 这类标签 --%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<%
// 下面三行是 MyEclipse 自动生成的固定写法：拿到项目的根路径
// 有了 base 标签后，页面里写 "LoginServlet" 这样的相对地址，会自动拼成 http://ip:端口/项目名/LoginServlet
String path = request.getContextPath();
String basePath = request.getScheme()+"://"+request.getServerName()+":"+request.getServerPort()+path+"/";
%>
<!DOCTYPE html>
<html>
<head>
	<base href="<%=basePath%>">
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>登录 - 粉粉留言板</title>
	<%-- 引用公共粉色样式表 --%>
	<link rel="stylesheet" href="css/board.css">
</head>
<body>

<div class="auth-wrap">
	<div class="auth-card">

		<%-- ================= 左边：登录表单 ================= --%>
		<div class="auth-form">
			<h1>登录</h1>
			<p class="sub">欢迎回来，来写一条留言吧</p>

			<%-- 如果 servlet 往 request 里放了 error，就显示红条提示（EL 表达式取值） --%>
			<c:if test="${not empty error}">
				<div class="alert alert-error">${error}</div>
			</c:if>
			<%-- 注册成功后会回到这个页面，显示绿条提示（里面带着系统送的 ID 和网名） --%>
			<c:if test="${not empty ok}">
				<div class="alert alert-ok">${ok}</div>
			</c:if>

			<%-- 表单提交给 LoginServlet，method 必须是 post（密码不能出现在地址栏） --%>
			<form action="LoginServlet" method="post">
				<div class="line-field">
					<label>手机号</label>
					<%-- value="${param.account}"：登录失败回到本页时，把刚才输入的手机号保留下来 --%>
					<%-- type="tel" + pattern：对应注册页的手机号，输错格式浏览器直接拦下来 --%>
					<input type="tel" name="account" value="${param.account}"
					       placeholder="请输入 11 位手机号"
					       pattern="1[3-9]\d{9}" maxlength="11"
					       title="请输入正确的 11 位手机号，例如 13800001111" required>
				</div>
				<div class="line-field">
					<label>密码</label>
					<input type="password" name="password" placeholder="请输入密码" required>
				</div>

				<div class="auth-actions">
					<button class="btn btn-primary" type="submit">登 录</button>
					<a class="link" href="register.jsp">还没有账号？立即注册 →</a>
				</div>
			</form>
		</div>

		<%-- ================= 右边：纯装饰的粉色插画区 =================
		     按你的要求，这里不再显示头像和 ID（那张卡片太丑了），
		     改成用 CSS + 表情符号拼出来的插画：渐变底 + 光斑 + 可爱卡片 + 小爱心
		     全部是页面元素，不依赖任何图片文件，网速慢也不会裂图 --%>
		<div class="auth-side art-side">
			<div class="art-deco">
				<%-- 三个半透明光斑，营造柔和的粉色氛围 --%>
				<span class="blob blob1"></span>
				<span class="blob blob2"></span>
				<span class="blob blob3"></span>
				<%-- 飘在空中的小装饰 --%>
				<span class="spark spark1">✦</span>
				<span class="spark spark2">✧</span>
				<span class="spark spark3">✦</span>
				<span class="float-heart h1">💗</span>
				<span class="float-heart h2">🌸</span>

				<%-- 中间那张“留言卡片” --%>
				<div class="art-card">
					<%-- 用纯 CSS 画一个粉色的“聊天气泡”（不依赖表情符号，任何电脑都能正常显示） --%>
					<div class="art-emoji">
						<span class="bubble-art">
							<span class="bdot"></span>
							<span class="bdot"></span>
							<span class="bdot"></span>
							<span class="bubble-tail"></span>
						</span>
					</div>
					<div class="art-title">粉粉留言板</div>
					<div class="art-sub">把想说的话<br>悄悄留在这里</div>
					<div class="art-tags">
						<span>🌸</span><span>☁️</span><span>💗</span>
					</div>
				</div>

				<div class="art-note">今天也要开开心心的～</div>
			</div>
		</div>

	</div>
</div>

<%-- 引用公共脚本：画头像、生成随机ID、菜单等 --%>
<script src="js/board.js"></script>
</body>
</html>
