package db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * 数据库连接工具类
 * 只做一件事：帮你拿到一个 Connection（连接）对象，并且提供统一的关闭方法。
 *
 * 这里的配置必须和你本机的 MySQL 对上：
 *   端口 : 3307
 *   数据库: project
 *   账号 : root
 *   密码 : 123456
 * 如果哪天 MySQL 的配置变了，只需要改下面这 3 个常量，其它地方一行都不用动。
 */
public class DatabaseConn {

	/** 数据库地址。useUnicode + characterEncoding 是告诉 MySQL 用 UTF-8 存取中文，防止乱码 */
	public static final String URL =
			"jdbc:mysql://localhost:3307/project?useUnicode=true&characterEncoding=UTF-8";

	/** 数据库登录账号 */
	public static final String USERNAME = "root";

	/** 数据库登录密码 */
	public static final String PASSWORD = "123456";

	/** 老代码里习惯用 DatabaseConn.close() 关闭资源，这里保留这几个成员变量给它用 */
	private static Connection con = null;
	private static PreparedStatement pstmt = null;
	private static ResultSet rs = null;

	/** 无参的构造方法（工具类，其实用不到 new，保留是为了不改动老代码） */
	public DatabaseConn() {
		super();
	}

	/**
	 * 对外提供一个公用的、拿到数据库连接对象的方法。
	 *
	 * 注意：这里每次调用都会新建一个连接，而不是复用同一个。
	 * 因为网站是"多人同时访问"的，如果大家共用一个连接，A 用完关掉，
	 * 正在用的 B 就会突然报“连接已关闭”。所以每个方法各开各的、各关各的，最安全。
	 *
	 * @return 已经连上数据库的 Connection 对象
	 * @throws RuntimeException 连不上时抛出，并把原因写清楚（比之前的空指针好排查得多）
	 */
	public static Connection getConnection() {

		Connection conn = null;

		try {
			// 1.加载 MySQL 驱动（mysql-connector-java-5.0.8-bin.jar 里的类）
			Class.forName("com.mysql.jdbc.Driver");

			// 2.真正去连数据库
			conn = DriverManager.getConnection(URL, USERNAME, PASSWORD);

		} catch (ClassNotFoundException e) {
			// 驱动类都找不到：说明 WEB-INF/lib 里缺 mysql 的 jar 包
			throw new RuntimeException(
					"找不到数据库驱动 com.mysql.jdbc.Driver，请检查 WEB-INF/lib 下是否有 mysql-connector-java 的 jar 包", e);

		} catch (SQLException e) {
			// 连不上：把可能的原因一次性列出来，照着查就行
			throw new RuntimeException(
					"数据库连接失败！请依次检查：\n"
					+ "  1) MySQL 服务是否已启动（任务管理器里能看到 mysqld.exe）\n"
					+ "  2) 端口是否为 3307（当前配置：" + URL + "）\n"
					+ "  3) 是否已经建好 project 库，并执行过 sql/messageboard.sql\n"
					+ "  4) 账号密码是否为 root / 123456", e);
		}

		// 3.顺手记一下"最后一次创建的连接"，兼容老代码里的 DatabaseConn.close() 写法
		con = conn;

		return conn;
	}

	/**
	 * 老的关闭方法：关掉上面记录的那几个静态对象。
	 * 新写的 DAO 都是自己声明局部变量、自己 close，不依赖这个方法；
	 * 保留它是为了让原来的 ProjectDao 等老代码不用改。
	 */
	public static void close() {
		try {
			if (rs != null) {
				rs.close();
				rs = null;
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			if (pstmt != null) {
				pstmt.close();
				pstmt = null;
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
		try {
			if (con != null) {
				con.close();
				con = null;
			}
		} catch (SQLException e) {
			e.printStackTrace();
		}
	}
}
