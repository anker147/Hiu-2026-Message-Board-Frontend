package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Date;

import db.DatabaseConn;
import domain.UserDomain;

//用户表的 dao 层：直接操作 mb_user 表，供 UserService 调用
//注意：你的 DatabaseConn 里 con / pstmt / rs 都是 static 的，多个方法同时用会互相覆盖，
//所以这里每个方法都用“局部变量”，用完自己关，最稳当，小白也不会踩坑。
public class UserDao {

	//1.判断账号是否已经被注册过（返回 true 说明已存在，不能再注册）
	public boolean existsAccount(String account) {
		boolean exists = false;                       //默认认为不存在
		Connection con = DatabaseConn.getConnection(); //拿到数据库连接
		String sql = "select id from mb_user where account=?"; //按账号查，? 由下面的 setString 填值
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);         //预处理 SQL，防止 SQL 注入
			pstmt.setString(1, account);               //给第 1 个问号赋值
			rs = pstmt.executeQuery();                 //执行查询
			if (rs.next()) {                           //能查到记录，说明账号已存在
				exists = true;
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);                  //无论成功失败，最后都要关资源
		}
		return exists;
	}

	//2.新增一个用户（注册）
	public void addUser(UserDomain user) {
		Connection con = DatabaseConn.getConnection();
		//insert 语句里 7 个问号分别对应：账号(手机号)、邮箱、密码、头像、默认ID、网名、注册时间
		String sql = "insert into mb_user(account,email,password,avatar,user_no,nickname,create_time) values(?,?,?,?,?,?,?)";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setString(1, user.getAccount());
			pstmt.setString(2, user.getEmail());
			pstmt.setString(3, user.getPassword());
			pstmt.setString(4, user.getAvatar());
			pstmt.setString(5, user.getUser_no());
			pstmt.setString(6, user.getNickname());     //随机网名，例如“快乐的小狗”
			//java.util.Date 转成数据库能认的 Timestamp
			pstmt.setTimestamp(7, new Timestamp(new Date().getTime()));
			pstmt.executeUpdate();                     //增删改都用 executeUpdate
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//3.登录：账号 + 密码同时匹配才算登录成功，查不到就返回 null
	public UserDomain login(String account, String password) {
		UserDomain user = null;
		Connection con = DatabaseConn.getConnection();
		String sql = "select * from mb_user where account=? and password=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setString(1, account);
			pstmt.setString(2, password);
			rs = pstmt.executeQuery();
			if (rs.next()) {                           //查到一行，说明账号密码正确
				user = toUser(rs);                     //把这一行数据包装成 UserDomain 对象
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return user;
	}

	//4.根据主键查询一个用户（改完头像后，用它把最新的用户信息重新查出来）
	public UserDomain queryById(int id) {
		UserDomain user = null;
		Connection con = DatabaseConn.getConnection();
		String sql = "select * from mb_user where id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, id);
			rs = pstmt.executeQuery();
			if (rs.next()) {
				user = toUser(rs);
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return user;
	}

	//5.修改头像（只改 avatar 一个字段）
	public void updateAvatar(int id, String avatar) {
		Connection con = DatabaseConn.getConnection();
		String sql = "update mb_user set avatar=? where id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setString(1, avatar);                //新头像编号
			pstmt.setInt(2, id);                       //改谁
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//6.修改网名（用户在留言表单里改了昵称，就顺手把账号的网名也改掉，
	//  这样他的留言、评论显示的名字永远保持一致）
	public void updateNickname(int id, String nickname) {
		Connection con = DatabaseConn.getConnection();
		String sql = "update mb_user set nickname=? where id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setString(1, nickname);
			pstmt.setInt(2, id);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//7.小工具：把 ResultSet 里当前这一行，转成 UserDomain 对象
	//（这样上面几个方法就不用重复写一堆 set 了）
	private UserDomain toUser(ResultSet rs) throws SQLException {
		UserDomain user = new UserDomain();
		user.setId(rs.getInt("id"));
		user.setAccount(rs.getString("account"));
		user.setEmail(rs.getString("email"));
		user.setPassword(rs.getString("password"));
		user.setAvatar(rs.getString("avatar"));
		user.setUser_no(rs.getString("user_no"));
		user.setNickname(rs.getString("nickname"));       //网名，列表上显示的就是它
		user.setCreate_time(rs.getTimestamp("create_time")); //Timestamp 本身就是 Date 的子类
		return user;
	}

	//8.小工具：统一关闭资源（先关 ResultSet，再关 PreparedStatement，最后关 Connection）
	private void closeAll(ResultSet rs, PreparedStatement pstmt, Connection con) {
		try {
			if (rs != null) rs.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			if (pstmt != null) pstmt.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			if (con != null) con.close();
		} catch (SQLException e) {
			e.printStackTrace();
		}
	}
}
