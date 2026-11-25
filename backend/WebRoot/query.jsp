<%@ page language="java" import="java.util.*" pageEncoding="UTF-8"%>
<%
String path = request.getContextPath();
String basePath = request.getScheme()+"://"+request.getServerName()+":"+request.getServerPort()+path+"/";
%>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
  <head>
    <base href="<%=basePath%>">
    
    <title>My JSP 'add.jsp' starting page</title>
    
	<meta http-equiv="pragma" content="no-cache">
	<meta http-equiv="cache-control" content="no-cache">
	<meta http-equiv="expires" content="0">    
	<meta http-equiv="keywords" content="keyword1,keyword2,keyword3">
	<meta http-equiv="description" content="This is my page">
	<!--
	<link rel="stylesheet" type="text/css" href="styles.css">
	-->

  </head>
  
  <body>
    	<table>
    		<caption><h1>查询项目页面</h1></caption>
    		<tr>
    			<th>项目名称</th>
    			<th>项目价值</th>
    			<th>项目成本</th>
    			<th>项目经理</th>
    			<th>经理电话</th>
    			<th>操作</th>
    		</tr>
    		
    		<!-- forEach是JSTL标签，
    		items是我们在servlet中提前存入在request对象的内容，
    		var就是其中每一条数据的对象，我们起个名pj
    		这一大串相当于for遍历
    		
    		${对象名.属性名}叫EL表达式
    		 -->
    		<c:forEach var="pj" items="${requestScope.projectlist}">
    			<tr>
    				<td>${pj.project_name}</td>
    				<td>${pj.project_value}</td>
    				<td>${pj.project_cost}</td>
    				<td>${pj.project_manager}</td>
    				<td>${pj.manager_phone}</td>
    				<td><a href="DeleteProjectServlet?id=${pj.id}">删除</a> <a href="queryProjectByIdServlet?id=${pj.id}">修改</a></td>
    			</tr>
    		</c:forEach>
    		
    		
    		
    	</table>
    
  </body>
</html>
