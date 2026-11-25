package dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import db.DatabaseConn;
import domain.MessageDomain;

//留言表的 dao 层：操作 mb_message 表，另外还顺手操作 mb_like（点赞表）
public class MessageDao {

	//创建评论 dao，查留言的时候顺便把评论查出来（评论 dao 内部用自己的连接，互不影响）
	private CommentDao commentDao = new CommentDao();

	//1.新增一条留言
	//  【2026-11-19 改造】返回值由 void 改成 int：
	//  插入成功后把数据库生成的自增主键（新留言的 id）返回给 Servlet，
	//  Servlet 再把它写进 JSON 交给前端。前端拿到 id 才能用 JS 找到
	//  “刚刚插入的那条留言”，从而平滑滚动过去，而不是跳回页面顶部。
	public int addMessage(MessageDomain m) {
		Connection con = DatabaseConn.getConnection();
		//status 默认 1（已推送）；is_xxx_public 是三个“是否公开显示”的开关
		String sql = "insert into mb_message(user_id,nickname,real_name,email,phone,"
				+ "is_name_public,is_email_public,is_phone_public,content,status,create_time,update_time) "
				+ "values(?,?,?,?,?,?,?,?,?,?,?,?)";
		PreparedStatement pstmt = null;
		int newId = 0;   // 新留言的自增 id，插入成功后从数据库里取回来
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, m.getUser_id());
			pstmt.setString(2, m.getNickname());
			pstmt.setString(3, m.getReal_name());
			pstmt.setString(4, m.getEmail());
			pstmt.setString(5, m.getPhone());
			pstmt.setInt(6, m.getIs_name_public());            //姓名公开吗（1=公开 0=打码）
			pstmt.setInt(7, m.getIs_email_public());           //邮箱公开吗
			pstmt.setInt(8, m.getIs_phone_public());           //电话公开吗
			pstmt.setString(9, m.getContent());
			pstmt.setInt(10, 1);                                        //新留言默认“已推送”
			pstmt.setTimestamp(11, new Timestamp(new Date().getTime())); //创建时间
			pstmt.setTimestamp(12, new Timestamp(new Date().getTime())); //修改时间
			pstmt.executeUpdate();
			//插入成功后立刻取回自增 id（必须用同一个连接，原因见 lastInsertId 方法）
			newId = lastInsertId(con);
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
		return newId;    //返回 0 表示插入失败，前端会退化成“只刷新列表”
	}

	//2.查询留言列表（首页下半部分用）
	//   currentUserId：当前登录人的 id，用来判断“这条是不是我发的”“我点过赞没有”
	public List<MessageDomain> queryAll(int currentUserId) {
		List<MessageDomain> list = new ArrayList<MessageDomain>();
		Connection con = DatabaseConn.getConnection();
		//这条 SQL 稍微长一点，逐句解释：
		//  m.*                     → mb_message 的所有字段
		//  u.avatar                → 联表拿到发布人的头像编号
		//  show_nickname           → 列表上要显示的昵称：优先用用户在 mb_user 里设置/改过的网名，
		//                            没有网名才退回留言里存的那个，保证全站昵称统一（不会再出现手机号）
		//  like_count              → 用子查询数出这条留言的赞数
		//  comment_count           → 用子查询数出这条留言的评论数
		//  liked                   → 当前用户对这条留言点过赞没有（大于 0 就是点过）
		//  where m.status=1 或 m.user_id=? → 别人的“已取消推送”留言看不到，自己取消的还能看到
		//  order by m.id desc      → 最新发的留言排在最前面
		String sql = "select m.*, u.avatar, "
				+ "coalesce(nullif(u.nickname,''), m.nickname) as show_nickname, "
				+ "(select count(*) from mb_like l where l.message_id=m.id) as like_count, "
				+ "(select count(*) from mb_comment c where c.message_id=m.id) as comment_count, "
				+ "(select count(*) from mb_like l2 where l2.message_id=m.id and l2.user_id=?) as liked "
				+ "from mb_message m left join mb_user u on m.user_id=u.id "
				+ "where m.status=1 or m.user_id=? "
				+ "order by m.id desc";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, currentUserId);   //第一个问号：liked 子查询里的用户 id
			pstmt.setInt(2, currentUserId);   //第二个问号：where 里的用户 id
			rs = pstmt.executeQuery();
			while (rs.next()) {
				MessageDomain m = new MessageDomain();
				m.setId(rs.getInt("id"));
				m.setUser_id(rs.getInt("user_id"));
				m.setNickname(rs.getString("show_nickname")); //显示用昵称（用户网名优先）
				m.setReal_name(rs.getString("real_name"));
				m.setEmail(rs.getString("email"));
				m.setPhone(rs.getString("phone"));
				m.setIs_name_public(rs.getInt("is_name_public"));   //姓名是否公开
				m.setIs_email_public(rs.getInt("is_email_public")); //邮箱是否公开
				m.setIs_phone_public(rs.getInt("is_phone_public")); //电话是否公开
				m.setContent(rs.getString("content"));
				m.setStatus(rs.getInt("status"));
				m.setCreate_time(rs.getTimestamp("create_time"));
				m.setUpdate_time(rs.getTimestamp("update_time"));
				m.setAvatar(rs.getString("avatar"));            //联表查出来的头像
				m.setLike_count(rs.getInt("like_count"));       //赞的数量
				m.setComment_count(rs.getInt("comment_count")); //评论数量
				m.setLiked(rs.getInt("liked") > 0);             //大于 0 说明我点过赞
				list.add(m);
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);   //这里必须先关掉连接，再查评论，避免连接被占满
		}

		//再循环一遍，把每条留言下面的评论查出来（评论表数据量小，这样做最简单、最好理解）
		//第二个参数把“当前登录人”传进去，评论下面才能显示“我赞过没有”
		for (int i = 0; i < list.size(); i++) {
			MessageDomain m = list.get(i);
			m.setComments(commentDao.queryByMessageId(m.getId(), currentUserId));
		}
		return list;
	}

	//3.根据主键查询一条留言（点“修改”时，把原来的内容填回表单）
	public MessageDomain queryById(int id) {
		MessageDomain m = null;
		Connection con = DatabaseConn.getConnection();
		//同样用 coalesce 让“修改页”里显示的也是用户网名
		String sql = "select m.*, u.avatar, coalesce(nullif(u.nickname,''), m.nickname) as show_nickname "
				+ "from mb_message m left join mb_user u on m.user_id=u.id where m.id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, id);
			rs = pstmt.executeQuery();
			if (rs.next()) {
				m = new MessageDomain();
				m.setId(rs.getInt("id"));
				m.setUser_id(rs.getInt("user_id"));
				m.setNickname(rs.getString("show_nickname"));
				m.setReal_name(rs.getString("real_name"));
				m.setEmail(rs.getString("email"));
				m.setPhone(rs.getString("phone"));
				m.setIs_name_public(rs.getInt("is_name_public"));
				m.setIs_email_public(rs.getInt("is_email_public"));
				m.setIs_phone_public(rs.getInt("is_phone_public"));
				m.setContent(rs.getString("content"));
				m.setStatus(rs.getInt("status"));
				m.setCreate_time(rs.getTimestamp("create_time"));
				m.setUpdate_time(rs.getTimestamp("update_time"));
				m.setAvatar(rs.getString("avatar"));
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return m;
	}

	//4.修改留言内容（“三个点”菜单里的“修改内容”）
	public void updateMessage(MessageDomain m) {
		Connection con = DatabaseConn.getConnection();
		//除了昵称/姓名/邮箱/电话/内容，三个“是否公开”的开关也要一起存，
		//否则用户改一次内容，之前勾的公开状态就丢了
		String sql = "update mb_message set nickname=?,real_name=?,email=?,phone=?,"
				+ "is_name_public=?,is_email_public=?,is_phone_public=?,content=?,update_time=? where id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setString(1, m.getNickname());
			pstmt.setString(2, m.getReal_name());
			pstmt.setString(3, m.getEmail());
			pstmt.setString(4, m.getPhone());
			pstmt.setInt(5, m.getIs_name_public());
			pstmt.setInt(6, m.getIs_email_public());
			pstmt.setInt(7, m.getIs_phone_public());
			pstmt.setString(8, m.getContent());
			pstmt.setTimestamp(9, new Timestamp(new Date().getTime())); //把修改时间更新成现在
			pstmt.setInt(10, m.getId());
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//5.修改推送状态：status=0 取消推送，status=1 重新推送
	public void updateStatus(int id, int status) {
		Connection con = DatabaseConn.getConnection();
		String sql = "update mb_message set status=? where id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, status);
			pstmt.setInt(2, id);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//6.删除留言：先删它的评论、点赞，再删留言本身（顺序不能反）
	public void deleteById(int id) {
		commentDao.deleteByMessageId(id);  //1.删评论
		deleteLikeByMessageId(id);         //2.删点赞
		Connection con = DatabaseConn.getConnection();
		String sql = "delete from mb_message where id=?"; //3.删留言
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, id);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//7.点赞：往 mb_like 表插一条记录
	public void addLike(int messageId, int userId) {
		Connection con = DatabaseConn.getConnection();
		String sql = "insert into mb_like(message_id,user_id,create_time) values(?,?,?)";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, messageId);
			pstmt.setInt(2, userId);
			pstmt.setTimestamp(3, new Timestamp(new Date().getTime()));
			pstmt.executeUpdate();
		} catch (SQLException e) {
			//如果同一个人重复点赞，唯一索引会报错，这里直接忽略就行（页面还是正常的）
			System.out.println("重复点赞被拦截：" + e.getMessage());
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//8.取消点赞：把这条点赞记录删掉
	public void deleteLike(int messageId, int userId) {
		Connection con = DatabaseConn.getConnection();
		String sql = "delete from mb_like where message_id=? and user_id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, messageId);
			pstmt.setInt(2, userId);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//9.判断“我”有没有给这条留言点过赞（true=点过）
	public boolean isLiked(int messageId, int userId) {
		boolean liked = false;
		Connection con = DatabaseConn.getConnection();
		String sql = "select id from mb_like where message_id=? and user_id=?";
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, messageId);
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

	//10.删除一条留言的所有点赞（删除留言时调用）
	public void deleteLikeByMessageId(int messageId) {
		Connection con = DatabaseConn.getConnection();
		String sql = "delete from mb_like where message_id=?";
		PreparedStatement pstmt = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, messageId);
			pstmt.executeUpdate();
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(null, pstmt, con);
		}
	}

	//11.查询一条留言现在一共有多少个赞
	//   为什么需要它？因为 Ajax 点赞是不刷新页面的，
	//   前端必须拿到一个“准确的最新赞数”才能把按钮上的数字改对
	public int countLikes(int messageId) {
		int count = 0;                                              //默认 0 个赞
		Connection con = DatabaseConn.getConnection();               //拿连接
		String sql = "select count(*) from mb_like where message_id=?"; //数一数有几行
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, messageId);                              //第 1 个问号：留言 id
			rs = pstmt.executeQuery();
			if (rs.next()) {
				count = rs.getInt(1);                                //第 1 列就是 count(*)
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);                                //统一关连接
		}
		return count;
	}

	//12.盲盒留言：随机抽一条“别人的、还在推送中的”留言
	//   order by rand() 是 MySQL 的随机排序，limit 1 表示只要一条
	//   m.user_id<>? 把“自己发的”排除掉，这样抽出来的才是别人的留言
	public MessageDomain queryRandom(int currentUserId) {
		MessageDomain m = null;                                      //没抽到就返回 null，让上层给提示
		Connection con = DatabaseConn.getConnection();
		//SQL 和 queryAll 基本一样，只是 where 条件换成了“随机取一条 + 不是自己的”
		String sql = "select m.*, u.avatar, "
				+ "coalesce(nullif(u.nickname,''), m.nickname) as show_nickname, "   //优先显示用户网名
				+ "(select count(*) from mb_like l where l.message_id=m.id) as like_count, "
				+ "(select count(*) from mb_comment c where c.message_id=m.id) as comment_count, "
				+ "(select count(*) from mb_like l2 where l2.message_id=m.id and l2.user_id=?) as liked "
				+ "from mb_message m left join mb_user u on m.user_id=u.id "
				+ "where m.status=1 and m.user_id<>? "                       //只抽别人已推送的留言
				+ "order by rand() limit 1";                                 //随机排序，取第一条
		PreparedStatement pstmt = null;
		ResultSet rs = null;
		try {
			pstmt = con.prepareStatement(sql);
			pstmt.setInt(1, currentUserId);                          //第 1 个问号：判断“我点过赞没有”
			pstmt.setInt(2, currentUserId);                          //第 2 个问号：排除我自己发的
			rs = pstmt.executeQuery();
			if (rs.next()) {                                         //能 next 说明抽到了一条
				m = new MessageDomain();
				m.setId(rs.getInt("id"));
				m.setUser_id(rs.getInt("user_id"));
				m.setNickname(rs.getString("show_nickname"));        //显示用昵称
				m.setReal_name(rs.getString("real_name"));
				m.setEmail(rs.getString("email"));
				m.setPhone(rs.getString("phone"));
				m.setIs_name_public(rs.getInt("is_name_public"));
				m.setIs_email_public(rs.getInt("is_email_public"));
				m.setIs_phone_public(rs.getInt("is_phone_public"));
				m.setContent(rs.getString("content"));
				m.setStatus(rs.getInt("status"));
				m.setCreate_time(rs.getTimestamp("create_time"));
				m.setUpdate_time(rs.getTimestamp("update_time"));
				m.setAvatar(rs.getString("avatar"));
				m.setLike_count(rs.getInt("like_count"));
				m.setComment_count(rs.getInt("comment_count"));
				m.setLiked(rs.getInt("liked") > 0);
			}
		} catch (SQLException e) {
			e.printStackTrace();
		} finally {
			closeAll(rs, pstmt, con);
		}
		return m;
	}

	//14.小工具：取当前连接上刚刚插入记录的自增 id
	//   MySQL 的 last_insert_id() 是“连接级别”的函数，
	//   所以必须拿刚才执行 insert 的那个 Connection 来查，换成新连接会拿到 0。
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

	//13.小工具：统一关闭资源
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
