USE `backstage_server`;

ALTER TABLE `market_browse_history` DROP FOREIGN KEY `fk_market_browse_history_product`;
ALTER TABLE `market_cart_items` DROP FOREIGN KEY `fk_market_cart_items_product`;
ALTER TABLE `market_cart_items` DROP FOREIGN KEY `fk_market_cart_items_sku`;
ALTER TABLE `market_coupons` DROP FOREIGN KEY `fk_market_coupons_product`;
ALTER TABLE `market_order_items` DROP FOREIGN KEY `fk_market_order_items_product`;
ALTER TABLE `market_order_items` DROP FOREIGN KEY `fk_market_order_items_sku`;
ALTER TABLE `market_service_sessions` DROP FOREIGN KEY `fk_market_service_sessions_product`;
ALTER TABLE `market_wishlist_items` DROP FOREIGN KEY `fk_market_wishlist_items_product`;

DROP TABLE IF EXISTS `market_product_images`;
DROP TABLE IF EXISTS `market_product_services`;
DROP TABLE IF EXISTS `market_product_skus`;
DROP TABLE IF EXISTS `market_products`;

CREATE TABLE IF NOT EXISTS `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'SPU ID',
  `spu_code` VARCHAR(64) NOT NULL COMMENT 'SPU商品编码',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '店铺ID',
  `category_id` BIGINT UNSIGNED NULL COMMENT '类目ID',
  `name` VARCHAR(200) NOT NULL COMMENT 'SPU商品名称',
  `subtitle` VARCHAR(300) NULL COMMENT '副标题/卖点',
  `main_image_url` VARCHAR(500) NULL COMMENT '商品主图',
  `min_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'SKU最低售价',
  `max_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'SKU最高售价',
  `origin_price` DECIMAL(10, 2) NULL COMMENT '默认划线价',
  `total_stock` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'SKU总库存',
  `sold_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '销量',
  `favorite_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '收藏数',
  `freight_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '运费',
  `is_free_shipping` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否包邮',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0下架 1上架 2售罄',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `detail_html` LONGTEXT NULL COMMENT '商品详情HTML',
  `detail_json` JSON NULL COMMENT '商品详情结构化数据',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_products_spu_code` (`spu_code`),
  KEY `idx_products_category_status` (`category_id`, `status`, `sort_order`),
  KEY `idx_products_shop_status` (`shop_id`, `status`, `sort_order`),
  KEY `idx_products_price` (`min_price`, `max_price`),
  KEY `idx_products_sold` (`sold_count`),
  CONSTRAINT `fk_products_shop`
    FOREIGN KEY (`shop_id`) REFERENCES `market_shops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_products_category`
    FOREIGN KEY (`category_id`) REFERENCES `market_categories` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SPU标准化产品单元';

CREATE TABLE IF NOT EXISTS `attributes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '规格名ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT 'SPU ID',
  `name` VARCHAR(80) NOT NULL COMMENT '规格名，如颜色/尺码',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attributes_product_name` (`product_id`, `name`),
  KEY `idx_attributes_product_sort` (`product_id`, `sort_order`),
  CONSTRAINT `fk_attributes_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='规格名表';

CREATE TABLE IF NOT EXISTS `attribute_values` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '规格值ID',
  `attribute_id` BIGINT UNSIGNED NOT NULL COMMENT '规格名ID',
  `value` VARCHAR(120) NOT NULL COMMENT '规格值，如红色/L',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attribute_values_attribute_value` (`attribute_id`, `value`),
  KEY `idx_attribute_values_attribute_sort` (`attribute_id`, `sort_order`),
  CONSTRAINT `fk_attribute_values_attribute`
    FOREIGN KEY (`attribute_id`) REFERENCES `attributes` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='规格值表';

CREATE TABLE IF NOT EXISTS `skus` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'SKU ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT 'SPU ID',
  `sku_code` VARCHAR(80) NOT NULL COMMENT 'SKU编码',
  `attribute_value_ids` JSON NULL COMMENT '规格值ID组合',
  `specs` JSON NOT NULL COMMENT '规格快照，如颜色/尺码/包装',
  `image_url` VARCHAR(500) NULL COMMENT 'SKU图片',
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'SKU售价',
  `origin_price` DECIMAL(10, 2) NULL COMMENT '划线价',
  `stock` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '库存',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skus_sku_code` (`sku_code`),
  KEY `idx_skus_product_status` (`product_id`, `status`),
  KEY `idx_skus_price` (`price`),
  CONSTRAINT `fk_skus_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SKU库存量单位';

ALTER TABLE `market_coupons`
  ADD CONSTRAINT `fk_market_coupons_product`
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `market_cart_items`
  ADD CONSTRAINT `fk_market_cart_items_product`
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_market_cart_items_sku`
  FOREIGN KEY (`sku_id`) REFERENCES `skus` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `market_wishlist_items`
  ADD CONSTRAINT `fk_market_wishlist_items_product`
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `market_browse_history`
  ADD CONSTRAINT `fk_market_browse_history_product`
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `market_order_items`
  ADD CONSTRAINT `fk_market_order_items_product`
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_market_order_items_sku`
  FOREIGN KEY (`sku_id`) REFERENCES `skus` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `market_service_sessions`
  ADD CONSTRAINT `fk_market_service_sessions_product`
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
