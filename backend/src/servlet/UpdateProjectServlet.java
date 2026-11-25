package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import service.ProjectService;

import domain.ProjectDomain;

public class UpdateProjectServlet extends HttpServlet {

	/**
	 * Constructor of the object.
	 */
	public UpdateProjectServlet() {
		super();
	}

	/**
	 * Destruction of the servlet. <br>
	 */
	public void destroy() {
		super.destroy(); // Just puts "destroy" string in log
		// Put your code here
	}

	/**
	 * The doGet method of the servlet. <br>
	 *
	 * This method is called when a form has its tag value method equals to get.
	 * 
	 * @param request the request send by the client to the server
	 * @param response the response send by the server to the client
	 * @throws ServletException if an error occurred
	 * @throws IOException if an error occurred
	 */
	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request,response);
	}

	/**
	 * The doPost method of the servlet. <br>
	 *
	 * This method is called when a form has its tag value method equals to post.
	 * 
	 * @param request the request send by the client to the server
	 * @param response the response send by the server to the client
	 * @throws ServletException if an error occurred
	 * @throws IOException if an error occurred
	 */
	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.当点击修改按钮后，输入框里的所有内容，都通过request对象，传递给servlet，所以我们在这直接get获取
		String project_name = request.getParameter("project_name");
		String project_value = request.getParameter("project_value");
		String project_cost = request.getParameter("project_cost");
		String project_manager = request.getParameter("project_manager");
		int manager_phone = Integer.parseInt(request.getParameter("manager_phone"));
		int id = Integer.parseInt(request.getParameter("id"));
		
		ProjectDomain pd = new ProjectDomain();
		pd.setId(id);
		pd.setProject_value(project_value);
		pd.setProject_cost(project_cost);
		pd.setProject_manager(project_manager);
		pd.setManager_phone(manager_phone);
		pd.setProject_name(project_name);
		
		//2.自己不干活，调用service层的一个新增方法，去干活
		ProjectService ps = new ProjectService();
		ps.updateProjectById(pd);
		
		//3.修改后，自己跳到查询的界面
		request.getRequestDispatcher("QueryProjectServlet").forward(request, response);
	}

	/**
	 * Initialization of the servlet. <br>
	 *
	 * @throws ServletException if an error occurs
	 */
	public void init() throws ServletException {
		// Put your code here
	}

}
