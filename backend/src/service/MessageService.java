package service;

import java.util.List;

import dao.MessageDao;
import domain.MessageDomain;

//留言业务层：servlet 调用这里的方法，这里再调用 MessageDao
public class MessageService {
	//创建 dao 对象
	MessageDao dao = new MessageDao();

	//1.发布留言
	//  【2026-11-19 改造】把 dao 返回的“新留言 id”继续往上返回给 Servlet
	public int addMessage(MessageDomain m) {
		return dao.addMessage(m);
	}

	//2.查询留言列表（currentUserId 是当前登录人的 id）
	public List<MessageDomain> queryAll(int currentUserId) {
		return dao.queryAll(currentUserId);
	}

	//3.根据 id 查一条留言
	public MessageDomain queryById(int id) {
		return dao.queryById(id);
	}

	//4.修改留言内容
	public void updateMessage(MessageDomain m) {
		dao.updateMessage(m);
	}

	//5.修改推送状态：0=取消推送，1=重新推送
	public void updateStatus(int id, int status) {
		dao.updateStatus(id, status);
	}

	//6.删除留言（连带评论、点赞一起删）
	public void deleteById(int id) {
		dao.deleteById(id);
	}

	//7.点赞 / 取消点赞（同一个按钮点一下切换一次）
	//返回 true 表示这次操作之后是“已点赞”，false 表示变成“未点赞”
	public boolean toggleLike(int messageId, int userId) {
		boolean liked = dao.isLiked(messageId, userId);   //先问数据库：我点过没有
		if (liked) {
			dao.deleteLike(messageId, userId);            //已经点过 → 取消点赞
			return false;                                 //返回“现在是未点赞”
		} else {
			dao.addLike(messageId, userId);               //没点过 → 加一条点赞记录
			return true;                                  //返回“现在是已点赞”
		}
	}

	//8.统计一条留言的赞数（Ajax 点赞后返回给前端用）
	public int countLikes(int messageId) {
		return dao.countLikes(messageId);
	}

	//9.盲盒留言：随机抽一条别人的留言
	//   excludeUserId 就是当前登录人的 id，用来把“自己发的”排除掉
	public MessageDomain queryRandom(int excludeUserId) {
		return dao.queryRandom(excludeUserId);
	}
}
