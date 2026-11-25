package service;

import java.util.List;

import dao.ProjectDao;
import domain.ProjectDomain;

//业务逻辑层service
//写 增删改查的一些方法,供servlet调用
public class ProjectService {
	//创建dao对象
	ProjectDao dao = new ProjectDao();
	
	//1.新增方法
	public void addProject(ProjectDomain pd) {
		dao.addProject(pd);
	}
	//2.查询所有项目信息方法
	public List<ProjectDomain> queryProject() {
		return dao.queryProject();
	}
	//3.根据主键删除项目信息方法
	public void deleteProjectById(int id) {
		dao.deleteProjectById(id);
	}
	//4.根据主键查询出一条数据信息
	public ProjectDomain queryProjectById(int id) {
		return dao.queryProjectById(id);
	}
	//5.根据主键修改一条数据信息
	public void updateProjectById(ProjectDomain pd) {
		dao.updateProjectById(pd);
	}
}
