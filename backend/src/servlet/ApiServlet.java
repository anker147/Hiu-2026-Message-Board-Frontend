package servlet;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import api.ApiAuth;
import api.ApiContent;
import api.ApiProfile;
import api.ApiSocial;
import util.ApiErr;
import util.ApiReq;
import util.ApiResp;

/**
 * ============================================================
 *  ApiServlet —— /api/* 的统一入口（REST 路由分发器）
 * ------------------------------------------------------------
 *  为什么用“一个 Servlet + 路径分发”而不是十几个 Servlet？
 *  1. 项目是 Servlet 2.5（web.xml），每个接口都要写 <servlet>+
 *     <servlet-mapping> 两段，太啰嗦；
 *  2. REST 风格路径 /api/messages/{id} 里带变量，老规范不支持
 *     通配符映射，在分发器里手动解析 pathInfo 反而最清楚；
 *  3. 统一异常处理：所有业务方法 throw ApiErr(code)，在这里
 *     catch 一次就够，保证 401/4001/5002…… 都按统一响应包返回。
 *
 *  路由表（方法 + pathInfo 片段）：
 *  POST   /api/register                  → ApiAuth.register
 *  POST   /api/login                     → ApiAuth.login
 *  POST   /api/logout                    → ApiAuth.logout
 *  GET    /api/session                   → ApiAuth.session
 *  GET    /api/messages                  → ApiContent.getMessages
 *  POST   /api/messages                  → ApiContent.postMessage
 *  GET    /api/messages/{rid}            → ApiContent.getMessage
 *  GET    /api/messages/{rid}/comments   → ApiContent.getComments
 *  POST   /api/messages/{rid}/comments   → ApiContent.postComment
 *  POST   /api/replies                   → ApiContent.postReply
 *  PUT    /api/content/{rid}             → ApiContent.updateContent
 *  DELETE /api/content/{rid}             → ApiContent.deleteContent
 *  GET    /api/blindbox                  → ApiContent.getBlindbox
 *  POST   /api/blindbox/reply            → ApiContent.blindboxReply
 *  POST   /api/like                      → ApiSocial.like
 *  POST   /api/favorite                  → ApiSocial.favorite
 *  GET    /api/profile                   → ApiProfile.getProfile
 *  POST   /api/profile/privacy           → ApiProfile.updatePrivacy
 *  POST   /api/profile/nickname          → ApiProfile.updateNickname
 *  POST   /api/profile/sensitive         → ApiProfile.updateSensitive
 *  GET    /api/zone                      → ApiProfile.getZone
 * ============================================================
 */
public class ApiServlet extends HttpServlet {

	private static final long serialVersionUID = 1L;

	/** GET 请求统一入口 */
	protected void doGet(HttpServletRequest req, HttpServletResponse resp)
			throws ServletException, IOException {
		setCharset(req, resp);
		ApiReq q = new ApiReq(req);
		String[] seg = pathOf(req);
		try {
			// 1./api/session —— 查询登录状态
			if (seg.length == 1 && "session".equals(seg[0])) {
				ApiResp.ok(resp, ApiAuth.session(q));
				return;
			}
			// 2./api/messages —— 列表
			if (seg.length == 1 && "messages".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.getMessages(q));
				return;
			}
			// 3./api/messages/{rid} —— 详情
			if (seg.length == 2 && "messages".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.getMessage(seg[1], q));
				return;
			}
			// 4./api/messages/{rid}/comments —— 评论树
			if (seg.length == 3 && "messages".equals(seg[0]) && "comments".equals(seg[2])) {
				ApiResp.ok(resp, ApiContent.getComments(seg[1], q));
				return;
			}
			// 5./api/blindbox —— 随机捞留言
			if (seg.length == 1 && "blindbox".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.getBlindbox(q));
				return;
			}
			// 6./api/profile —— 本人完整资料
			if (seg.length == 1 && "profile".equals(seg[0])) {
				ApiResp.ok(resp, ApiProfile.getProfile(q));
				return;
			}
			// 7./api/zone?displayId=xxxx —— 个人主页
			if (seg.length == 1 && "zone".equals(seg[0])) {
				ApiResp.ok(resp, ApiProfile.getZone(q));
				return;
			}
			// 没匹配上：参数错误
			ApiResp.failCode(resp, ApiResp.PARAM_BAD);
		} catch (ApiErr e) {
			// 业务异常：按错误码回统一响应包
			ApiResp.fail(resp, e.getCode(), e.getMessage());
		} catch (Exception e) {
			// 没料到的异常：9003 服务异常（别把堆栈细节暴露给前端）
			e.printStackTrace();
			ApiResp.failCode(resp, ApiResp.SERVER_ERROR);
		}
	}

	/** POST 请求统一入口 */
	protected void doPost(HttpServletRequest req, HttpServletResponse resp)
			throws ServletException, IOException {
		setCharset(req, resp);
		ApiReq q = new ApiReq(req);
		String[] seg = pathOf(req);
		try {
			// 1.注册 / 登录 / 退出
			if (seg.length == 1 && "register".equals(seg[0])) {
				ApiResp.ok(resp, ApiAuth.register(q));
				return;
			}
			if (seg.length == 1 && "login".equals(seg[0])) {
				ApiResp.ok(resp, ApiAuth.login(q));
				return;
			}
			if (seg.length == 1 && "logout".equals(seg[0])) {
				ApiResp.ok(resp, ApiAuth.logout(q));
				return;
			}
			// 2.发布留言
			if (seg.length == 1 && "messages".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.postMessage(q));
				return;
			}
			// 3.发一级评论：/api/messages/{rid}/comments
			if (seg.length == 3 && "messages".equals(seg[0]) && "comments".equals(seg[2])) {
				ApiResp.ok(resp, ApiContent.postComment(q, seg[1], null));
				return;
			}
			// 4.发二级回复：/api/replies
			if (seg.length == 1 && "replies".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.postReply(q));
				return;
			}
			// 5.点赞 / 收藏
			if (seg.length == 1 && "like".equals(seg[0])) {
				ApiResp.ok(resp, ApiSocial.like(q));
				return;
			}
			if (seg.length == 1 && "favorite".equals(seg[0])) {
				ApiResp.ok(resp, ApiSocial.favorite(q));
				return;
			}
			// 6.盲盒匿名回复
			if (seg.length == 2 && "blindbox".equals(seg[0]) && "reply".equals(seg[1])) {
				ApiResp.ok(resp, ApiContent.blindboxReply(q));
				return;
			}
			// 7.个人中心三个写接口（POST，同时兼容 PUT）
			if (seg.length == 2 && "profile".equals(seg[0])) {
				if ("privacy".equals(seg[1])) {
					ApiResp.ok(resp, ApiProfile.updatePrivacy(q));
					return;
				}
				if ("nickname".equals(seg[1])) {
					ApiResp.ok(resp, ApiProfile.updateNickname(q));
					return;
				}
				if ("sensitive".equals(seg[1])) {
					ApiResp.ok(resp, ApiProfile.updateSensitive(q));
					return;
				}
			}
			ApiResp.failCode(resp, ApiResp.PARAM_BAD);
		} catch (ApiErr e) {
			ApiResp.fail(resp, e.getCode(), e.getMessage());
		} catch (Exception e) {
			e.printStackTrace();
			ApiResp.failCode(resp, ApiResp.SERVER_ERROR);
		}
	}

	/** PUT：编辑留言/评论（POST 同路径也接受，方便前端适配层选择） */
	protected void doPut(HttpServletRequest req, HttpServletResponse resp)
			throws ServletException, IOException {
		setCharset(req, resp);
		ApiReq q = new ApiReq(req);
		String[] seg = pathOf(req);
		try {
			if (seg.length == 2 && "content".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.updateContent(seg[1], q));
				return;
			}
			// 个人中心三个写接口也接受 PUT
			if (seg.length == 2 && "profile".equals(seg[0])) {
				if ("privacy".equals(seg[1])) {
					ApiResp.ok(resp, ApiProfile.updatePrivacy(q));
					return;
				}
				if ("nickname".equals(seg[1])) {
					ApiResp.ok(resp, ApiProfile.updateNickname(q));
					return;
				}
				if ("sensitive".equals(seg[1])) {
					ApiResp.ok(resp, ApiProfile.updateSensitive(q));
					return;
				}
			}
			ApiResp.failCode(resp, ApiResp.PARAM_BAD);
		} catch (ApiErr e) {
			ApiResp.fail(resp, e.getCode(), e.getMessage());
		} catch (Exception e) {
			e.printStackTrace();
			ApiResp.failCode(resp, ApiResp.SERVER_ERROR);
		}
	}

	/** DELETE：删除留言/评论 */
	protected void doDelete(HttpServletRequest req, HttpServletResponse resp)
			throws ServletException, IOException {
		setCharset(req, resp);
		ApiReq q = new ApiReq(req);
		String[] seg = pathOf(req);
		try {
			if (seg.length == 2 && "content".equals(seg[0])) {
				ApiResp.ok(resp, ApiContent.deleteContent(seg[1], q));
				return;
			}
			ApiResp.failCode(resp, ApiResp.PARAM_BAD);
		} catch (ApiErr e) {
			ApiResp.fail(resp, e.getCode(), e.getMessage());
		} catch (Exception e) {
			e.printStackTrace();
			ApiResp.failCode(resp, ApiResp.SERVER_ERROR);
		}
	}

	/** OPTIONS 请求由 CorsFilter 短路处理；这里只兜底返回 200 */
	protected void doOptions(HttpServletRequest req, HttpServletResponse resp)
			throws ServletException, IOException {
		resp.setStatus(200);
	}

	/**
	 * 统一编码：请求按 UTF-8 读（POST 中文参数），响应由 ApiResp 设置。
	 * 注意必须先调 setCharacterEncoding 再 getParameter，顺序反了没用。
	 */
	private void setCharset(HttpServletRequest req, HttpServletResponse resp) {
		try {
			req.setCharacterEncoding("UTF-8");
		} catch (Exception e) {
			// 忽略，老容器对已提交的编码修改会抛异常
		}
		resp.setCharacterEncoding("UTF-8");
	}

	/**
	 * 解析 pathInfo 成片段数组。
	 * /api/messages/m-001/comments → ["messages","m-001","comments"]
	 */
	private String[] pathOf(HttpServletRequest req) {
		String p = req.getPathInfo(); // 不含 /api 前缀
		if (p == null || p.equals("/") || p.length() == 0) {
			return new String[0];
		}
		// 去掉首尾斜杠再按 / 切
		if (p.startsWith("/")) {
			p = p.substring(1);
		}
		if (p.endsWith("/")) {
			p = p.substring(0, p.length() - 1);
		}
		return p.split("/");
	}
}
