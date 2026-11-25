package domain;
//项目信息实体类
public class ProjectDomain {
	//1.属性
	private int id;
	private String project_name;
	private String project_value;
	private String project_cost;
	private String project_manager;
	private int manager_phone;
	
	
	public int getId() {
		return id;
	}
	public void setId(int id) {
		this.id = id;
	}
	public String getProject_name() {
		return project_name;
	}
	public void setProject_name(String projectName) {
		project_name = projectName;
	}
	public String getProject_value() {
		return project_value;
	}
	public void setProject_value(String projectValue) {
		project_value = projectValue;
	}
	public String getProject_cost() {
		return project_cost;
	}
	public void setProject_cost(String projectCost) {
		project_cost = projectCost;
	}
	public String getProject_manager() {
		return project_manager;
	}
	public void setProject_manager(String projectManager) {
		project_manager = projectManager;
	}
	public int getManager_phone() {
		return manager_phone;
	}
	public void setManager_phone(int managerPhone) {
		manager_phone = managerPhone;
	}
	public ProjectDomain() {
		super();
	}
	public ProjectDomain(String projectName, String projectValue,
			String projectCost, String projectManager, int managerPhone) {
		super();
		project_name = projectName;
		project_value = projectValue;
		project_cost = projectCost;
		project_manager = projectManager;
		manager_phone = managerPhone;
	}
	
	
}
