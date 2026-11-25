package util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ============================================================
 *  Json —— 极简 JSON 解析器（零依赖）
 * ------------------------------------------------------------
 *  为什么需要它？
 *  前端 fetch 适配层可能用 JSON 格式的请求体（Content-Type: application/json），
 *  而 Servlet 2.5 的 request.getParameter() 只认表单格式（urlencoded），
 *  读不到 JSON 体里的字段。所以这里手写一个能解析
 *  对象 / 数组 / 字符串 / 数字 / 布尔 / null 的小解析器。
 *
 *  用法： Object o = Json.parse("{\"a\":1}");
 *        Map m = (Map) o;  m.get("a") → Integer 1
 *  解析失败返回 null（调用方按参数错误 9001 处理）。
 * ============================================================
 */
public class Json {

	/**
	 * 解析一段 JSON 文本。
	 *
	 * @param text JSON 字符串，允许为 null
	 * @return 解析结果：Map（对象）/ List（数组）/ String / Long / Double / Boolean / null
	 */
	public static Object parse(String text) {
		if (text == null) {
			return null;
		}
		try {
			Parser p = new Parser(text);
			p.skipWs();
			Object v = p.parseValue();
			p.skipWs();
			if (p.i < p.s.length()) {
				return null;   // 结尾还有多余的字符，说明不是合法 JSON
			}
			return v;
		} catch (Exception e) {
			return null;      // 任何异常都当作“不是合法 JSON”
		}
	}

	/** 把对象转成“字符串值”（给 ApiReq 取参数用）：null→null，其它→String.valueOf */
	public static String asString(Object v) {
		if (v == null) {
			return null;
		}
		if (v instanceof String) {
			return (String) v;
		}
		return String.valueOf(v);
	}

	/** 内部：递归下降解析器 */
	private static class Parser {
		String s;
		int i;

		Parser(String s) {
			this.s = s;
			this.i = 0;
		}

		void skipWs() {
			while (i < s.length()) {
				char c = s.charAt(i);
				if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
					i++;
				} else {
					break;
				}
			}
		}

		Object parseValue() {
			skipWs();
			if (i >= s.length()) {
				throw new RuntimeException("empty");
			}
			char c = s.charAt(i);
			if (c == '{') {
				return parseObj();
			}
			if (c == '[') {
				return parseArr();
			}
			if (c == '"') {
				return parseStr();
			}
			if (s.startsWith("true", i)) {
				i += 4;
				return Boolean.TRUE;
			}
			if (s.startsWith("false", i)) {
				i += 5;
				return Boolean.FALSE;
			}
			if (s.startsWith("null", i)) {
				i += 4;
				return null;
			}
			return parseNum();
		}

		/** 解析 { "a":1, "b":"x" } */
		Map<String, Object> parseObj() {
			Map<String, Object> map = new LinkedHashMap<String, Object>();
			i++;                          // 跳过 {
			skipWs();
			if (i < s.length() && s.charAt(i) == '}') {
				i++;                      // 空对象 {}
				return map;
			}
			while (true) {
				skipWs();
				String key = parseStr();  // 键一定是字符串
				skipWs();
				if (s.charAt(i) != ':') {
					throw new RuntimeException("expect :");
				}
				i++;                      // 跳过 :
				Object v = parseValue();
				map.put(key, v);
				skipWs();
				char c = s.charAt(i);
				if (c == ',') {
					i++;
					continue;
				}
				if (c == '}') {
					i++;
					return map;
				}
				throw new RuntimeException("expect , or }");
			}
		}

		/** 解析 [ 1, "a", true ] */
		List<Object> parseArr() {
			List<Object> list = new ArrayList<Object>();
			i++;                          // 跳过 [
			skipWs();
			if (i < s.length() && s.charAt(i) == ']') {
				i++;                      // 空数组 []
				return list;
			}
			while (true) {
				list.add(parseValue());
				skipWs();
				char c = s.charAt(i);
				if (c == ',') {
					i++;
					continue;
				}
				if (c == ']') {
					i++;
					return list;
				}
				throw new RuntimeException("expect , or ]");
			}
		}

		/** 解析字符串（含 \\n \\t \\" \\\\ \\/ \\uXXXX 六种转义） */
		String parseStr() {
			if (s.charAt(i) != '"') {
				throw new RuntimeException("expect string");
			}
			i++;
			StringBuffer sb = new StringBuffer();
			while (true) {
				char c = s.charAt(i);
				if (c == '"') {
					i++;
					return sb.toString();
				}
				if (c == '\\') {
					i++;
					char e = s.charAt(i);
					switch (e) {
						case '"':  sb.append('"');  break;
						case '\\': sb.append('\\'); break;
						case '/':  sb.append('/');  break;
						case 'n':  sb.append('\n'); break;
						case 't':  sb.append('\t'); break;
						case 'r':  sb.append('\r'); break;
						case 'b':  sb.append('\b'); break;
						case 'f':  sb.append('\f'); break;
						case 'u':  // Unicode 转义，例如 \u4e2d
							sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
							i += 4;
							break;
						default:
							throw new RuntimeException("bad escape");
					}
					i++;
				} else {
					sb.append(c);
					i++;
				}
			}
		}

		/** 解析数字：带 . 或 e 的按 Double，纯整数按 Long */
		Object parseNum() {
			int start = i;
			while (i < s.length()) {
				char c = s.charAt(i);
				if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
					i++;
				} else {
					break;
				}
			}
			String num = s.substring(start, i);
			if (num.indexOf('.') < 0 && num.indexOf('e') < 0 && num.indexOf('E') < 0) {
				return Long.valueOf(Long.parseLong(num));
			}
			return Double.valueOf(Double.parseDouble(num));
		}
	}
}
