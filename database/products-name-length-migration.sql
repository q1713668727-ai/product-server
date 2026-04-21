USE `backstage_server`;

ALTER TABLE `products`
  MODIFY COLUMN `name` VARCHAR(500) NOT NULL COMMENT 'SPU商品名称';
