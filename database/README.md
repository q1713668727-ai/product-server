# Market database schema

`market-schema.sql` creates the MySQL database `backstage_server` and the first batch of tables needed by the market module.

Covered areas:

- Shop management: `market_shops`
- Category and entrance management: `market_categories`, `market_category_features`
- Product management: `market_products`, `market_product_images`, `market_product_skus`, `market_product_services`
- Promotion: `market_coupons`
- User shopping data: `market_user_addresses`, `market_cart_items`, `market_wishlist_items`, `market_browse_history`
- Orders: `market_orders`, `market_order_items`
- Customer service: `market_service_sessions`, `market_service_messages`

Run it with a MySQL client:

```bash
mysql -u root -p < database/market-schema.sql
```

The script uses `CREATE TABLE IF NOT EXISTS` and idempotent seed inserts, so it is safe to run more than once during local development.
