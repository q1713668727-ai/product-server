USE `backstage_server`;

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

DELIMITER ;

CALL `add_admin_user_column_if_missing`('shop_avatar_url', 'VARCHAR(500) NULL');
CALL `add_admin_user_column_if_missing`('shop_description', 'VARCHAR(500) NULL');

DROP PROCEDURE IF EXISTS `add_admin_user_column_if_missing`;
