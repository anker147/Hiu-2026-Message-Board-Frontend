package servlet;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import domain.ProjectDomain;

import service.ProjectService;

public class AddProjectServlet extends HttpServlet {

	public AddProjectServlet() {
		super();
	}

	public void destroy() {
		super.destroy(); // Just puts "destroy" string in log
	}

	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request,response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//真正处理新增请求的方法
		//1.得到从前端页面传递过来的参数信息(你输入的一些内容)
		String project_name = request.getParameter("project_name");
		String project_value = request.getParameter("project_value");
		String project_cost = request.getParameter("project_cost");
		String project_manager = request.getParameter("project_manager");
		int manager_phone = Integer.parseInt(request.getParameter("manager_phone"));
		
		//1.5创建一个ProjectDomain的实体对象，用来存储获取到的信息
		ProjectDomain pd = new ProjectDomain();
		pd.setProject_value(project_value);
		pd.setProject_cost(project_cost);
		pd.setProject_manager(project_manager);
		pd.setManager_phone(manager_phone);
		pd.setProject_name(project_name);
		
		//2.自己不干活，调用service层的一个新增方法，去干活
		ProjectService ps = new ProjectService();
		ps.addProject(pd);
		
		//3.新增完成后，触发一个查询的请求，把新增的数据都展现出来
		//触发？：请求转发或重定向 跳转方式，QueryProjectServlet：请求
		request.getRequestDispatcher("QueryProjectServlet").forward(request, response);
		
		
	}

	public void init() throws ServletException {
	}

}
