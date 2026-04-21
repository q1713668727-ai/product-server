USE `backstage_server`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `add_market_shop_column_if_missing`$$
CREATE PROCEDURE `add_market_shop_column_if_missing`(
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_shops'
      AND `COLUMN_NAME` = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `market_shops` ADD COLUMN `', p_column_name, '` ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `drop_market_shop_column_if_exists`$$
CREATE PROCEDURE `drop_market_shop_column_if_exists`(
  IN p_column_name VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_shops'
      AND `COLUMN_NAME` = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `market_shops` DROP COLUMN `', p_column_name, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `drop_market_shop_index_if_exists`$$
CREATE PROCEDURE `drop_market_shop_index_if_exists`(
  IN p_index_name VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_shops'
      AND `INDEX_NAME` = p_index_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `market_shops` DROP INDEX `', p_index_name, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `add_market_shop_index_if_missing`$$
CREATE PROCEDURE `add_market_shop_index_if_missing`(
  IN p_index_name VARCHAR(64),
  IN p_index_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_shops'
      AND `INDEX_NAME` = p_index_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `market_shops` ADD ', p_index_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `backfill_market_shop_username_from_name`$$
CREATE PROCEDURE `backfill_market_shop_username_from_name`()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_shops'
      AND `COLUMN_NAME` = 'name'
  ) THEN
    SET @ddl = 'UPDATE `market_shops` s JOIN `admin_users` u ON u.`shop_name` = s.`name` AND u.`role` = ''merchant'' SET s.`username` = u.`username` WHERE s.`username` IS NULL OR s.`username` = ''''';
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `backfill_market_shop_username_from_code`$$
CREATE PROCEDURE `backfill_market_shop_username_from_code`()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_shops'
      AND `COLUMN_NAME` = 'shop_code'
  ) THEN
    SET @ddl = 'UPDATE `market_shops` SET `username` = `shop_code` WHERE `username` IS NULL OR `username` = ''''';
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CALL `add_market_shop_column_if_missing`('username', 'VARCHAR(80) NULL');
CALL `backfill_market_shop_username_from_name`();
CALL `backfill_market_shop_username_from_code`();

UPDATE `market_shops`
SET `username` = CONCAT('shop-', `id`)
WHERE `username` IS NULL OR `username` = '';

CALL `drop_market_shop_index_if_exists`('idx_market_shops_status_sort');
CALL `drop_market_shop_index_if_exists`('idx_market_shops_status');

ALTER TABLE `market_shops`
  MODIFY COLUMN `username` VARCHAR(80) NOT NULL;

CALL `add_market_shop_index_if_missing`('uk_market_shops_username', 'UNIQUE KEY `uk_market_shops_username` (`username`)');
CALL `add_market_shop_index_if_missing`('idx_market_shops_status', 'KEY `idx_market_shops_status` (`status`)');

CALL `drop_market_shop_column_if_exists`('shop_code');
CALL `drop_market_shop_column_if_exists`('name');
CALL `drop_market_shop_column_if_exists`('logo_url');
CALL `drop_market_shop_column_if_exists`('cover_url');
CALL `drop_market_shop_column_if_exists`('description');
CALL `drop_market_shop_column_if_exists`('sort_order');

INSERT INTO `market_shops` (`username`, `service_level`, `fans_count`, `sales_count`, `rating`, `status`)
SELECT u.`username`, '金牌客服', 0, 0, 5.0, 1
FROM `admin_users` u
LEFT JOIN `market_shops` s ON s.`username` = u.`username` AND s.`deleted_at` IS NULL
WHERE u.`role` = 'merchant'
  AND s.`id` IS NULL;

DROP PROCEDURE IF EXISTS `add_market_shop_column_if_missing`;
DROP PROCEDURE IF EXISTS `drop_market_shop_column_if_exists`;
DROP PROCEDURE IF EXISTS `drop_market_shop_index_if_exists`;
DROP PROCEDURE IF EXISTS `add_market_shop_index_if_missing`;
DROP PROCEDURE IF EXISTS `backfill_market_shop_username_from_name`;
DROP PROCEDURE IF EXISTS `backfill_market_shop_username_from_code`;
