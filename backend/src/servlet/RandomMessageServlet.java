package servlet;

import java.io.IOException;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;

import domain.MessageDomain;
import domain.UserDomain;
import service.MessageService;
import util.JsonUtil;

/**
 * ============================================================
 *  RandomMessageServlet —— 盲盒留言 / 漂流瓶
 * ------------------------------------------------------------
 *  作用：页面上点“抽取今日盲盒”时，前端用 Ajax 请求这个 Servlet，
 *        它从数据库里随机抽一条【别人的】留言，并以 JSON 返回。
 *
 *  为什么返回 JSON 而不是直接跳页面？
 *  因为弹窗（Modal）只是页面上的一个浮层，不需要换页，
 *  这样体验才像“开盲盒”，而不是“跳走再回来”。
 *
 *  前端拿到的 JSON 长这样：
 *  {"success":true,"id":3,"nickname":"快乐的小狗","avatar":"av2",
 *   "content":"今天也要加油鸭","time":"2026-11-19 16:20",
 *   "like_count":2,"liked":false,"comment_count":1}
 *
 *  一条都没有时返回：
 *  {"success":false,"message":"留言板还没有别人的留言..."}
 * ============================================================
 */
public class RandomMessageServlet extends HttpServlet {

	//doGet 和 doPost 都走同一个方法，前端用 GET 或 POST 都能请求
	public void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		doPost(request, response);
	}

	public void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		//1.中文乱码处理（返回的 JSON 里有中文昵称、中文留言，必须设置 UTF-8）
		request.setCharacterEncoding("UTF-8");
		response.setCharacterEncoding("UTF-8");
		//2.告诉浏览器：我返回的是一段 JSON，不是网页。前端就可以直接 JSON.parse
		response.setContentType("application/json;charset=UTF-8");

		//3.拿 session，判断有没有登录（没登录就抽盲盒，就没有“排除自己”的依据了）
		HttpSession session = request.getSession();
		UserDomain loginUser = (UserDomain) session.getAttribute("loginUser");

		//4.准备输出流（只创建一次，最后统一 flush）
		PrintWriter out = response.getWriter();

		if (loginUser == null) {
			//没登录：返回一个 success=false 的 JSON，前端弹窗提示去登录
			out.print("{\"success\":false,\"message\":\"请先登录再抽盲盒哦～\"}");
			out.flush();
			return;                                   //方法结束，不再往下走
		}

		//5.调用 service 随机查一条留言（把自己 id 传进去，SQL 里会排除自己发的）
		MessageService ms = new MessageService();
		MessageDomain m = ms.queryRandom(loginUser.getId());

		//6.如果一条都没抽到（比如留言板里只有自己的留言），返回友好提示
		if (m == null) {
			out.print("{\"success\":false,\"message\":\"还没有别人的留言，先去邀请朋友来玩吧～\"}");
			out.flush();
			return;
		}

		//7.把时间格式化成 2026-11-19 16:20 这种好看的样子
		//   （create_time 理论上不会为空，但为防万一还是判一下）
		String time = "";
		if (m.getCreate_time() != null) {
			SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd HH:mm");
			time = fmt.format(m.getCreate_time());
		}

		//8.手动拼 JSON。注意所有字符串都要用 JsonUtil.esc() 转义，
		//  否则留言里出现英文双引号会把 JSON 拼坏，前端解析就失败了
		StringBuffer json = new StringBuffer();
		json.append("{");
		json.append("\"success\":true");                                       //是否成功
		json.append(",\"id\":").append(m.getId());                             //留言 id（点赞、回复要用）
		json.append(",\"nickname\":\"").append(JsonUtil.esc(m.getNickname())).append("\"");
		json.append(",\"avatar\":\"").append(JsonUtil.esc(m.getAvatar())).append("\"");
		json.append(",\"content\":\"").append(JsonUtil.esc(m.getContent())).append("\"");
		json.append(",\"time\":\"").append(JsonUtil.esc(time)).append("\"");
		json.append(",\"like_count\":").append(m.getLike_count());             //当前赞数
		json.append(",\"liked\":").append(JsonUtil.bool(m.isLiked()));         //我点过没有
		json.append(",\"comment_count\":").append(m.getComment_count());       //评论数
		json.append("}");

		//9.输出给前端
		out.print(json.toString());
		out.flush();
	}

	public void init() throws ServletException {
	}
}
