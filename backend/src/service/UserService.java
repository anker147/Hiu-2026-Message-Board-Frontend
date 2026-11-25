package service;

import java.util.Random;

import dao.UserDao;
import domain.UserDomain;

//用户业务层：servlet 只跟 service 打交道，service 再去调 dao（和你原来的 ProjectService 一模一样）
public class UserService {
	//创建 dao 对象
	UserDao dao = new UserDao();

	//1.注册
	//返回 true 表示注册成功；返回 false 表示账号已被占用（servlet 根据返回值提示用户）
	public boolean register(UserDomain user) {
		//先判断账号有没有被注册过
		if (dao.existsAccount(user.getAccount())) {
			return false;                     //账号已存在，注册失败
		}
		//如果页面没传默认ID（为空），这里自动生成一个 8 位的十六进制 ID，例如 0456e3e1
		//（页面上 JS 也会生成一个显示给用户看，以页面传上来的为准；但格式不对就由后台重新生成，保证入库格式统一）
		String no = user.getUser_no();
		if (no == null || !no.trim().matches("^[0-9a-f]{8}$")) {
			user.setUser_no(createUserNo());
		}
		//如果没选头像，给一个默认头像
		if (user.getAvatar() == null || user.getAvatar().trim().equals("")) {
			user.setAvatar("av1");
		}
		//网名：注册时如果没带，就随机生成一个“快乐的小狗”这种，存进数据库
		if (user.getNickname() == null || user.getNickname().trim().equals("")) {
			user.setNickname(createNickname());
		}
		dao.addUser(user);                    //真正插入数据库
		return true;
	}

	//2.登录：账号密码都对就返回用户对象，否则返回 null
	public UserDomain login(String account, String password) {
		return dao.login(account, password);
	}

	//3.根据 id 查用户（改头像后刷新 session 里的用户信息要用）
	public UserDomain queryById(int id) {
		return dao.queryById(id);
	}

	//4.修改头像
	public void updateAvatar(int id, String avatar) {
		dao.updateAvatar(id, avatar);
	}

	//4.1 修改网名（用户在留言表单里把昵称改了，就同步到账号上，
	//    这样他的留言和评论显示的名字永远一致）
	public void updateNickname(int id, String nickname) {
		dao.updateNickname(id, nickname);
	}

	//5.生成默认ID：随机 8 位小写字母 + 数字，形如 0456e3e1
	//   用 Random 拼字符，不需要额外的工具包，小白也能看懂
	public String createUserNo() {
		String chars = "0123456789abcdef";    //每一位的候选字符
		Random random = new Random();         //随机数对象
		StringBuffer sb = new StringBuffer(); //用来拼字符串（和 String 相比更省内存）
		for (int i = 0; i < 8; i++) {         //循环 8 次，生成 8 位
			int index = random.nextInt(chars.length()); //0~15 之间随机取一个下标
			sb.append(chars.charAt(index));            //把下标对应的字符拼上去
		}
		return sb.toString();
	}

	//6.随机生成网名：形容词 + 动物，例如“快乐的小狗”“粉红的猪猪”
	//   两个数组各随机取一个拼起来，8 × 10 = 80 种组合，够用了
	public String createNickname() {
		String[] prefix = {"快乐的", "粉红的", "软糯的", "元气的", "爱笑的",
				"睡不醒的", "爱吃糖的", "慢半拍的"};
		String[] animal = {"小狗", "猫咪", "兔子", "猪猪", "小鹿",
				"狐狸", "企鹅", "小熊", "小仓鼠", "小海豹"};
		Random random = new Random();
		//nextInt(数组长度) 保证下标不越界
		return prefix[random.nextInt(prefix.length)] + animal[random.nextInt(animal.length)];
	}
}
