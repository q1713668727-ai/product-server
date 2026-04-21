USE `backstage_server`;

DELIMITER $$

DROP PROCEDURE IF EXISTS `add_market_coupon_column_if_missing`$$
CREATE PROCEDURE `add_market_coupon_column_if_missing`(
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE()
      AND `TABLE_NAME` = 'market_coupons'
      AND `COLUMN_NAME` = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `market_coupons` ADD COLUMN `', p_column_name, '` ', p_column_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CALL `add_market_coupon_column_if_missing`('is_stackable', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
CALL `add_market_coupon_column_if_missing`('is_once_per_user', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
CALL `add_market_coupon_column_if_missing`('deleted_at', 'DATETIME NULL');

DROP PROCEDURE IF EXISTS `add_market_coupon_column_if_missing`;
