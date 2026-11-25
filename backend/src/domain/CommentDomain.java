package domain;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

//评论实体类（对应数据库 mb_comment 表）
//一张表同时存“评论”和“回复”：
//  parent_id = 0    →  直接评论留言
//  parent_id = 其它评论的id  →  回复那条评论
public class CommentDomain {
	//1.数据库 mb_comment 表里真实存在的字段
	private int id;              //评论主键
	private int message_id;      //属于哪一条留言
	private int user_id;         //评论人id
	private String nickname;     //评论人昵称
	private String avatar;       //评论人头像编号
	private String content;      //评论内容
	private int parent_id;       //回复目标评论的id，0 表示直接评论留言
	private Date create_time;    //评论时间
	private Date update_time;    //最后修改时间（改过回复才有值）

	//2.下面是页面显示时额外用到的字段（数据库里没有）
	private String reply_nickname;  //被回复人的昵称，页面上显示成“回复 @某某”
	private int like_count;         //这条评论/回复一共多少个赞
	private boolean liked;          //当前登录的人有没有给它点过赞
	private List<CommentDomain> replies = new ArrayList<CommentDomain>(); //这条评论下面的回复

	//3.无参构造方法
	public CommentDomain() {
		super();
	}

	//4.getter / setter
	public int getId() {
		return id;
	}

	public void setId(int id) {
		this.id = id;
	}

	public int getMessage_id() {
		return message_id;
	}

	public void setMessage_id(int messageId) {
		message_id = messageId;
	}

	public int getUser_id() {
		return user_id;
	}

	public void setUser_id(int userId) {
		user_id = userId;
	}

	public String getNickname() {
		return nickname;
	}

	public void setNickname(String nickname) {
		this.nickname = nickname;
	}

	public String getAvatar() {
		return avatar;
	}

	public void setAvatar(String avatar) {
		this.avatar = avatar;
	}

	public String getContent() {
		return content;
	}

	public void setContent(String content) {
		this.content = content;
	}

	public int getParent_id() {
		return parent_id;
	}

	public void setParent_id(int parentId) {
		parent_id = parentId;
	}

	public Date getCreate_time() {
		return create_time;
	}

	public void setCreate_time(Date createTime) {
		create_time = createTime;
	}

	public Date getUpdate_time() {
		return update_time;
	}

	public void setUpdate_time(Date updateTime) {
		update_time = updateTime;
	}

	public int getLike_count() {
		return like_count;
	}

	public void setLike_count(int likeCount) {
		like_count = likeCount;
	}

	public boolean isLiked() {
		return liked;
	}

	public void setLiked(boolean liked) {
		this.liked = liked;
	}

	public String getReply_nickname() {
		return reply_nickname;
	}

	public void setReply_nickname(String replyNickname) {
		reply_nickname = replyNickname;
	}

	public List<CommentDomain> getReplies() {
		return replies;
	}

	public void setReplies(List<CommentDomain> replies) {
		this.replies = replies;
	}
}
