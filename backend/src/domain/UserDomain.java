package domain;

import java.util.Date;

//用户实体类（对应数据库 mb_user 表）
//作用：把 mb_user 表里的一行数据，变成一个 Java 对象，方便在 dao / servlet / jsp 之间传递
//写法和你的 ProjectDomain 完全一样：属性 + 无参构造 + getter/setter
public class UserDomain {
	//1.属性（每一个属性都对应 mb_user 表里的一个字段）
	private int id;             //主键，数据库自增
	private String account;     //登录账号（唯一）
	private String email;       //邮箱
	private String password;    //密码（教学项目，明文保存，不做加密）
	private String avatar;      //头像编号，例如 av1 / av2 ... av8，页面根据编号显示不同头像
	private String user_no;     //默认ID，例如 0456e3e1，注册时随机生成
	private String nickname;    //随机网名，例如“快乐的小狗”，注册时生成，用户可以改
	private Date create_time;   //注册时间

	//2.无参构造方法：dao 里查询出一行数据后，先 new 一个空对象，再一个个 set 进去
	public UserDomain() {
		super();
	}

	//3.有参构造方法：写起来方便，需要时可以用
	public UserDomain(String account, String email, String password, String avatar, String user_no) {
		super();
		this.account = account;
		this.email = email;
		this.password = password;
		this.avatar = avatar;
		this.user_no = user_no;
	}

	//4.getter / setter 方法
	//注意：getCreate_time() 这种写法，在 JSP 的 EL 表达式里对应的属性名就是 create_time
	//例如 ${loginUser.user_no} 会自动调用 getUser_no() 方法
	public int getId() {
		return id;
	}

	public void setId(int id) {
		this.id = id;
	}

	public String getAccount() {
		return account;
	}

	public void setAccount(String account) {
		this.account = account;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public String getAvatar() {
		return avatar;
	}

	public void setAvatar(String avatar) {
		this.avatar = avatar;
	}

	public String getUser_no() {
		return user_no;
	}

	public void setUser_no(String userNo) {
		user_no = userNo;
	}

	//网名：留言列表、评论区显示的都是它，而不是手机号
	public String getNickname() {
		return nickname;
	}

	public void setNickname(String nickname) {
		this.nickname = nickname;
	}

	public Date getCreate_time() {
		return create_time;
	}

	public void setCreate_time(Date createTime) {
		create_time = createTime;
	}
}
