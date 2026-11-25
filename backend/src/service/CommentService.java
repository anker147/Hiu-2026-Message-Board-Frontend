package service;

import java.util.List;

import dao.CommentDao;
import domain.CommentDomain;

//评论业务层：servlet 调用这里，这里再调 CommentDao
public class CommentService {
	//创建 dao 对象
	CommentDao dao = new CommentDao();

	//1.发表评论（parent_id 传 0 就是评论留言，传别的评论 id 就是回复别人）
	//  【2026-11-19 改造】把 dao 返回的“新评论 id”继续往上返回给 Servlet
	public int addComment(CommentDomain c) {
		return dao.addComment(c);
	}

	//2.查询一条留言下的所有评论（已经在 dao 里拼好两级树，并带上赞数）
	public List<CommentDomain> queryByMessageId(int messageId, int currentUserId) {
		return dao.queryByMessageId(messageId, currentUserId);
	}

	//3.统计评论条数
	public int countByMessageId(int messageId) {
		return dao.countByMessageId(messageId);
	}

	//4.根据 id 查一条评论（改/删之前用它判断是不是本人发的）
	public CommentDomain queryById(int id) {
		return dao.queryById(id);
	}

	//5.修改评论 / 回复的内容
	public void updateContent(int id, String content) {
		dao.updateContent(id, content);
	}

	//6.删除评论 / 回复（一级评论会连它下面的回复一起删）
	public void deleteById(int id) {
		dao.deleteById(id);
	}

	//7.给评论点赞 / 取消点赞（同一个按钮点一下切换一次）
	//返回 true 表示这次操作之后是“已点赞”，false 表示变成“未点赞”
	//7.给评论点赞 / 取消点赞（同一个按钮点一下切换一次）
	//返回 true 表示这次操作之后是“已点赞”，false 表示变成“未点赞”
	public boolean toggleLike(int commentId, int userId) {
		boolean liked = dao.isLiked(commentId, userId);   //先查：我点过没有
		if (liked) {
			dao.deleteLike(commentId, userId);            //已经点过 → 取消点赞
			return false;
		} else {
			dao.addLike(commentId, userId);               //没点过 → 加一条点赞
			return true;
		}
	}

	//8.统计一条评论的赞数（Ajax 点赞后返回给前端用）
	public int countLikes(int commentId) {
		return dao.countLikes(commentId);
	}
}
