package dao;


import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import db.DatabaseConn;
import domain.ProjectDomain;

//dao层 写增删改查的方法，直接操作数据库的。供service调用。
public class ProjectDao {
	private PreparedStatement pstmt = null;
	private ResultSet rs = null;
	//1.新增方法
	public void addProject(ProjectDomain pd) {
		//1.链接数据库
		Connection con = DatabaseConn.getConnection();
		//2.写sql语句 insert into ...
		String sql = "insert into project(project_name,project_value,project_cost,project_manager,manager_phone) values(?,?,?,?,?)";
		try {
			//3.执行sql语句  Statement  PrepareStatement ?
			pstmt = con.prepareStatement(sql);//创建预处理sql语句的对象pstmt
			pstmt.setString(1, pd.getProject_name());//这里5行，设置5个问号的值
			pstmt.setString(2, pd.getProject_value());
			pstmt.setString(3, pd.getProject_cost());
			pstmt.setString(4, pd.getProject_manager());
			pstmt.setInt(5, pd.getManager_phone());
			//执行sql语句，插入数据，非常重要，必须要有
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			DatabaseConn.close();
		}
		
	}
	
	//2.查询所有项目信息的方法
	public List<ProjectDomain> queryProject() {
		//创建一个集合对象，存储所有查询出来的数据
		List<ProjectDomain> list = new ArrayList<ProjectDomain>();
		//1.链接数据库
		Connection con = DatabaseConn.getConnection();
		//2.写sql语句 insert into ...
		String sql = "select * from project";
		try {
			//3.执行sql语句  Statement  PrepareStatement ?
			pstmt = con.prepareStatement(sql);//创建预处理sql语句的对象pstmt
			//执行sql语句，插入数据
			rs = pstmt.executeQuery();
			
			while(rs.next()) {
				int id = rs.getInt(1);
				String project_name = rs.getString("project_name");
				String project_cost = rs.getString("project_cost");
				String project_manager = rs.getString("project_manager");
				String project_value = rs.getString("project_value");
				int manager_phone = rs.getInt("manager_phone");
				//每次找到一行数据，都创建一个新的项目信息对象，把这行的信息存入这个项目信息对象中。
				ProjectDomain pd = new ProjectDomain();
				pd.setId(id);
				pd.setManager_phone(manager_phone);
				pd.setProject_cost(project_cost);
				pd.setProject_manager(project_manager);
				pd.setProject_name(project_name);
				pd.setProject_value(project_value);
				//把项目信息的对象，添加到集合List中
				list.add(pd);
			}
			
			
			
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			DatabaseConn.close();
		}
		return list;
		
	}
	
	
	//3.根据主键删除项目信息的方法
	public void deleteProjectById(int id) {
		
		//1.链接数据库
		Connection con = DatabaseConn.getConnection();
		//2.写sql语句 insert into ...
		String sql = "delete from project where id=?";
		try {
			//3.执行sql语句  Statement  PrepareStatement ?
			pstmt = con.prepareStatement(sql);//创建预处理sql语句的对象pstmt
			pstmt.setInt(1, id);
			//执行sql语句，插入数据
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			DatabaseConn.close();
		}
	}
	
	
	//4.根据id查询一条项目信息的方法
	public ProjectDomain queryProjectById(int id) {
		ProjectDomain pd = new ProjectDomain();
		//1.链接数据库
		Connection con = DatabaseConn.getConnection();
		//2.写sql语句 insert into ...
		String sql = "select * from project where id=?";
		try {
			//3.执行sql语句  Statement  PrepareStatement ?
			pstmt = con.prepareStatement(sql);//创建预处理sql语句的对象pstmt
			pstmt.setInt(1, id);
			//执行sql语句，插入数据
			rs = pstmt.executeQuery();
			
			rs.next();
			String project_name = rs.getString("project_name");
			String project_cost = rs.getString("project_cost");
			String project_manager = rs.getString("project_manager");
			String project_value = rs.getString("project_value");
			int manager_phone = rs.getInt("manager_phone");
			//每次找到一行数据，都创建一个新的项目信息对象，把这行的信息存入这个项目信息对象中。
			
			pd.setId(id);
			pd.setManager_phone(manager_phone);
			pd.setProject_cost(project_cost);
			pd.setProject_manager(project_manager);
			pd.setProject_name(project_name);
			pd.setProject_value(project_value);
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			DatabaseConn.close();
		}
		return pd;
		
	}
	
	//5.修改方法
	public void updateProjectById(ProjectDomain pd) {
		//1.链接数据库
		Connection con = DatabaseConn.getConnection();
		//2.写sql语句
		String sql = "update project set project_name=?,project_value=?,project_cost=?,project_manager=?,manager_phone=? where id=?";
		try {
			//3.执行sql语句  Statement  PrepareStatement ?
			pstmt = con.prepareStatement(sql);//创建预处理sql语句的对象pstmt
			pstmt.setString(1, pd.getProject_name());//这里5行，设置5个问号的值
			pstmt.setString(2, pd.getProject_value());
			pstmt.setString(3, pd.getProject_cost());
			pstmt.setString(4, pd.getProject_manager());
			pstmt.setInt(5, pd.getManager_phone());
			pstmt.setInt(6, pd.getId());
			//执行sql语句，插入数据
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			DatabaseConn.close();
		}
		
	}
}
