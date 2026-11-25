<%@ page language="java" pageEncoding="UTF-8"%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<%
// 拿到项目根路径，配合 <base> 使用
String path = request.getContextPath();
String basePath = request.getScheme()+"://"+request.getServerName()+":"+request.getServerPort()+path+"/";
%>
<!DOCTYPE html>
<html>
<head>
	<base href="<%=basePath%>">
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>注册 - 粉粉留言板</title>
	<link rel="stylesheet" href="css/board.css">
</head>
<body>

<div class="auth-wrap">
	<%-- 注册页和登录页左右调换：左边是头像卡片，右边是表单（和你手绘的图一致） --%>
	<div class="auth-card">

		<%-- ================= 左边：默认头像 + 默认ID ================= --%>
		<div class="auth-side">
			<div class="side-inner">
				<div class="tip-title">默认头像 · 点一下就能改</div>

				<%-- 大号头像预览：JS 会根据下面选中的编号实时换表情 --%>
				<span class="avatar avatar-lg" id="avatarPreview" data-avatar="${empty param.avatar ? 'av1' : param.avatar}"></span>

				<%-- 8 个可选头像：点哪个，大图就变哪个 --%>
				<div class="avatar-picker">
					<button type="button" data-pick="av1"></button>
					<button type="button" data-pick="av2"></button>
					<button type="button" data-pick="av3"></button>
					<button type="button" data-pick="av4"></button>
					<button type="button" data-pick="av5"></button>
					<button type="button" data-pick="av6"></button>
					<button type="button" data-pick="av7"></button>
					<button type="button" data-pick="av8"></button>
				</div>

				<%-- 默认ID：由 js 随机生成 8 位十六进制，例如 0456e3e1 --%>
				<div class="id-chip" id="userNoText">ID：--------</div>
				<div class="side-note">
					这是系统送你的专属ID<br>
					<a href="javascript:void(0)" id="refreshId">换一个 ID</a><br>
					<span class="tiny-note">注册后还会随机送你一个网名</span>
				</div>
			</div>
		</div>

		<%-- ================= 右边：注册表单 ================= --%>
		<div class="auth-form">
			<h1>注册</h1>
			<p class="sub">手机号 + 邮箱 + 密码，就能拥有自己的留言板啦</p>

			<%-- 后台校验失败时的红色提示 --%>
			<c:if test="${not empty error}">
				<div class="alert alert-error">${error}</div>
			</c:if>

			<form action="RegisterServlet" method="post">
				<%-- 隐藏域：把选好的头像编号、生成的默认ID 一起提交给后台（用户看不见） --%>
				<input type="hidden" name="avatar" id="avatarInput" value="${empty param.avatar ? 'av1' : param.avatar}">
				<input type="hidden" name="user_no" id="userNoInput" value="${param.user_no}">

				<div class="line-field">
					<label>手机号</label>
					<%-- 账号就是手机号：
					     type="tel"           → 手机上会弹出数字键盘
					     maxlength="11"       → 最多只能输 11 位
					     pattern="1[3-9]\d{9}" → 浏览器自带的校验：1 开头、第二位 3~9、后面 9 位数字
					     title                → 校验不通过时浏览器提示的文字 --%>
					<input type="tel" name="account" value="${param.account}"
					       placeholder="请输入 11 位手机号"
					       pattern="1[3-9]\d{9}" maxlength="11"
					       title="请输入正确的 11 位手机号，例如 13800001111" required>
				</div>
				<div class="line-field">
					<label>邮箱</label>
					<input type="email" name="email" value="${param.email}" placeholder="例如 abc@qq.com" required maxlength="50">
				</div>
				<div class="line-field">
					<label>密码</label>
					<input type="password" name="password" placeholder="请输入密码" required maxlength="20">
				</div>
				<div class="line-field">
					<label>确认密码</label>
					<input type="password" name="confirm" placeholder="请再输入一次密码" required maxlength="20">
				</div>

				<div class="auth-actions">
					<button class="btn btn-primary" type="submit">注 册</button>
					<%-- 想直接登录，点这个跳回登录页 --%>
					<a class="btn btn-ghost" href="login.jsp" style="padding:12px 26px;">登 录</a>
				</div>
			</form>
		</div>

	</div>
</div>

<script src="js/board.js"></script>
</body>
</html>
