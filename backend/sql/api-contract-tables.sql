SET NAMES utf8;
USE project;

-- ============================================================
-- 前端契约版新表（与旧 mb_* 表并存，互不影响）
-- 时间戳一律毫秒；对外主键用字符串 resourceId
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_id CHAR(8) NOT NULL,
  nickname VARCHAR(20) NOT NULL,
  avatar_enum TINYINT NOT NULL DEFAULT 1,
  avatar_url VARCHAR(255) NOT NULL DEFAULT '',
  real_name VARCHAR(20) NOT NULL DEFAULT '',
  email VARCHAR(60) NOT NULL DEFAULT '',
  bio VARCHAR(60) NOT NULL DEFAULT '',
  flag_name TINYINT(1) NOT NULL DEFAULT 0,
  flag_email TINYINT(1) NOT NULL DEFAULT 0,
  flag_phone TINYINT(1) NOT NULL DEFAULT 0,
  flag_liked TINYINT(1) NOT NULL DEFAULT 1,
  flag_favorite TINYINT(1) NOT NULL DEFAULT 1,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  mute_until BIGINT NOT NULL DEFAULT 0,
  ban_reason VARCHAR(200) NOT NULL DEFAULT '',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_account (account),
  UNIQUE KEY uk_users_display (display_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS messages (
  resource_id VARCHAR(36) NOT NULL,
  `no` VARCHAR(8) NOT NULL DEFAULT '',
  owner_id BIGINT NOT NULL,
  title VARCHAR(48) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  nickname_snapshot VARCHAR(20) NOT NULL,
  avatar_enum TINYINT NOT NULL DEFAULT 1,
  avatar_url_snapshot VARCHAR(255) NOT NULL DEFAULT '',
  display_id CHAR(8) NOT NULL DEFAULT '',
  topic_tag VARCHAR(16) NOT NULL DEFAULT '',
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  period INT NOT NULL DEFAULT 24,
  created_at BIGINT NOT NULL,
  views INT NOT NULL DEFAULT 0,
  likes INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  favorites INT NOT NULL DEFAULT 0,
  heat_delta DECIMAL(6,1) NOT NULL DEFAULT 0,
  heat_history TEXT NULL,
  weekly_stats TEXT NULL,
  last_rank INT NOT NULL DEFAULT 0,
  peak_rank INT NOT NULL DEFAULT 0,
  peak_new_rank INT NOT NULL DEFAULT 0,
  is_new TINYINT(1) NOT NULL DEFAULT 1,
  edited TINYINT(1) NOT NULL DEFAULT 0,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  hidden_reason VARCHAR(200) NOT NULL DEFAULT '',
  images TEXT NULL,
  cover_url VARCHAR(255) NOT NULL DEFAULT '',
  cover_from_first TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (resource_id),
  KEY idx_msg_owner (owner_id),
  KEY idx_msg_period_pub (period, is_public),
  KEY idx_msg_pub_time (is_public, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS comments (
  resource_id VARCHAR(36) NOT NULL,
  message_id VARCHAR(36) NOT NULL,
  parent_id VARCHAR(36) NULL,
  root_id VARCHAR(36) NULL,
  depth TINYINT NOT NULL DEFAULT 1,
  owner_id BIGINT NOT NULL,
  author_name VARCHAR(20) NOT NULL,
  author_avatar TINYINT NOT NULL DEFAULT 0,
  author_display_id VARCHAR(8) NOT NULL DEFAULT '',
  at_display_id VARCHAR(8) NOT NULL DEFAULT '',
  at_author_name VARCHAR(20) NOT NULL DEFAULT '',
  content VARCHAR(500) NOT NULL,
  created_at BIGINT NOT NULL,
  likes INT NOT NULL DEFAULT 0,
  favorites INT NOT NULL DEFAULT 0,
  edited TINYINT(1) NOT NULL DEFAULT 0,
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  hidden_reason VARCHAR(200) NOT NULL DEFAULT '',
  PRIMARY KEY (resource_id),
  KEY idx_cmt_msg_time (message_id, created_at),
  KEY idx_cmt_parent (parent_id),
  KEY idx_cmt_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS likes (
  user_id BIGINT NOT NULL,
  target_id VARCHAR(36) NOT NULL,
  target_type VARCHAR(10) NOT NULL DEFAULT 'message',
  created_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, target_id),
  KEY idx_like_target (target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT NOT NULL,
  target_id VARCHAR(36) NOT NULL,
  target_type VARCHAR(10) NOT NULL DEFAULT 'message',
  created_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, target_id),
  KEY idx_fav_target (target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  csrf VARCHAR(48) NOT NULL,
  last_active BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (token),
  KEY idx_sess_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS login_fails (
  phone VARCHAR(20) NOT NULL,
  fail_count INT NOT NULL DEFAULT 0,
  lock_until BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS rate_window (
  user_key VARCHAR(20) NOT NULL,
  ts_list TEXT NULL,
  PRIMARY KEY (user_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS blindbox_replies (
  reply_id VARCHAR(36) NOT NULL,
  message_id VARCHAR(36) NOT NULL,
  real_owner_id BIGINT NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (reply_id),
  KEY idx_blind_owner (real_owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS settings (
  id TINYINT NOT NULL DEFAULT 1,
  sensitive_words TEXT NULL,
  current_period INT NOT NULL DEFAULT 24,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idem_key VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (idem_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum, real_name, email, bio, flag_name, flag_email, flag_phone, created_at) VALUES ('13800000001', 'pbkdf2:10000:5ce9b86185e399e13cd1fd2db6b77d61:b7a68471ea75d8c11dc4ff3d05092fcb451101d1', '20849317', '小满', 1, '王小满', 'xiaoman@hiu.edu.cn', '喜欢在晚自习后去操场看晚霞', 1, 0, 0, 1788264000000);
INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum, real_name, email, bio, flag_name, flag_email, flag_phone, created_at) VALUES ('13800000002', 'pbkdf2:10000:0d1fe3118180564eb3f99ac3f1ebbcbd:7686b8dba0da732b6d2d54a43d89ba2eaf0036a1', '31724605', '阿泽', 3, '陈泽', 'aze@hiu.edu.cn', '食堂三楼常客', 0, 1, 0, 1788436800000);
INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum, real_name, email, bio, flag_name, flag_email, flag_phone, created_at) VALUES ('13800000003', 'pbkdf2:10000:23056ffd427b0aa5694f3b594402daf1:ce449802b8848126c7f9e790cbae06a2b0ec86fe', '42839621', '橘子汽水', 4, '', '', '气泡是人类进步的阶梯', 0, 0, 0, 1789041600000);
INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum, real_name, email, bio, flag_name, flag_email, flag_phone, created_at) VALUES ('13800000004', 'pbkdf2:10000:e0465cf510f76ea1c8bf9ad44979f53c:ecdf3f44b9d8b950d063b91351ef02cc16ea13ce', '53912470', '匿名同学', 6, '', '', '', 0, 0, 0, 1790942400000);
INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum, real_name, email, bio, flag_name, flag_email, flag_phone, created_at) VALUES ('13800000005', 'pbkdf2:10000:3f2a163c8ecad78ecfe377fc51546284:93c5cc2a4deeac6bb16666a80d35b0797cfe3103', '64183259', '树树', 7, '林树', '', '在图书馆睡觉也很香', 1, 0, 1, 1792065600000);
INSERT INTO users (account, password_hash, display_id, nickname, avatar_enum, real_name, email, bio, flag_name, flag_email, flag_phone, created_at) VALUES ('13800000006', 'pbkdf2:10000:cf7934c302977beee1569c608bfda829:e780835f7610a38b77d1bf05e662ef8223235eba', '75091638', '晚风', 8, '苏晚', 'wanfeng@hiu.edu.cn', '只想快点放假', 0, 0, 1, 1793534400000);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-latep-2026-0001', '7f3a9c21', 1, '一起去看晚霞吧', '今晚操场的晚霞真的很好看，粉紫色的云压得很低，风也温柔。晚自习下课走那条小路，抬头就能看到，别低头刷手机啦。', '小满', 1, '20849317', '校园日常', 1, 24, 1795552200000, 12000, 328, 4, 89, 12.4, '[{"value":120},{"value":210}]', '[]', 1);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-canteen-2026-0002', '3b81d0f4', 2, '食堂三楼新窗口测评', '麻辣香锅窗口终于开了！中午十二点去要排队十五分钟，称重算钱，人均 12 块左右，辣度可以选。缺点是米饭有点硬。', '阿泽', 3, '31724605', '食堂', 1, 23, 1795004400000, 8400, 156, 3, 41, 5.7, '[{"value":120},{"value":210}]', NULL, 0);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-help-2026-0003', '9c24e6a8', 3, '', '有没有人捡到一副黑色边框眼镜？周三晚上在图书馆三楼靠窗的位置丢的，度数很深，捡到必有重谢（一杯奶茶）！', '橘子汽水', 4, '42839621', '求助', 1, 24, 1795597500000, 3200, 12, 2, 3, 0.0, NULL, '[]', 1);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-daily-2026-0004', '5e70b3c2', 5, '图书馆四楼靠里的位置', '四楼最里面那排插座是好的，别的排插一半是坏的。悄悄说，别传太广。', '树树', 7, '64183259', '互助', 1, 22, 1794325200000, 5600, 84, 1, 12, -3.2, '[{"value":120},{"value":210}]', NULL, 0);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-blind-2026-0005', '2a94f7d0', 6, '写给期末的自己', '希望期末的你别再临时抱佛脚了。现在开始每天看两小时，寒假就能安心玩。这是三个月后的我对你唯一的要求。', '晚风', 8, '75091638', '日常', 1, 24, 1795471800000, 980, 46, 2, 9, 8.9, '[{"value":120},{"value":210}]', '[]', 1);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-daily-2026-0006', '8d35c1b9', 2, '早八人的怨念', '谁发明的早八。谁。是谁。', '阿泽', 3, '31724605', '校园日常', 1, 21, 1793692200000, 21000, 402, 1, 130, 0.0, '[{"value":120},{"value":210}]', NULL, 0);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-daily-2026-0007', '6b08e4d3', 3, '橘子汽水的提问', '为什么教学楼的热水机永远在维修中？冬天想喝口热水这么难吗。', '橘子汽水', 4, '42839621', '校园日常', 1, 24, 1795595400000, 150, 3, 1, 0, 0.0, '[{"value":120},{"value":210}]', '[]', 1);
INSERT INTO messages (resource_id, `no`, owner_id, title, content, nickname_snapshot, avatar_enum, display_id, topic_tag, is_public, period, created_at, views, likes, comments, favorites, heat_delta, heat_history, weekly_stats, is_new) VALUES ('m-secret-2026-0008', '4e19a2f7', 1, '（仅自己可见）碎碎念', '这条是私密留言，用来测试 isPublic=false 的可见性：别人不应该在列表里看到它。', '小满', 1, '20849317', '日常', 0, 24, 1795561200000, 5, 0, 0, 0, 0.0, '[{"value":120},{"value":210}]', '[]', 1);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0001', 'm-latep-2026-0001', NULL, NULL, 1, 2, '阿泽', 3, '31724605', '', '', '蹲一个！明晚就考完高数了，正好去放松一下。', 1795554000000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0002', 'm-latep-2026-0001', 'c-0001', 'c-0001', 2, 1, '小满', 1, '20849317', '31724605', '阿泽', '考完记得来找我，我带相机。', 1795554600000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0003', 'm-latep-2026-0001', NULL, NULL, 1, 6, '晚风', 8, '75091638', '', '', '拍到了拍到了！昨天的云真的绝。', 1795592400000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0004', 'm-latep-2026-0001', 'c-0003', 'c-0003', 2, 3, '橘子汽水', 4, '42839621', '75091638', '晚风', '求原图！想当壁纸。', 1795593900000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0005', 'm-canteen-2026-0002', NULL, NULL, 1, 3, '橘子汽水', 4, '42839621', '', '', '中午去排了，确实好吃，米饭确实硬。', 1795006800000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0006', 'm-canteen-2026-0002', 'c-0005', 'c-0005', 2, 2, '阿泽', 3, '31724605', '42839621', '橘子汽水', '下周推出轻辣版，跟师傅提过了。', 1795008600000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0007', 'm-canteen-2026-0002', NULL, NULL, 1, 5, '树树', 7, '64183259', '', '', '人均12？我们宿舍这边人均18……', 1795089600000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0008', 'm-help-2026-0003', NULL, NULL, 1, 4, '匿名同学', 6, '53912470', '', '', '帮你留意了，保洁阿姨那边也可以去问问。', 1795599600000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0009', 'm-help-2026-0003', 'c-0008', 'c-0008', 2, 3, '橘子汽水', 4, '42839621', '53912470', '匿名同学', '谢谢！已经去问过了，还在等消息。', 1795600800000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0010', 'm-daily-2026-0006', NULL, NULL, 1, 1, '小满', 1, '20849317', '', '', '是我们全体早八人。', 1793694000000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0011', 'm-blind-2026-0005', NULL, NULL, 1, 5, '树树', 7, '64183259', '', '', '三个月后的你会感谢现在的你的。加油。', 1795474800000, 0);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0012', 'm-canteen-2026-0002', NULL, NULL, 1, 1, '热心同学', 0, '', '', '', '偷偷回复：谢谢你测评，我今天避开了硬米饭。', 1795523400000, 1);
INSERT INTO comments (resource_id, message_id, parent_id, root_id, depth, owner_id, author_name, author_avatar, author_display_id, at_display_id, at_author_name, content, created_at, is_anonymous) VALUES ('c-0013', 'm-daily-2026-0007', NULL, NULL, 1, 2, '阿泽', 3, '31724605', '', '', '热水机：我也是早八。', 1795597200000, 0);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (2, 'm-latep-2026-0001', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (3, 'm-latep-2026-0001', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (5, 'm-latep-2026-0001', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (6, 'm-latep-2026-0001', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (1, 'm-canteen-2026-0002', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (3, 'm-canteen-2026-0002', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (6, 'm-daily-2026-0006', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (1, 'c-0001', 'comment', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (2, 'c-0003', 'comment', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (3, 'm-help-2026-0003', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (4, 'm-blind-2026-0005', 'message', 1795600800000);
INSERT INTO likes (user_id, target_id, target_type, created_at) VALUES (6, 'm-blind-2026-0005', 'message', 1795600800000);
INSERT INTO favorites (user_id, target_id, target_type, created_at) VALUES (1, 'm-canteen-2026-0002', 'message', 1795600800000);
INSERT INTO favorites (user_id, target_id, target_type, created_at) VALUES (3, 'm-latep-2026-0001', 'message', 1795600800000);
INSERT INTO favorites (user_id, target_id, target_type, created_at) VALUES (2, 'm-latep-2026-0001', 'message', 1795600800000);
INSERT INTO blindbox_replies (reply_id, message_id, real_owner_id, at) VALUES ('c-0012', 'm-canteen-2026-0002', 1, 1795523400000);
INSERT INTO settings (id, sensitive_words, current_period) VALUES (1, '["加微信","代考","办证","刷单"]', 24);
