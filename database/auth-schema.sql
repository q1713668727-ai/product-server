USE `backstage_server`;

CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '后台管理员ID',
  `username` VARCHAR(80) NOT NULL COMMENT '登录账号',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希',
  `nickname` VARCHAR(80) NULL COMMENT '显示名称',
  `role` VARCHAR(40) NOT NULL DEFAULT 'merchant' COMMENT '角色：admin管理员 merchant普通商家',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '绑定店铺ID',
  `shop_name` VARCHAR(120) NULL COMMENT '绑定店铺名称',
  `shop_avatar_url` VARCHAR(500) NULL COMMENT '店铺头像',
  `shop_description` VARCHAR(500) NULL COMMENT '店铺简介',
  `permissions` JSON NULL COMMENT '权限键名',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1启用',
  `auth_token` VARCHAR(128) NULL COMMENT '当前登录Token',
  `token_expire_at` DATETIME NULL COMMENT 'Token过期时间',
  `last_login_at` DATETIME NULL COMMENT '最近登录时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL COMMENT '注销/删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_users_username` (`username`),
  KEY `idx_admin_users_token` (`auth_token`),
  KEY `idx_admin_users_role_status` (`role`, `status`),
  KEY `idx_admin_users_shop` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台管理员账号';

DELIMITER $$

DROP PROCEDURE IF EXISTS `add_admin_user_column_if_missing`$$
CREATE PROCEDURE `add_admin_user_column_if_missing`(
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'admin_users'
      AND `COLUMN_NAME` = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `admin_users` ADD COLUMN `', p_column_name, '` ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `add_admin_user_index_if_missing`$$
CREATE PROCEDURE `add_admin_user_index_if_missing`(
  IN p_index_name VARCHAR(64),
  IN p_index_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'admin_users'
      AND `INDEX_NAME` = p_index_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `admin_users` ADD ', p_index_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CALL `add_admin_user_column_if_missing`('shop_id', 'BIGINT UNSIGNED NULL COMMENT ''绑定店铺ID''');
CALL `add_admin_user_column_if_missing`('shop_name', 'VARCHAR(120) NULL COMMENT ''绑定店铺名称''');
CALL `add_admin_user_column_if_missing`('shop_avatar_url', 'VARCHAR(500) NULL COMMENT ''店铺头像''');
CALL `add_admin_user_column_if_missing`('shop_description', 'VARCHAR(500) NULL COMMENT ''店铺简介''');
CALL `add_admin_user_column_if_missing`('permissions', 'JSON NULL COMMENT ''权限键名''');
CALL `add_admin_user_column_if_missing`('deleted_at', 'DATETIME NULL COMMENT ''注销/删除时间''');
CALL `add_admin_user_index_if_missing`('idx_admin_users_role_status', 'KEY `idx_admin_users_role_status` (`role`, `status`)');
CALL `add_admin_user_index_if_missing`('idx_admin_users_shop', 'KEY `idx_admin_users_shop` (`shop_id`)');

ALTER TABLE `admin_users`
  MODIFY COLUMN `role` VARCHAR(40) NOT NULL DEFAULT 'merchant' COMMENT '角色：admin管理员 merchant普通商家';

DROP PROCEDURE IF EXISTS `add_admin_user_column_if_missing`;
DROP PROCEDURE IF EXISTS `add_admin_user_index_if_missing`;
