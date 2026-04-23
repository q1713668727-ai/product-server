CREATE DATABASE IF NOT EXISTS `backstage_server`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `backstage_server`;

CREATE TABLE IF NOT EXISTS `market_shops` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '店铺ID',
  `username` VARCHAR(80) NOT NULL COMMENT '商家账号',
  `service_level` VARCHAR(50) NULL COMMENT '客服/服务等级',
  `fans_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '粉丝数',
  `sales_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '销量',
  `rating` DECIMAL(3, 1) NOT NULL DEFAULT 5.0 COMMENT '评分',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_shops_username` (`username`),
  KEY `idx_market_shops_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market店铺';

CREATE TABLE IF NOT EXISTS `market_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '类目ID',
  `parent_id` BIGINT UNSIGNED NULL COMMENT '父类目ID',
  `category_key` VARCHAR(64) NOT NULL COMMENT '前端类目Key',
  `name` VARCHAR(80) NOT NULL COMMENT '类目名称',
  `icon_url` VARCHAR(500) NULL COMMENT '类目图标',
  `level` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '层级',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_categories_category_key` (`category_key`),
  UNIQUE KEY `uk_market_categories_parent_name` (`parent_id`, `name`),
  KEY `idx_market_categories_parent_sort` (`parent_id`, `sort_order`),
  KEY `idx_market_categories_status_sort` (`status`, `sort_order`),
  CONSTRAINT `fk_market_categories_parent`
    FOREIGN KEY (`parent_id`) REFERENCES `market_categories` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market类目';

CREATE TABLE IF NOT EXISTS `market_category_features` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '功能入口ID',
  `category_id` BIGINT UNSIGNED NOT NULL COMMENT '所属类目ID',
  `title` VARCHAR(80) NOT NULL COMMENT '入口名称',
  `icon_url` VARCHAR(500) NULL COMMENT '入口图标',
  `route_path` VARCHAR(200) NULL COMMENT '前端跳转路径',
  `route_params` JSON NULL COMMENT '前端跳转参数',
  `row_index` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '前端展示行',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0禁用 1启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_category_features_category_title` (`category_id`, `title`),
  KEY `idx_market_category_features_category` (`category_id`, `row_index`, `sort_order`),
  CONSTRAINT `fk_market_category_features_category`
    FOREIGN KEY (`category_id`) REFERENCES `market_categories` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market类目功能入口';

CREATE TABLE IF NOT EXISTS `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'SPU ID',
  `spu_code` VARCHAR(64) NOT NULL COMMENT 'SPU商品编码',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '店铺ID',
  `category_id` BIGINT UNSIGNED NULL COMMENT '类目ID',
  `name` VARCHAR(500) NOT NULL COMMENT 'SPU商品名称',
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

CREATE TABLE IF NOT EXISTS `market_coupons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '优惠券ID',
  `coupon_code` VARCHAR(64) NOT NULL COMMENT '优惠券编码',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '店铺ID',
  `product_id` BIGINT UNSIGNED NULL COMMENT '指定商品ID',
  `title` VARCHAR(120) NOT NULL COMMENT '优惠券标题',
  `threshold_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '使用门槛',
  `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '优惠金额',
  `is_stackable` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '是否可叠加',
  `is_once_per_user` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '每个用户是否只可领取一次',
  `coupon_level` VARCHAR(24) NOT NULL DEFAULT 'shop' COMMENT '优惠券层级：product商品 shop店铺 platform平台',
  `receive_mode` VARCHAR(24) NOT NULL DEFAULT 'unlimited' COMMENT '领取方式：once单用户一次 unlimited不限领取 grant_only仅后台发放',
  `total_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '发放总量，0不限',
  `received_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已领取',
  `start_at` DATETIME NULL COMMENT '生效时间',
  `end_at` DATETIME NULL COMMENT '失效时间',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：0停用 1启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_coupons_coupon_code` (`coupon_code`),
  KEY `idx_market_coupons_shop_status` (`shop_id`, `status`),
  KEY `idx_market_coupons_product_status` (`product_id`, `status`),
  CONSTRAINT `fk_market_coupons_shop`
    FOREIGN KEY (`shop_id`) REFERENCES `market_shops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_market_coupons_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market优惠券';

CREATE TABLE IF NOT EXISTS `market_user_addresses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '收货地址ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID，对应业务用户',
  `receiver_name` VARCHAR(50) NOT NULL COMMENT '收货人',
  `receiver_phone` VARCHAR(30) NOT NULL COMMENT '手机号',
  `province` VARCHAR(50) NOT NULL COMMENT '省',
  `city` VARCHAR(50) NOT NULL COMMENT '市',
  `district` VARCHAR(50) NOT NULL COMMENT '区/县',
  `detail_address` VARCHAR(300) NOT NULL COMMENT '详细地址',
  `is_default` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '是否默认',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_market_user_addresses_user_default` (`user_id`, `is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market用户收货地址';

CREATE TABLE IF NOT EXISTS `market_cart_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '购物车项ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '店铺ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `sku_id` BIGINT UNSIGNED NULL COMMENT 'SKU ID',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数量',
  `selected` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '是否选中',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_cart_items_user_sku` (`user_id`, `product_id`, `sku_id`),
  KEY `idx_market_cart_items_user` (`user_id`, `selected`),
  KEY `idx_market_cart_items_shop` (`shop_id`),
  CONSTRAINT `fk_market_cart_items_shop`
    FOREIGN KEY (`shop_id`) REFERENCES `market_shops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_market_cart_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_market_cart_items_sku`
    FOREIGN KEY (`sku_id`) REFERENCES `skus` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market购物车';

CREATE TABLE IF NOT EXISTS `market_wishlist_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '心愿单ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_wishlist_items_user_product` (`user_id`, `product_id`),
  KEY `idx_market_wishlist_items_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_market_wishlist_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market心愿单';

CREATE TABLE IF NOT EXISTS `market_browse_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '浏览记录ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `product_id` BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `viewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '浏览时间',
  PRIMARY KEY (`id`),
  KEY `idx_market_browse_history_user_time` (`user_id`, `viewed_at`),
  KEY `idx_market_browse_history_product` (`product_id`),
  CONSTRAINT `fk_market_browse_history_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market商品足迹';

CREATE TABLE IF NOT EXISTS `market_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '店铺ID',
  `address_id` BIGINT UNSIGNED NULL COMMENT '收货地址ID',
  `receiver_snapshot` JSON NULL COMMENT '收货地址快照',
  `product_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '商品总额',
  `freight_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '运费',
  `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '优惠金额',
  `pay_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '实付金额',
  `payment_method` VARCHAR(40) NULL COMMENT '支付方式',
  `remark` VARCHAR(300) NULL COMMENT '买家备注',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 10 COMMENT '状态：10待支付 20待发货 30待收货 40已完成 50已取消 60退款中',
  `paid_at` DATETIME NULL COMMENT '支付时间',
  `shipped_at` DATETIME NULL COMMENT '发货时间',
  `finished_at` DATETIME NULL COMMENT '完成时间',
  `cancelled_at` DATETIME NULL COMMENT '取消时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_orders_order_no` (`order_no`),
  KEY `idx_market_orders_user_status` (`user_id`, `status`, `created_at`),
  KEY `idx_market_orders_shop_status` (`shop_id`, `status`, `created_at`),
  CONSTRAINT `fk_market_orders_shop`
    FOREIGN KEY (`shop_id`) REFERENCES `market_shops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_market_orders_address`
    FOREIGN KEY (`address_id`) REFERENCES `market_user_addresses` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market订单';

CREATE TABLE IF NOT EXISTS `market_order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单项ID',
  `order_id` BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `product_id` BIGINT UNSIGNED NULL COMMENT '商品ID',
  `sku_id` BIGINT UNSIGNED NULL COMMENT 'SKU ID',
  `product_snapshot` JSON NOT NULL COMMENT '商品快照',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数量',
  `unit_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '单价',
  `total_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '小计',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_market_order_items_order` (`order_id`),
  KEY `idx_market_order_items_product` (`product_id`),
  CONSTRAINT `fk_market_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `market_orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_market_order_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_market_order_items_sku`
    FOREIGN KEY (`sku_id`) REFERENCES `skus` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market订单项';

CREATE TABLE IF NOT EXISTS `market_service_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '客服会话ID',
  `session_no` VARCHAR(64) NOT NULL COMMENT '会话号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `shop_id` BIGINT UNSIGNED NULL COMMENT '店铺ID',
  `product_id` BIGINT UNSIGNED NULL COMMENT '关联商品ID',
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态：1进行中 2已关闭',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_market_service_sessions_session_no` (`session_no`),
  KEY `idx_market_service_sessions_user_status` (`user_id`, `status`, `updated_at`),
  KEY `idx_market_service_sessions_shop_status` (`shop_id`, `status`, `updated_at`),
  CONSTRAINT `fk_market_service_sessions_shop`
    FOREIGN KEY (`shop_id`) REFERENCES `market_shops` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_market_service_sessions_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market客服会话';

CREATE TABLE IF NOT EXISTS `market_service_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '客服消息ID',
  `session_id` BIGINT UNSIGNED NOT NULL COMMENT '会话ID',
  `sender_type` TINYINT UNSIGNED NOT NULL COMMENT '发送方：1用户 2客服 3AI',
  `sender_id` BIGINT UNSIGNED NULL COMMENT '发送方ID',
  `message_type` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '消息类型：1文本 2商品卡片 3图片',
  `content` TEXT NULL COMMENT '文本内容',
  `payload` JSON NULL COMMENT '结构化消息内容',
  `is_read` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '是否已读',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_market_service_messages_session_time` (`session_id`, `created_at`),
  CONSTRAINT `fk_market_service_messages_session`
    FOREIGN KEY (`session_id`) REFERENCES `market_service_sessions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='market客服消息';

INSERT INTO `market_categories` (`category_key`, `name`, `sort_order`, `status`)
VALUES
  ('recommend', '推荐', 10, 1),
  ('furniture', '家具', 20, 1),
  ('fashion', '穿搭', 30, 1),
  ('beauty', '美护', 40, 1),
  ('sports', '运动', 50, 1),
  ('toys', '潮玩', 60, 1),
  ('food', '食饮', 70, 1),
  ('digital', '数码', 80, 1),
  ('fresh', '生鲜', 90, 1),
  ('antique', '古玩', 100, 1),
  ('kids', '亲子', 110, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `market_category_features` (`category_id`, `title`, `route_path`, `row_index`, `sort_order`, `status`)
SELECT `id`, '逛逛广场', '/market-category', 0, 10, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '买手橱窗', '/market-category', 0, 20, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '美的商店', '/market-category', 0, 30, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '好货广场', '/market-category', 0, 40, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '宠粉清单', '/market-category', 0, 50, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '我的订单', '/orders', 1, 10, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '购物车', '/cart', 1, 20, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '优惠券', '/coupons', 1, 30, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '客服消息', '/product-service', 1, 40, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
UNION ALL SELECT `id`, '商品足迹', '/browse-history', 1, 50, 1 FROM `market_categories` WHERE `category_key` = 'recommend'
ON DUPLICATE KEY UPDATE
  `route_path` = VALUES(`route_path`),
  `row_index` = VALUES(`row_index`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);
