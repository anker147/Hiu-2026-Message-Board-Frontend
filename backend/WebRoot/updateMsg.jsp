<%@ page language="java" pageEncoding="UTF-8"%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/fmt" prefix="fmt" %>
<%-- 设置地区，保证 <fmt:formatDate> 能按 pattern 正常格式化时间 --%>
<fmt:setLocale value="zh_CN"/>
<%
String path = request.getContextPath();
String basePath = request.getScheme()+"://"+request.getServerName()+":"+request.getServerPort()+path+"/";
%>
<%-- 没有登录，或者没有拿到要修改的留言，就回列表页，避免页面报错 --%>
<c:if test="${empty sessionScope.loginUser or empty onemsg}">
	<c:redirect url="QueryMessageServlet"/>
</c:if>
<!DOCTYPE html>
<html>
<head>
	<base href="<%=basePath%>">
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>修改留言 - 粉粉留言板</title>
	<link rel="stylesheet" href="css/board.css">
</head>
<body>

<div class="page-head">
	<a class="back-link" href="QueryMessageServlet">← 返回留言板</a>
</div>

<div class="page" style="padding-top:18px;">

	<div class="card">
		<h2 class="card-title">
			<span class="bar"></span>修改留言
			<small>改完点“重新提交”，原来的留言就会被替换掉</small>
		</h2>

		<%-- 表单提交给 UpdateMessageServlet；id 用隐藏域带着，后台才知道改哪一条 --%>
		<form action="UpdateMessageServlet" method="post">
			<input type="hidden" name="id" value="${onemsg.id}">

			<div class="form-grid">
				<div class="field">
					<div class="field-head">
						<label>昵称</label>
					</div>
					<%-- value 里填上原来的内容，这样打开页面就是“已填好”的状态 --%>
					<input type="text" name="nickname" value="${onemsg.nickname}" maxlength="20">
				</div>

				<%-- 姓名 + “公开显示”开关：勾上=列表里原样显示，不勾=显示成 张* --%>
				<div class="field">
					<div class="field-head">
						<label>姓名</label>
						<label class="public-toggle">
							<input type="checkbox" name="is_name_public" value="1"
								${onemsg.is_name_public == 1 ? 'checked' : ''}>
							<span>公开显示</span>
						</label>
					</div>
					<input type="text" name="real_name" value="${onemsg.real_name}" maxlength="20">
				</div>

				<div class="field">
					<div class="field-head">
						<label>邮箱地址</label>
						<label class="public-toggle">
							<input type="checkbox" name="is_email_public" value="1"
								${onemsg.is_email_public == 1 ? 'checked' : ''}>
							<span>公开显示</span>
						</label>
					</div>
					<input type="email" name="email" value="${onemsg.email}" maxlength="50">
				</div>

				<div class="field">
					<div class="field-head">
						<label>联系电话</label>
						<label class="public-toggle">
							<input type="checkbox" name="is_phone_public" value="1"
								${onemsg.is_phone_public == 1 ? 'checked' : ''}>
							<span>公开显示</span>
						</label>
					</div>
					<input type="text" name="phone" value="${onemsg.phone}" maxlength="20">
				</div>

				<div class="field full">
					<div class="field-head">
						<label>留言内容</label>
					</div>
					<%-- c:out 放在 textarea 中间：既能把原内容显示出来，又能防止内容里的特殊符号搞乱页面 --%>
					<textarea name="content" required maxlength="500"><c:out value="${onemsg.content}"/></textarea>
				</div>

				<%-- 显示一下原始发布时间，让用户知道改的是哪一条（不可编辑） --%>
				<div class="field full">
					<label>原来发布的时间</label>
					<div style="font-size:13px;color:#a9889a;">
						<fmt:formatDate value="${onemsg.create_time}" pattern="yyyy-MM-dd HH:mm"/>
					</div>
				</div>

				<div class="form-actions">
					<button class="btn btn-primary" type="submit">重新提交</button>
					<a class="btn btn-ghost" href="QueryMessageServlet" style="text-align:center;">取 消</a>
				</div>
			</div>
		</form>
	</div>

</div>

<script src="js/board.js"></script>
</body>
</html>
