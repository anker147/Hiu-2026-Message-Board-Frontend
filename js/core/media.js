/* ============================================================
 * 留言板 · 本地图片媒体层（零依赖原型）
 * 参考追风杯导播系统「图片字段存字符串引用 + 默认回退」的建模：
 *   - 上传文件读成 dataURL，按 id 存入 localStorage（hmb_v1_media）
 *   - 业务字段只存字符串引用 localimg://<id>，不存二进制本身
 *   - 引用缺失 / 解析失败 → 返回 null，由调用方回退 emoji 头像或隐藏
 * 生产环境：把 save() 换成对象存储上传、返回 CDN URL 即可，业务字段与渲染无需改动。
 * ============================================================ */
(function (window, document) {
  "use strict";

  var HMB = window.HMB = window.HMB || {};
  var PREFIX = "hmb_v1_media";
  var REF = "localimg://";
  var MAX_IMAGES = 10;
  var MAX_BYTES = 5 * 1024 * 1024;          // 单张 5MB 上限
  var ACCEPT = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  function readStore() {
    try { return JSON.parse(window.localStorage.getItem(PREFIX) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function writeStore(obj) {
    try { window.localStorage.setItem(PREFIX, JSON.stringify(obj)); return true; }
    catch (e) { return false; }   // 配额满：上层提示
  }

  /** id → dataURL（无引用返回 null） */
  function get(ref) {
    if (!ref || typeof ref !== "string" || ref.indexOf(REF) !== 0) return null;
    var id = ref.slice(REF.length);
    return readStore()[id] || null;
  }

  /** 生成 <img>，失败返回 null（调用方回退） */
  function el(ref, cls, alt) {
    var data = get(ref);
    if (!data) return null;
    var img = document.createElement("img");
    img.className = cls || "";
    img.src = data;
    img.alt = alt || "图片";
    return img;
  }

  /** 校验 + 读取 + 存储；cb({ok, ref, error}) */
  function save(file, cb) {
    var done = function (r) { if (typeof cb === "function") window.setTimeout(function () { cb(r); }, 0); };
    if (!file) return done({ ok: false, error: "noFile" });
    if (ACCEPT.indexOf(file.type) < 0) return done({ ok: false, error: "type" });
    if (file.size > MAX_BYTES) return done({ ok: false, error: "size" });
    if (!window.FileReader) return done({ ok: false, error: "unsupported" });
    var reader = new window.FileReader();
    reader.onload = function (e) {
      var data = String(e.target.result || "");
      var id = "img-" + Date.now().toString(36) + "-" +
               Math.random().toString(36).slice(2, 10);
      var store = readStore();
      store[id] = data;
      if (!writeStore(store)) return done({ ok: false, error: "quota" });
      done({ ok: true, ref: REF + id, data: data });
    };
    reader.onerror = function () { done({ ok: false, error: "read" }); };
    reader.readAsDataURL(file);
  }

  /** 批量：多选文件回调，返回 refs 数组（跳过失败项） */
  function saveMany(files, cb) {
    var list = Array.prototype.slice.call(files || []);
    var refs = [], errors = [], left = list.length;
    if (!left) return window.setTimeout(function () { cb({ refs: refs, errors: errors }); }, 0);
    list.forEach(function (f) {
      save(f, function (r) {
        if (r.ok) refs.push(r.ref); else errors.push(r.error);
        if (--left === 0) cb({ refs: refs, errors: errors });
      });
    });
  }

  function remove(ref) {
    if (!ref || ref.indexOf(REF) !== 0) return;
    var store = readStore();
    delete store[ref.slice(REF.length)];
    writeStore(store);
  }

  HMB.media = {
    REF: REF,
    MAX_IMAGES: MAX_IMAGES,
    MAX_BYTES: MAX_BYTES,
    ACCEPT: ACCEPT,
    get: get,
    el: el,
    save: save,
    saveMany: saveMany,
    remove: remove
  };
})(window, document);
