package domain;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

//留言实体类（对应数据库 mb_message 表）
//一条留言 = 一个 MessageDomain 对象；留言下面挂的评论放在 comments 集合里
public class MessageDomain {
	//1.数据库 mb_message 表里真实存在的字段
	private int id;              //留言主键
	private int user_id;         //发布人id（关联 mb_user.id），用来判断“这条留言是不是我发的”
	private String nickname;     //昵称
	private String real_name;    //姓名
	private String email;        //邮箱地址
	private String phone;        //联系电话
	//下面三个是“是否公开显示”的开关：1=公开（原样显示），0=不公开（页面上打码）
	private int is_name_public;  //姓名是否公开
	private int is_email_public; //邮箱是否公开
	private int is_phone_public; //电话是否公开
	private String content;      //留言内容
	private int status;          //1=已推送（所有人可见），0=已取消推送（只有自己可见）
	private Date create_time;    //留言时间
	private Date update_time;    //最后修改时间

	//2.下面这些字段数据库表里没有，是查询时“算”出来的，方便页面直接显示
	private String avatar;              //发布人的头像编号（联表 mb_user 查出来）
	private int like_count;             //这条留言一共有多少个赞
	private int comment_count;          //这条留言一共有多少条评论
	private boolean liked;              //当前登录的人有没有点过赞（true=已点赞，按钮变红）
	private List<CommentDomain> comments = new ArrayList<CommentDomain>(); //这条留言下面的所有评论（含回复）

	//3.无参构造方法
	public MessageDomain() {
		super();
	}

	//4.getter / setter
	//提示：EL 表达式里 ${msg.create_time} 会调用 getCreate_time()；
	//${msg.comments} 会调用 getComments()，拿到评论集合后再用 <c:forEach> 遍历
	public int getId() {
		return id;
	}

	public void setId(int id) {
		this.id = id;
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

	public String getReal_name() {
		return real_name;
	}

	public void setReal_name(String realName) {
		real_name = realName;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getPhone() {
		return phone;
	}

	public void setPhone(String phone) {
		this.phone = phone;
	}

	public int getIs_name_public() {
		return is_name_public;
	}

	public void setIs_name_public(int isNamePublic) {
		is_name_public = isNamePublic;
	}

	public int getIs_email_public() {
		return is_email_public;
	}

	public void setIs_email_public(int isEmailPublic) {
		is_email_public = isEmailPublic;
	}

	public int getIs_phone_public() {
		return is_phone_public;
	}

	public void setIs_phone_public(int isPhonePublic) {
		is_phone_public = isPhonePublic;
	}

	/* ============================================================
	   下面三个方法是给页面用的“展示值”，EL 里这样写：
	     ${m.real_name_show}   ${m.email_show}   ${m.phone_show}
	   规则：勾了“公开显示”就原样返回；没勾就打码
	     - 邮箱 abcdef@qq.com  →  abc***@qq.com
	     - 电话 13800001111    →  138****1111
	     - 姓名 张三           →  张*
	   这样页面不用写一堆 c:choose，逻辑集中在 Java 里
	   ============================================================ */

	//1.姓名的展示值
	public String getReal_name_show() {
		if (real_name == null || real_name.trim().equals("")) {
			return "";                                  //没填就是空，页面直接不显示
		}
		if (is_name_public == 1) {
			return real_name;                           //公开 → 原样显示
		}
		return maskName(real_name);                     //不公开 → 打码
	}

	//2.邮箱的展示值
	public String getEmail_show() {
		if (email == null || email.trim().equals("")) {
			return "";
		}
		if (is_email_public == 1) {
			return email;
		}
		return maskEmail(email);
	}

	//3.电话的展示值
	public String getPhone_show() {
		if (phone == null || phone.trim().equals("")) {
			return "";
		}
		if (is_phone_public == 1) {
			return phone;
		}
		return maskPhone(phone);
	}

	//工具：姓名打码，保留第一个字，后面的字变成 *
	private String maskName(String name) {
		if (name.length() <= 1) {
			return name;
		}
		StringBuffer sb = new StringBuffer();
		sb.append(name.charAt(0));                      //第一个字保留
		for (int i = 1; i < name.length(); i++) {
			sb.append("*");                             //后面的都变成 *
		}
		return sb.toString();
	}

	//工具：邮箱打码，@ 前面保留前 3 位（不足 3 位保留 1 位），后面接 ***
	private String maskEmail(String mail) {
		int at = mail.indexOf("@");                     //找到 @ 的位置
		if (at <= 0) {
			return "***";                               //格式不对，全部打码
		}
		String name = mail.substring(0, at);            //@ 前面的部分
		String domain = mail.substring(at);             //@ 后面的部分（含 @）
		String head;
		if (name.length() <= 1) {
			head = name;
		} else if (name.length() <= 3) {
			head = name.substring(0, 1);
		} else {
			head = name.substring(0, 3);
		}
		return head + "***" + domain;
	}

	//工具：电话打码，11 位手机号显示成 138****1111
	private String maskPhone(String tel) {
		if (tel.length() < 7) {
			return "****";
		}
		return tel.substring(0, 3) + "****" + tel.substring(tel.length() - 4);
	}

	public String getContent() {
		return content;
	}

	public void setContent(String content) {
		this.content = content;
	}

	public int getStatus() {
		return status;
	}

	public void setStatus(int status) {
		this.status = status;
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

	public String getAvatar() {
		return avatar;
	}

	public void setAvatar(String avatar) {
		this.avatar = avatar;
	}

	public int getLike_count() {
		return like_count;
	}

	public void setLike_count(int likeCount) {
		like_count = likeCount;
	}

	public int getComment_count() {
		return comment_count;
	}

	public void setComment_count(int commentCount) {
		comment_count = commentCount;
	}

	public boolean isLiked() {
		return liked;
	}

	public void setLiked(boolean liked) {
		this.liked = liked;
	}

	public List<CommentDomain> getComments() {
		return comments;
	}

	public void setComments(List<CommentDomain> comments) {
		this.comments = comments;
	}
}
