package api;

import java.util.Map;

import util.ApiErr;
import util.ApiReq;
import util.ApiResp;
import util.Sec;
import util.TokenAuth;
import dao.ApiCommentDao;
import dao.ApiMessageDao;

/**
 * ============================================================
 *  ApiSocial —— 点赞 / 收藏（API-10 + 收藏扩展，F8 四态状态机）
 * ------------------------------------------------------------
 *  like     POST /api/like      {targetId, op, idemKey, csrf}
 *  favorite POST /api/favorite  {targetId, op, idemKey, csrf}
 *
 *  四态状态机（与前端 mock 语义完全一致）：
 *  1. 传 op=like   且未赞 → 点赞入库，计数 +1；
 *  2. 传 op=unlike 且已赞 → 删赞记录，计数 -1；
 *  3. 其余组合     → 状态保持，原样返回当前值（幂等）；
 *  4. 幂等键重复   → 直接返回当前状态，绝不出现 +2/-1 抖动。
 *
 *  返回：点赞 {liked:bool, count:int} / 收藏 {favorite:bool, count:int}
 * ============================================================
 */
public class ApiSocial {

	/** 点赞入口 */
	public static String like(ApiReq q) {
		return toggle(q, true);
	}

	/** 收藏入口 */
	public static String favorite(ApiReq q) {
		return toggle(q, false);
	}

	/**
	 * 点赞 / 收藏共用逻辑。
	 *
	 * @param isLike true = 点赞；false = 收藏
	 */
	private static String toggle(ApiReq q, boolean isLike) {
		// 1.鉴权：未登录 → 401，计数不变；csrf 错 → 9002
		TokenAuth.Session s = TokenAuth.authWrite(q);
		String targetId = q.pTrim("targetId");
		if (targetId == null || targetId.length() == 0) {
			throw new ApiErr(ApiResp.PARAM_BAD);
		}
		ApiMessageDao dao = new ApiMessageDao();
		ApiCommentDao cdao = new ApiCommentDao();
		// 2.定位目标：先查留言再查评论（两张表共用同一套点赞记录）
		Map m = dao.find(targetId);
		Map c = m == null ? cdao.find(targetId) : null;
		if (m == null && c == null) {
			throw new ApiErr(ApiResp.NOT_FOUND); // 5001 目标不存在
		}
		// 3.幂等键：重复请求直接返回当前状态（防连点造成抖动）
		String idemKey = q.pTrim("idemKey");
		if (!dao.claimIdemKey(idemKey, s.userId)) {
			// 这个键之前已经成功处理过 → 什么都不改，返回当前值
			return currentJson(isLike, m != null ? m : c, s, dao, cdao);
		}
		// 4.当前状态 + 本次操作
		boolean marked = isLike ? dao.hasLike(s.userId, targetId)
				: dao.hasFavorite(s.userId, targetId);
		String op = q.pTrim("op");
		if (op == null || op.length() == 0) {
			// 没传 op 时按“切换”处理：已赞就取消，没赞就点赞
			op = marked ? (isLike ? "unlike" : "unfavorite")
					: (isLike ? "like" : "favorite");
		}
		boolean wantOn = isLike ? "like".equals(op) : "favorite".equals(op);
		if (wantOn && !marked) {
			// 点赞 / 收藏入库（主键约束保证不会插重）
			if (isLike) {
				dao.addLike(s.userId, targetId, m != null ? "message" : "comment");
			} else {
				dao.addFavorite(s.userId, targetId, m != null ? "message" : "comment");
			}
			if (m != null) {
				if (isLike) {
					dao.deltaLikes(targetId, 1);
				} else {
					dao.deltaFavorites(targetId, 1);
				}
			} else {
				if (isLike) {
					cdao.deltaLikes(targetId, 1);
				} else {
					cdao.deltaFavorites(targetId, 1);
				}
			}
		} else if (!wantOn && marked) {
			// 取消点赞 / 取消收藏
			if (isLike) {
				dao.removeLike(s.userId, targetId);
			} else {
				dao.removeFavorite(s.userId, targetId);
			}
			if (m != null) {
				if (isLike) {
					dao.deltaLikes(targetId, -1);
				} else {
					dao.deltaFavorites(targetId, -1);
				}
			} else {
				if (isLike) {
					cdao.deltaLikes(targetId, -1);
				} else {
					cdao.deltaFavorites(targetId, -1);
				}
			}
		}
		// 5.其余组合（重复点赞 / 重复取消）：状态保持，返回当前值
		return currentJson(isLike, m != null ? m : c, s, dao, cdao);
	}

	/**
	 * 组装当前状态 JSON：{liked/favorite: bool, count: int}。
	 * count 必须重新查库取最新值 —— 行 Map 是请求开始时的快照，
	 * 刚做完 +1/-1 再拿快照就会差 1（联调时踩过的坑）。
	 * 判断目标是留言还是评论：先按留言查，查不到就当评论查。
	 */
	private static String currentJson(boolean isLike, Map row,
			TokenAuth.Session s, ApiMessageDao dao, ApiCommentDao cdao) {
		String targetId = Sec.strOf(row, "resource_id");
		boolean marked = isLike ? dao.hasLike(s.userId, targetId)
				: dao.hasFavorite(s.userId, targetId);
		Map fresh = dao.find(targetId);        // 先按留言查
		if (fresh == null) {
			fresh = cdao.find(targetId);       // 查不到 → 是评论
		}
		int count = fresh == null ? 0 : Sec.intOf(fresh, isLike ? "likes" : "favorites", 0);
		String key = isLike ? "liked" : "favorite";
		return "{\"" + key + "\":" + marked + ",\"count\":" + count + "}";
	}
}
