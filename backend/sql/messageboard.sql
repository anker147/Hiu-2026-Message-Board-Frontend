/* ============================================================
   留言板管理系统 —— 数据库建表脚本
   说明：
   1) 你项目里的 db/DatabaseConn.java 连的是：
         jdbc:mysql://localhost:3307/project  （数据库名 project，端口 3307）
         用户名 root / 密码 123456
      所以下面直接使用 project 这个库。如果你的端口或库名不一样，
      改 DatabaseConn.java 里的 ip/username/pwd 三行即可，本文件不用动。
   2) 执行方式：把这个文件的内容复制到 Navicat / MySQL 命令行里跑一次就行。
      重复执行也不会删除你原有数据（除 mb_like 的唯一索引会重建）。
   ============================================================ */

-- 如果还没有 project 库，就建一个（已经有了这句会自动跳过）
CREATE DATABASE IF NOT EXISTS project DEFAULT CHARACTER SET utf8;

-- 切换到 project 库
USE project;

/* ------------------------------------------------------------
   1. 用户表 mb_user：登录/注册模块用
   ------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS mb_user (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键，自增',
  account VARCHAR(50) NOT NULL COMMENT '登录账号，唯一',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  password VARCHAR(100) DEFAULT NULL COMMENT '密码（教学项目，明文保存）',
  avatar VARCHAR(20) DEFAULT 'av1' COMMENT '头像编号 av1~av8，页面据此显示卡通头像',
  user_no VARCHAR(20) DEFAULT NULL COMMENT '默认ID，注册时随机生成，例如 0456e3e1',
  nickname VARCHAR(30) DEFAULT NULL COMMENT '随机网名，例如 快乐的小狗，注册时生成、用户可改',
  create_time DATETIME DEFAULT NULL COMMENT '注册时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='用户表';

/* ------------------------------------------------------------
   2. 留言表 mb_message：首页上半部分的表单提交后存这里
   ------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS mb_message (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键，自增',
  user_id INT NOT NULL COMMENT '是谁发的留言，关联 mb_user.id',
  nickname VARCHAR(50) DEFAULT NULL COMMENT '昵称',
  real_name VARCHAR(50) DEFAULT NULL COMMENT '姓名',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  phone VARCHAR(30) DEFAULT NULL COMMENT '联系电话',
  is_name_public TINYINT(1) DEFAULT 0 COMMENT '姓名是否公开：1=公开，0=打码',
  is_email_public TINYINT(1) DEFAULT 0 COMMENT '邮箱是否公开：1=公开，0=打码',
  is_phone_public TINYINT(1) DEFAULT 0 COMMENT '电话是否公开：1=公开，0=打码',
  content VARCHAR(1000) DEFAULT NULL COMMENT '留言内容',
  status INT DEFAULT 1 COMMENT '推送状态：1=已推送(所有人可见)，0=已取消推送(只有自己可见)',
  create_time DATETIME DEFAULT NULL COMMENT '留言时间',
  update_time DATETIME DEFAULT NULL COMMENT '最后修改时间',
  PRIMARY KEY (id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='留言表';

/* ------------------------------------------------------------
   3. 评论表 mb_comment：留言下面的“评论”和“回复”都存在这张表
      parent_id = 0 表示直接评论留言；
      parent_id = 某条评论的 id 表示回复那条评论。
   ------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS mb_comment (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键，自增',
  message_id INT NOT NULL COMMENT '属于哪一条留言',
  user_id INT NOT NULL COMMENT '评论人，关联 mb_user.id',
  nickname VARCHAR(50) DEFAULT NULL COMMENT '评论人昵称（冗余存一份，显示更快）',
  avatar VARCHAR(20) DEFAULT 'av1' COMMENT '评论人头像编号',
  content VARCHAR(500) DEFAULT NULL COMMENT '评论内容',
  parent_id INT DEFAULT 0 COMMENT '回复目标评论的id，0 表示直接评论留言',
  create_time DATETIME DEFAULT NULL COMMENT '评论时间',
  update_time DATETIME DEFAULT NULL COMMENT '最后修改时间（改过回复时才有值）',
  PRIMARY KEY (id),
  KEY idx_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='评论/回复表';

/* ------------------------------------------------------------
   3.1 评论点赞表 mb_comment_like：回复也能点赞
       (comment_id, user_id) 唯一索引，同一个人对同一条评论只能点一次
   ------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS mb_comment_like (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键，自增',
  comment_id INT NOT NULL COMMENT '被点赞的评论id',
  user_id INT NOT NULL COMMENT '点赞人id',
  create_time DATETIME DEFAULT NULL COMMENT '点赞时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_comment_user (comment_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='评论点赞表';

/* ------------------------------------------------------------
   4. 点赞表 mb_like：一个人对同一条留言只能点一次赞
      (message_id, user_id) 建唯一索引，从数据库层面防止重复点赞
   ------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS mb_like (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键，自增',
  message_id INT NOT NULL COMMENT '被点赞的留言id',
  user_id INT NOT NULL COMMENT '点赞人id',
  create_time DATETIME DEFAULT NULL COMMENT '点赞时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_msg_user (message_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='点赞表';

/* ------------------------------------------------------------
   5. 可选：插一条测试用户，方便你直接登录看效果
      账号 test  密码 123456  默认ID test0001
      （如果不想用，可以不执行这一段）
   ------------------------------------------------------------ */
INSERT IGNORE INTO mb_user (account, email, password, avatar, user_no, nickname, create_time)
VALUES ('test', 'test@qq.com', '123456', 'av2', 'test0001', '快乐的小狗', NOW());

/* ------------------------------------------------------------
   6. 可选：清空所有留言 / 评论 / 点赞（想从空留言板重新演示时执行）
      注意顺序：先删点赞和评论，最后删留言
   ------------------------------------------------------------ */
-- DELETE FROM mb_comment_like;
-- DELETE FROM mb_like;
-- DELETE FROM mb_comment;
-- DELETE FROM mb_message;

/* ------------------------------------------------------------
   7. 关于“高级功能”的数据库说明（2026-11-19 新增）
      · Ajax 点赞：直接复用已有的 mb_like / mb_comment_like，不需要新表
      · 盲盒留言：用 order by rand() limit 1 随机查 mb_message，不需要新表
      · 安全防御：Filter 在内存里比对敏感词、用 Session 记上次发言时间，不需要新表
      所以本次升级【没有】任何表结构变动，上面的建表语句跑完即可。

      可选优化：如果以后留言积累到几十万条，随机查询会变慢，
      可以加一个联合索引让列表/随机查询更快（不加也完全能跑）：
      -- ALTER TABLE mb_message ADD INDEX idx_status_user (status, user_id);
   ------------------------------------------------------------ */
