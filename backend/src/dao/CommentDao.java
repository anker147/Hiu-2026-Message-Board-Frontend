package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import db.DatabaseConn;
import domain.CommentDomain;

//评论 / 回复的 dao 层：操作 mb_comment 表
//本次改动：1) 查评论时联表 mb_user，显示用户设置的网名（不再显示手机号）
//         2) 每条评论都带“赞数 / 我赞过没有”
//         3) 新增：按 id 查一条评论、改评论内容、删评论
//         4) 新增：评论点赞（mb_comment_like 表）
public class CommentDao {

	//1.新增一条评论（或回复）
	//  【2026-11-19 改造】返回值由 void 改成 int：
	//  返回新评论的自增 id，Servlet 把它放进 JSON，
	//  前端据此定位到刚发的评论，做平滑滚动 + 高亮。
	public int addComment(CommentDomain c) {
		Connection con = DatabaseConn.getConnection();
		String sql = "insert into mb_comment(message_id,user_id,nickname,avatar,content,parent_id,create_time) values(?,?,?,?,?,?,?)";
		PreparedStatement pstmt = null;
		int newId = 0;   // 新评论的自增 id
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, c.getMessage_id());        //属于哪条留言
			pstmt.setInt(2, c.getUser_id());           //谁评论的
			pstmt.setString(3, c.getNickname());       //昵称（存的是用户网名）
			pstmt.setString(4, c.getAvatar());         //头像编号
			pstmt.setString(5, c.getContent());        //评论内容
			pstmt.setInt(6, c.getParent_id());         //0=直接评论留言，其它=回复某条评论
			pstmt.setTimestamp(7, new Timestamp(new Date().getTime())); //评论时间
			pstmt.executeUpdate();
			//插入成功后马上取回自增 id（同一个连接，原因见 lastInsertId）
			newId = lastInsertId(con);
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
		return newId;
	}

	//2.查询一条留言下的所有评论，并且组装成“两级树”
	//  messageId    ：哪条留言
	//  currentUserId：当前登录人 id，用来算“我有没有给这条评论点过赞”
	public List<CommentDomain> queryByMessageId(int messageId, int currentUserId) {
		List<CommentDomain> topList = new ArrayList<CommentDomain>();   //最终返回的一级评论
		Map<Integer, CommentDomain> map = new HashMap<Integer, CommentDomain>(); //id -> 评论对象，方便找父级
		List<CommentDomain> all = new ArrayList<CommentDomain>();       //先把所有评论按顺序查出来
		Connection con = DatabaseConn.getConnection();

		//这条 SQL 做了三件事：
		//  left join mb_user      → 拿到评论人现在的网名和头像（网名改了，评论上也跟着变）
		//  like_count 子查询      → 这条评论一共多少个赞
		//  liked 子查询           → 当前登录人有没有赞过（>0 就是赞过）
		String sql = "select c.*, u.nickname as user_nickname, u.avatar as user_avatar, "
				+ "(select count(*) from mb_comment_like cl where cl.comment_id=c.id) as like_count, "
				+ "(select count(*) from mb_comment_like cl2 where cl2.comment_id=c.id and cl2.user_id=?) as liked "
				+ "from mb_comment c left join mb_user u on c.user_id=u.id "
				+ "where c.message_id=? order by c.id asc";

		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, currentUserId);   //第一个问号：liked 子查询里的用户 id
			pstmt.setInt(2, messageId);       //第二个问号：哪条留言
			rs = pstmt.executeQuery();
			while (rs.next()) {
				CommentDomain c = new CommentDomain();
				c.setId(rs.getInt("id"));
				c.setMessage_id(rs.getInt("message_id"));
				c.setUser_id(rs.getInt("user_id"));

				//昵称优先用 mb_user 里的网名，取不到才用评论表里存的旧昵称
				String nick = rs.getString("user_nickname");
				if (nick == null || nick.trim().equals("")) {
					nick = rs.getString("nickname");
				}
				c.setNickname(nick);

				//头像同理：优先用用户现在的头像
				String av = rs.getString("user_avatar");
				if (av == null || av.trim().equals("")) {
					av = rs.getString("avatar");
				}
				c.setAvatar(av);

				c.setContent(rs.getString("content"));
				c.setParent_id(rs.getInt("parent_id"));
				c.setCreate_time(rs.getTimestamp("create_time"));
				c.setUpdate_time(rs.getTimestamp("update_time"));
				c.setLike_count(rs.getInt("like_count"));   //赞数
				c.setLiked(rs.getInt("liked") > 0);         //我赞过没有
				all.add(c);                 //放进总列表
				map.put(c.getId(), c);      //同时放进 map，后面靠 id 找它
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}

		//上面已经把所有数据读进内存了，下面这段循环纯粹是“在内存里拼树”，不再查数据库
		for (int i = 0; i < all.size(); i++) {
			CommentDomain c = all.get(i);
			if (c.getParent_id() == 0) {            //没有父级 → 就是一级评论
				topList.add(c);
			} else {
				CommentDomain parent = map.get(c.getParent_id()); //找到它回复的那条评论
				if (parent == null) {               //父评论被删了，就当成一级评论显示，避免数据丢失
					topList.add(c);
				} else {
					c.setReply_nickname(parent.getNickname());    //页面上显示“回复 @某某”
					//一直往上找，直到找到一级评论，把回复挂到一级评论下面（只显示两层，页面才整齐）
					CommentDomain root = parent;
					int guard = 0;                  //防止数据出现死循环
					while (root.getParent_id() != 0 && guard < 20) {
						CommentDomain up = map.get(root.getParent_id());
						if (up == null) break;
						root = up;
						guard++;
					}
					root.getReplies().add(c);       //挂到一级评论的 replies 集合里
				}
			}
		}
		return topList;
	}

	//2.1 老方法（不带当前用户）：不关心“我赞过没有”时用，内部转调上面的方法
	public List<CommentDomain> queryByMessageId(int messageId) {
		return queryByMessageId(messageId, 0);
	}

	//3.根据主键查一条评论（改评论前先查出来、判断是不是本人）
	public CommentDomain queryById(int id) {
		CommentDomain c = null;
		Connection con = DatabaseConn.getConnection();
		String sql = "select * from mb_comment where id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, id);
			rs = pstmt.executeQuery();
			if (rs.next()) {
				c = new CommentDomain();
				c.setId(rs.getInt("id"));
				c.setMessage_id(rs.getInt("message_id"));
				c.setUser_id(rs.getInt("user_id"));
				c.setNickname(rs.getString("nickname"));
				c.setAvatar(rs.getString("avatar"));
				c.setContent(rs.getString("content"));
				c.setParent_id(rs.getInt("parent_id"));
				c.setCreate_time(rs.getTimestamp("create_time"));
				c.setUpdate_time(rs.getTimestamp("update_time"));
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return c;
	}

	//4.修改评论 / 回复的内容（“三个点”之外，回复下面也有“修改”入口）
	public void updateContent(int id, String content) {
		Connection con = DatabaseConn.getConnection();
		String sql = "update mb_comment set content=?, update_time=? where id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setString(1, content);
			pstmt.setTimestamp(2, new Timestamp(new Date().getTime())); //记一下改的时间
			pstmt.setInt(3, id);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//5.删除一条评论 / 回复
	//  如果删的是一级评论，它下面的回复、回复的赞也一起删掉，不留垃圾数据
	public void deleteById(int id) {
		//1)先把它下面的回复 id 找出来
		List<Integer> childIds = queryChildIds(id);
		//2)删掉这些回复的点赞、以及回复本身
		for (int i = 0; i < childIds.size(); i++) {
			int childId = childIds.get(i).intValue();
			deleteLikeByCommentId(childId);   //先删回复的赞
			deleteCommentRow(childId);        //再删回复
		}
		//3)删掉自己的点赞
		deleteLikeByCommentId(id);
		//4)最后删自己
		deleteCommentRow(id);
	}

	//5.1 工具：把 mb_comment 里某一行删掉
	private void deleteCommentRow(int id) {
		Connection con = DatabaseConn.getConnection();
		String sql = "delete from mb_comment where id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, id);              //要删哪一条
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//5.2 工具：查某条评论下面所有回复的 id
	private List<Integer> queryChildIds(int parentId) {
		List<Integer> ids = new ArrayList<Integer>();
		Connection con = DatabaseConn.getConnection();
		String sql = "select id from mb_comment where parent_id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, parentId);
			rs = pstmt.executeQuery();
			while (rs.next()) {
				ids.add(Integer.valueOf(rs.getInt("id")));
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return ids;
	}

	//6.统计一条留言下有多少条评论（含回复），首页列表上显示“评论 3”
	public int countByMessageId(int messageId) {
		int count = 0;
		Connection con = DatabaseConn.getConnection();
		String sql = "select count(*) from mb_comment where message_id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, messageId);
			rs = pstmt.executeQuery();
			if (rs.next()) {
				count = rs.getInt(1);                  //第一列就是 count(*)
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return count;
	}

	//7.删除一条留言时，把它下面的评论一起删掉（否则会留下垃圾数据）
	public void deleteByMessageId(int messageId) {
		//先删这些评论的点赞
		List<Integer> ids = new ArrayList<Integer>();
		Connection con = DatabaseConn.getConnection();
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement("select id from mb_comment where message_id=?");
			pstmt.setInt(1, messageId);
			rs = pstmt.executeQuery();
			while (rs.next()) {
				ids.add(Integer.valueOf(rs.getInt("id")));
			}
			rs.close();
			rs = null;
			pstmt.close();
			pstmt = null;

			//逐个删点赞
			for (int i = 0; i < ids.size(); i++) {
				PreparedStatement p2 = con.prepareStatement("delete from mb_comment_like where comment_id=?");
				p2.setInt(1, ids.get(i).intValue());
				p2.executeUpdate();
				p2.close();
			}

			//最后删评论本身
			pstmt = con.prepareStatement("delete from mb_comment where message_id=?");
			pstmt.setInt(1, messageId);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
	}

	//8.评论点赞：往 mb_comment_like 插一条
	public void addLike(int commentId, int userId) {
		Connection con = DatabaseConn.getConnection();
		String sql = "insert into mb_comment_like(comment_id,user_id,create_time) values(?,?,?)";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, commentId);
			pstmt.setInt(2, userId);
			pstmt.setTimestamp(3, new Timestamp(new Date().getTime()));
			pstmt.executeUpdate();
		} catch (SQLException e) {
			//同一个人重复点赞，唯一索引会报错，忽略即可
			System.out.println("重复给评论点赞被拦截：" + e.getMessage());
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//9.取消评论点赞
	public void deleteLike(int commentId, int userId) {
		Connection con = DatabaseConn.getConnection();
		String sql = "delete from mb_comment_like where comment_id=? and user_id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, commentId);
			pstmt.setInt(2, userId);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//10.判断“我”有没有给这条评论点过赞
	public boolean isLiked(int commentId, int userId) {
		boolean liked = false;
		Connection con = DatabaseConn.getConnection();
		String sql = "select id from mb_comment_like where comment_id=? and user_id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, commentId);
			pstmt.setInt(2, userId);
			rs = pstmt.executeQuery();
			if (rs.next()) {
				liked = true;
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return liked;
	}

	//10.1 查询一条评论现在一共有多少个赞
	//     Ajax 点赞不刷新页面，所以后台要把最新的赞数算出来交给前端
	public int countLikes(int commentId) {
		int count = 0;                                                       //默认 0
		Connection con = DatabaseConn.getConnection();
		String sql = "select count(*) from mb_comment_like where comment_id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, commentId);                                      //评论 id
			rs = pstmt.executeQuery();
			if (rs.next()) {
				count = rs.getInt(1);                                        //第 1 列就是总数
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return count;
	}

	//11.删掉某条评论的所有点赞（删评论时调用）
	public void deleteLikeByCommentId(int commentId) {
		Connection con = DatabaseConn.getConnection();
		String sql = "delete from mb_comment_like where comment_id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, commentId);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//12.小工具：统一关闭资源
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
	//9.小工具：取当前连接上刚刚插入记录的自增 id
	//   MySQL 的 last_insert_id() 必须在同一个 Connection 上查，
	//   否则会返回 0，前端就找不到刚插入的那条评论了。
	private int lastInsertId(Connection con) {
		int id = 0;
		Statement st = null;
		ResultSet rs = null;
		try {
			st = con.createStatement();
			rs = st.executeQuery("select last_insert_id()");
			if (rs.next()) {
				id = rs.getInt(1);
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			try {
				if (rs != null) rs.close();
			} catch (SQLException e) {
				e.printStackTrace();
			}
			try {
				if (st != null) st.close();
			} catch (SQLException e) {
				e.printStackTrace();
			}
		}
		return id;
	}

}
