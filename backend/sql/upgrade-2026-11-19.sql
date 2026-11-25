/* ============================================================
   留言板 —— 数据库升级脚本（2026-11-19）
   作用：给【已经在用的】project 库补上本次新增的字段和表。
   如果你的库是全新的，直接执行 messageboard.sql 就行，不用执行本文件。

   执行方式（命令行）：
     mysql -h127.0.0.1 -P3307 -uroot -p123456 --default-character-set=utf8 < sql/upgrade-2026-11-19.sql
   或者在 Navicat 里打开本文件，整段运行。

   注意：ALTER 语句重复执行会报 1060 Duplicate column name，
        那说明字段已经加过了，跳过该句继续即可，不会影响数据。
   ============================================================ */

USE project;

/* ---------- 1. 用户表：加“网名”字段 ---------- */
ALTER TABLE mb_user
  ADD COLUMN nickname VARCHAR(30) DEFAULT NULL COMMENT '随机网名，例如 快乐的小狗' AFTER user_no;

/* ---------- 2. 留言表：加三个“是否公开显示”标记 ---------- */
ALTER TABLE mb_message
  ADD COLUMN is_name_public TINYINT(1) DEFAULT 0 COMMENT '姓名是否公开：1=公开，0=打码' AFTER phone;

ALTER TABLE mb_message
  ADD COLUMN is_email_public TINYINT(1) DEFAULT 0 COMMENT '邮箱是否公开：1=公开，0=打码' AFTER is_name_public;

ALTER TABLE mb_message
  ADD COLUMN is_phone_public TINYINT(1) DEFAULT 0 COMMENT '电话是否公开：1=公开，0=打码' AFTER is_email_public;

/* ---------- 3. 评论表：加修改时间（记录“这条回复被改过”） ---------- */
ALTER TABLE mb_comment
  ADD COLUMN update_time DATETIME DEFAULT NULL COMMENT '最后修改时间' AFTER create_time;

/* ---------- 4. 新增：评论点赞表 ----------
   留言点赞存在 mb_like，评论点赞单独一张表，互不干扰 */
CREATE TABLE IF NOT EXISTS mb_comment_like (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键，自增',
  comment_id INT NOT NULL COMMENT '被点赞的评论id',
  user_id INT NOT NULL COMMENT '点赞人id',
  create_time DATETIME DEFAULT NULL COMMENT '点赞时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_comment_user (comment_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='评论点赞表';

/* ---------- 5. 给老数据补网名 ----------
   老用户的 nickname 是空的，这里随机分配一个“形容词+动物”的网名，
   例如：快乐的 + 小狗 = 快乐的小狗 */
UPDATE mb_user
SET nickname = CONCAT(
	ELT(FLOOR(1 + RAND() * 6), '快乐的', '粉红的', '软糯的', '元气的', '爱笑的', '睡不醒的'),
	ELT(FLOOR(1 + RAND() * 8), '小狗', '猫咪', '兔子', '猪猪', '小鹿', '狐狸', '企鹅', '小熊')
)
WHERE nickname IS NULL OR nickname = '';

/* 老留言、老评论里存的是手机号（account），统一换成用户现在的网名 */
UPDATE mb_message m
JOIN mb_user u ON m.user_id = u.id
SET m.nickname = u.nickname
WHERE m.nickname IS NULL OR m.nickname = '' OR m.nickname = u.account;

UPDATE mb_comment c
JOIN mb_user u ON c.user_id = u.id
SET c.nickname = u.nickname
WHERE c.nickname IS NULL OR c.nickname = '' OR c.nickname = u.account;

/* ---------- 6. 看一眼升级结果 ---------- */
SELECT id, account, nickname, user_no FROM mb_user;
