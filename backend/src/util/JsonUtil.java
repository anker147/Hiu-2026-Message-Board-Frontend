package util;

/**
 * ============================================================
 *  JsonUtil —— 手写 JSON 工具类（零依赖，不需要任何 jar 包）
 * ------------------------------------------------------------
 *  为什么要有这个类？
 *  1. 本项目用的是老版本 Tomcat 6 + JDK 1.7，如果为了返回 JSON 再引入
 *     fastjson/gson，要多放一个 jar 包，还容易版本冲突；
 *  2. 其实我们只需要返回很简单的 JSON（比如 {"success":true,"count":5}），
 *     手动拼字符串完全够用；
 *  3. 但手动拼字符串有个坑：如果留言内容里本身带英文双引号 " 或者换行，
 *     直接拼进去会把 JSON 结构弄坏，前端 JSON.parse 就会报错。
 *     所以必须有下面这个 esc() 方法先把特殊字符转义掉。
 * ============================================================
 */
public class JsonUtil {

	/**
	 * 把一段普通字符串转义成“可以安全放进 JSON 双引号里”的字符串。
	 *
	 * 举例： 他说"你好"  →  他说\"你好\"
	 *        第一行\n第二行 →  第一行\n第二行（这里的 \n 是两个字符：反斜杠 + n）
	 *
	 * @param s 原始字符串，允许为 null
	 * @return 转义之后的字符串，永远不会返回 null（null 会变成空串）
	 */
	public static String esc(String s) {
		//1.传进来 null 就直接返回空串，避免后面出现 NullPointerException
		if (s == null) {
			return "";
		}

		//2.准备一个 StringBuffer 一点点往里拼（比用 String 做 + 拼接更省内存）
		StringBuffer sb = new StringBuffer();

		//3.一个字符一个字符地检查
		for (int i = 0; i < s.length(); i++) {
			char c = s.charAt(i);      //取出第 i 个字符
			switch (c) {
				case '"':               //英文双引号：JSON 里必须写成 \"
					sb.append("\\\"");
					break;
				case '\\':              //反斜杠本身：必须写成 \\
					sb.append("\\\\");
					break;
				case '\n':              //换行：写成 \n，否则 JSON 会认为是语法错误
					sb.append("\\n");
					break;
				case '\r':              //回车：写成 \r
					sb.append("\\r");
					break;
				case '\t':              //制表符：写成 \t
					sb.append("\\t");
					break;
				case '/':               //斜杠：写成 \/，防止内容里出现 </script> 把页面标签提前闭合
					sb.append("\\/");
					break;
				default:
					//4.控制字符（ASCII 码小于 32 的，比如 \b \f）统一写成 Unicode 转义形式
					if (c < 0x20) {
						sb.append(String.format("\\u%04x", Integer.valueOf(c)));
					} else {
						//5.普通字符（包括中文）原样输出，浏览器会自动按 UTF-8 解析
						sb.append(c);
					}
			}
		}

		//6.返回拼好的结果
		return sb.toString();
	}

	/**
	 * 小工具：把一个 int 转成 JSON 里的数字（其实直接拼也行，
	 * 单独写个方法是为了让 Servlet 里的代码更好读）
	 */
	public static String num(int value) {
		return String.valueOf(value);
	}

	/**
	 * 小工具：把 boolean 转成 JSON 里的 true / false
	 */
	public static String bool(boolean value) {
		return value ? "true" : "false";
	}
}
