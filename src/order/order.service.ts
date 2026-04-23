import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

type OrderStatusText = '待支付' | '待发货' | '待收货' | '已完成' | '已取消' | '售后';

type OrderRow = {
  id: number;
  order_no: string;
  user_id: number;
  user_account?: string | null;
  shop_id: number | null;
  shop_name: string | null;
  receiver_snapshot: string | Record<string, any> | null;
  pay_amount: string | number;
  payment_method: string | null;
  refund_status?: number | null;
  refund_reason?: string | null;
  refund_received_status?: string | null;
  refund_applied_at?: Date | string | null;
  refund_reviewed_at?: Date | string | null;
  refund_origin_status?: number | null;
  status: number;
  created_at: Date | string;
  paid_at?: Date | string | null;
  shipped_at?: Date | string | null;
  cancelled_at?: Date | string | null;
};

type OrderItemRow = {
  id: number;
  order_id: number;
  product_id?: number | null;
  sku_id?: number | null;
  product_snapshot: string | Record<string, any> | null;
  quantity: number;
};

type ReviewRow = {
  id: number;
  order_no: string;
  user_account: string;
  user_name: string | null;
  product_name: string | null;
  shop_name: string | null;
  rating: number;
  content: string;
  reply_content: string | null;
  replied_at: Date | string | null;
  created_at: Date | string;
};

@Injectable()
export class OrderService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private statusText(status: number): OrderStatusText {
    if (status === 20) return '待发货';
    if (status === 30) return '待收货';
    if (status === 40) return '已完成';
    if (status === 50) return '已取消';
    if (status === 60) return '售后';
    return '待支付';
  }

  private refundStatusText(status: number | null | undefined) {
    if (Number(status || 0) === 1) return '商家审核中';
    if (Number(status || 0) === 2) return '商家同意退款';
    if (Number(status || 0) === 3) return '商家拒绝退款';
    return '';
  }

  private parseJson(value: any) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private formatDate(value: Date | string | null | undefined) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private addressText(snapshot: any) {
    const address = this.parseJson(snapshot);
    if (!address) return '';
    if (typeof address === 'string') return address;
    const region = String(address.region || '').trim();
    const detail = String(address.detail || address.detailAddress || address.detail_address || address.address || '').trim();
    const province = String(address.province || '').trim();
    const city = String(address.city || '').trim();
    const district = String(address.district || '').trim();
    const name = String(address.name || address.receiver || address.consignee || '').trim();
    const phone = String(address.phone || address.mobile || '').trim();

    const location = [region || [province, city, district].filter(Boolean).join(' '), detail]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(' ');
    const receiver = [name, phone].filter(Boolean).join(' ');
    return [location, receiver].filter(Boolean).join('  ');
  }

  private productText(items: OrderItemRow[]) {
    const names = items
      .map((item) => {
        const snapshot = this.parseJson(item.product_snapshot) || {};
        const name = String(snapshot.name || snapshot.productName || '商品').trim();
        const quantity = Number(item.quantity || snapshot.quantity || 1);
        return quantity > 1 ? `${name} x${quantity}` : name;
      })
      .filter(Boolean);
    return names.join('、');
  }

  private async ensureOrderColumns() {
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS market_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_no VARCHAR(64) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        user_account VARCHAR(255) NULL,
        shop_id BIGINT UNSIGNED NULL,
        receiver_snapshot JSON NULL,
        product_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        freight_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        pay_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        payment_method VARCHAR(40) NULL,
        remark VARCHAR(300) NULL,
        refund_status TINYINT UNSIGNED NULL,
        refund_reason VARCHAR(300) NULL,
        refund_received_status VARCHAR(20) NULL,
        refund_applied_at DATETIME NULL,
        refund_reviewed_at DATETIME NULL,
        refund_origin_status TINYINT UNSIGNED NULL,
        status TINYINT UNSIGNED NOT NULL DEFAULT 10,
        paid_at DATETIME NULL,
        shipped_at DATETIME NULL,
        cancelled_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_market_orders_order_no (order_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS market_order_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        product_id BIGINT UNSIGNED NULL,
        sku_id BIGINT UNSIGNED NULL,
        product_snapshot JSON NOT NULL,
        quantity INT UNSIGNED NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_market_order_items_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );

    const columns = await this.db.query<{ Field: string }>('SHOW COLUMNS FROM market_orders;');
    const names = new Set(columns.map((item) => item.Field));
    if (!names.has('user_account')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN user_account VARCHAR(255) NULL AFTER user_id;');
    }
    if (!names.has('shipped_at')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN shipped_at DATETIME NULL AFTER paid_at;');
    }
    if (!names.has('finished_at')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN finished_at DATETIME NULL AFTER shipped_at;');
    }
    if (!names.has('cancelled_at')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN cancelled_at DATETIME NULL AFTER finished_at;');
    }
    if (!names.has('refund_status')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN refund_status TINYINT UNSIGNED NULL AFTER remark;');
    }
    if (!names.has('refund_reason')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN refund_reason VARCHAR(300) NULL AFTER refund_status;');
    }
    if (!names.has('refund_received_status')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN refund_received_status VARCHAR(20) NULL AFTER refund_reason;');
    }
    if (!names.has('refund_applied_at')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN refund_applied_at DATETIME NULL AFTER refund_received_status;');
    }
    if (!names.has('refund_reviewed_at')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN refund_reviewed_at DATETIME NULL AFTER refund_applied_at;');
    }
    if (!names.has('refund_origin_status')) {
      await this.db.execute('ALTER TABLE market_orders ADD COLUMN refund_origin_status TINYINT UNSIGNED NULL AFTER refund_reviewed_at;');
    }
  }

  private async ensureReviewTable() {
    await this.ensureOrderColumns();
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS market_product_reviews (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        order_item_id BIGINT UNSIGNED NOT NULL,
        product_id BIGINT UNSIGNED NOT NULL,
        shop_id BIGINT UNSIGNED NULL,
        user_account VARCHAR(255) NOT NULL,
        user_name VARCHAR(120) NULL,
        rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
        content TEXT NOT NULL,
        reply_content TEXT NULL,
        reply_shop_name VARCHAR(120) NULL,
        replied_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_market_product_reviews_order_item (order_item_id),
        KEY idx_market_product_reviews_product (product_id, created_at),
        KEY idx_market_product_reviews_shop (shop_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );
  }

  private mapRow(row: OrderRow, items: OrderItemRow[]) {
    return {
      id: row.id,
      orderNo: row.order_no,
      account: row.user_account || String(row.user_id || ''),
      shop: row.shop_name || '默认店铺',
      product: this.productText(items),
      amount: Number(row.pay_amount || 0),
      payment: row.payment_method || (row.paid_at ? '已支付' : '未支付'),
      status: this.statusText(Number(row.status || 10)),
      refundStatus: this.refundStatusText(row.refund_status),
      refundReason: row.refund_reason || '',
      refundReceivedStatus: row.refund_received_status || '',
      refundAppliedAt: this.formatDate(row.refund_applied_at),
      refundReviewedAt: this.formatDate(row.refund_reviewed_at),
      address: this.addressText(row.receiver_snapshot),
      createdAt: this.formatDate(row.created_at),
      paidAt: this.formatDate(row.paid_at),
      shippedAt: this.formatDate(row.shipped_at),
      cancelledAt: this.formatDate(row.cancelled_at),
    };
  }

  private mapReview(row: ReviewRow) {
    return {
      id: row.id,
      orderNo: row.order_no,
      account: row.user_account,
      userName: row.user_name || row.user_account,
      product: row.product_name || '商品',
      shop: row.shop_name || '默认店铺',
      rating: Number(row.rating || 5),
      content: row.content,
      replyContent: row.reply_content || '',
      createdAt: this.formatDate(row.created_at),
      repliedAt: this.formatDate(row.replied_at),
    };
  }

  async list(authorization: string) {
    await this.ensureOrderColumns();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const params: any[] = [];
    let shopFilter = '';
    if (user.role !== 'admin') {
      shopFilter = ' AND s.username = ?';
      params.push(user.username);
    }

    const rows = await this.db.query<OrderRow>(
      `SELECT o.*,
              COALESCE(u.shop_name, u.nickname, u.username, s.username) AS shop_name
       FROM market_orders o
       LEFT JOIN market_shops s ON s.id = o.shop_id AND s.deleted_at IS NULL
       LEFT JOIN admin_users u ON u.username = s.username
       WHERE o.deleted_at IS NULL${shopFilter}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT 300;`,
      params,
    );
    const ids = rows.map((row) => row.id);
    const itemRows = ids.length
      ? await this.db.query<OrderItemRow>(
          `SELECT order_id, product_snapshot, quantity
           FROM market_order_items
           WHERE order_id IN (${ids.map(() => '?').join(',')})
           ORDER BY id ASC;`,
          ids,
        )
      : [];
    const itemsByOrder = itemRows.reduce<Record<number, OrderItemRow[]>>((acc, item) => {
      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push(item);
      return acc;
    }, {});

    return { status: 200, message: '获取成功', result: rows.map((row) => this.mapRow(row, itemsByOrder[row.id] || [])) };
  }

  async ship(authorization: string, body: any) {
    await this.ensureOrderColumns();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || 0);
    const orderNo = String(body.orderNo || '').trim();
    if (!id && !orderNo) throw new BadRequestException('订单ID不能为空');

    const whereSql = id ? 'o.id = ?' : 'o.order_no = ?';
    const rows = await this.db.query<OrderRow & { shop_username: string | null }>(
      `SELECT o.*, s.username AS shop_username
       FROM market_orders o
       LEFT JOIN market_shops s ON s.id = o.shop_id AND s.deleted_at IS NULL
       WHERE ${whereSql} AND o.deleted_at IS NULL
       LIMIT 1;`,
      [id || orderNo],
    );
    const order = rows[0];
    if (!order) throw new NotFoundException('订单不存在');
    if (user.role !== 'admin' && order.shop_username !== user.username) throw new UnauthorizedException('只能操作自己店铺的订单');
    if (Number(order.status) !== 20) throw new BadRequestException('只有已付款待发货订单可以发货');

    const result = await this.db.execute<ResultSetHeader>(
      'UPDATE market_orders SET status = 30, shipped_at = NOW() WHERE id = ? AND status = 20 AND deleted_at IS NULL;',
      [order.id],
    );
    if (result.affectedRows === 0) throw new BadRequestException('订单状态已变化，请刷新后重试');
    return { status: 200, message: '订单已发货', result: { id: order.id, orderNo: order.order_no, status: '待收货' } };
  }

  async cancel(authorization: string, body: any) {
    await this.ensureOrderColumns();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || 0);
    const orderNo = String(body.orderNo || '').trim();
    if (!id && !orderNo) throw new BadRequestException('订单ID不能为空');

    const whereSql = id ? 'o.id = ?' : 'o.order_no = ?';
    const rows = await this.db.query<OrderRow & { shop_username: string | null }>(
      `SELECT o.*, s.username AS shop_username
       FROM market_orders o
       LEFT JOIN market_shops s ON s.id = o.shop_id AND s.deleted_at IS NULL
       WHERE ${whereSql} AND o.deleted_at IS NULL
       LIMIT 1;`,
      [id || orderNo],
    );
    const order = rows[0];
    if (!order) throw new NotFoundException('订单不存在');
    if (user.role !== 'admin' && order.shop_username !== user.username) throw new UnauthorizedException('只能操作自己店铺的订单');
    if (Number(order.status) !== 10) throw new BadRequestException('只有待支付订单可以取消');

    const items = await this.db.query<OrderItemRow>(
      'SELECT id, order_id, product_id, sku_id, product_snapshot, quantity FROM market_order_items WHERE order_id = ? ORDER BY id ASC;',
      [order.id],
    );
    for (const item of items) {
      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) continue;
      if (item.sku_id) {
        await this.db.execute('UPDATE skus SET stock = stock + ? WHERE id = ?;', [quantity, item.sku_id]);
      }
      if (item.product_id) {
        await this.db.execute('UPDATE products SET total_stock = total_stock + ? WHERE id = ?;', [quantity, item.product_id]);
      }
    }

    const result = await this.db.execute<ResultSetHeader>(
      'UPDATE market_orders SET status = 50, cancelled_at = NOW() WHERE id = ? AND status = 10 AND deleted_at IS NULL;',
      [order.id],
    );
    if (result.affectedRows === 0) throw new BadRequestException('订单状态已变化，请刷新后重试');
    return { status: 200, message: '订单已取消', result: { id: order.id, orderNo: order.order_no, status: '已取消' } };
  }

  async delete(authorization: string, body: any) {
    await this.ensureOrderColumns();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || 0);
    const orderNo = String(body.orderNo || '').trim();
    if (!id && !orderNo) throw new BadRequestException('订单ID不能为空');

    const whereSql = id ? 'o.id = ?' : 'o.order_no = ?';
    const rows = await this.db.query<OrderRow & { shop_username: string | null }>(
      `SELECT o.*, s.username AS shop_username
       FROM market_orders o
       LEFT JOIN market_shops s ON s.id = o.shop_id AND s.deleted_at IS NULL
       WHERE ${whereSql} AND o.deleted_at IS NULL
       LIMIT 1;`,
      [id || orderNo],
    );
    const order = rows[0];
    if (!order) throw new NotFoundException('订单不存在');
    if (user.role !== 'admin' && order.shop_username !== user.username) throw new UnauthorizedException('只能操作自己店铺的订单');
    const result = await this.db.execute<ResultSetHeader>(
      'UPDATE market_orders SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL;',
      [order.id],
    );
    if (result.affectedRows === 0) throw new BadRequestException('订单状态已变化，请刷新后重试');
    return { status: 200, message: '订单已删除', result: { id: order.id, orderNo: order.order_no } };
  }

  async reviewRefund(authorization: string, body: any) {
    await this.ensureOrderColumns();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || 0);
    const orderNo = String(body.orderNo || '').trim();
    const action = String(body.action || '').trim();
    if (!id && !orderNo) throw new BadRequestException('订单ID不能为空');
    if (action !== 'approve' && action !== 'reject') throw new BadRequestException('请选择审核结果');

    const whereSql = id ? 'o.id = ?' : 'o.order_no = ?';
    const rows = await this.db.query<OrderRow & { shop_username: string | null }>(
      `SELECT o.*, s.username AS shop_username
       FROM market_orders o
       LEFT JOIN market_shops s ON s.id = o.shop_id AND s.deleted_at IS NULL
       WHERE ${whereSql} AND o.deleted_at IS NULL
       LIMIT 1;`,
      [id || orderNo],
    );
    const order = rows[0];
    if (!order) throw new NotFoundException('订单不存在');
    if (user.role !== 'admin' && order.shop_username !== user.username) throw new UnauthorizedException('只能审核自己店铺的订单');
    if (Number(order.status) !== 60 || Number(order.refund_status || 0) !== 1) throw new BadRequestException('只有商家审核中的售后订单可以审核');

    if (action === 'approve') {
      const result = await this.db.execute<ResultSetHeader>(
        'UPDATE market_orders SET status = 50, refund_status = 2, cancelled_at = NOW(), refund_reviewed_at = NOW() WHERE id = ? AND status = 60 AND refund_status = 1 AND deleted_at IS NULL;',
        [order.id],
      );
      if (result.affectedRows === 0) throw new BadRequestException('订单状态已变化，请刷新后重试');
      return { status: 200, message: '已同意退款', result: { id: order.id, orderNo: order.order_no, status: '已取消', refundStatus: '商家同意退款' } };
    }

    const result = await this.db.execute<ResultSetHeader>(
      'UPDATE market_orders SET status = 60, refund_status = 3, refund_reviewed_at = NOW() WHERE id = ? AND status = 60 AND refund_status = 1 AND deleted_at IS NULL;',
      [order.id],
    );
    if (result.affectedRows === 0) throw new BadRequestException('订单状态已变化，请刷新后重试');
    return { status: 200, message: '已拒绝退款', result: { id: order.id, orderNo: order.order_no, status: '售后', refundStatus: '商家拒绝退款' } };
  }

  async reviews(authorization: string) {
    await this.ensureReviewTable();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const params: any[] = [];
    let shopFilter = '';
    if (user.role !== 'admin') {
      shopFilter = ' AND s.username = ?';
      params.push(user.username);
    }
    const rows = await this.db.query<ReviewRow>(
      `SELECT r.*, o.order_no, p.name AS product_name,
              COALESCE(u.shop_name, u.nickname, u.username, s.username) AS shop_name
       FROM market_product_reviews r
       LEFT JOIN market_orders o ON o.id = r.order_id
       LEFT JOIN products p ON p.id = r.product_id
       LEFT JOIN market_shops s ON s.id = r.shop_id AND s.deleted_at IS NULL
       LEFT JOIN admin_users u ON u.username = s.username
       WHERE r.deleted_at IS NULL${shopFilter}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 300;`,
      params,
    );
    return { status: 200, message: '获取成功', result: rows.map((row) => this.mapReview(row)) };
  }

  async replyReview(authorization: string, body: any) {
    await this.ensureReviewTable();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || body.reviewId || 0);
    const replyContent = String(body.replyContent || body.content || '').trim();
    if (!id) throw new BadRequestException('评价ID不能为空');
    if (!replyContent) throw new BadRequestException('回复内容不能为空');
    if (replyContent.length > 500) throw new BadRequestException('回复内容不能超过 500 个字符');

    const rows = await this.db.query<{ id: number; shop_username: string | null; shop_name: string | null }>(
      `SELECT r.id, s.username AS shop_username, COALESCE(u.shop_name, u.nickname, u.username, s.username) AS shop_name
       FROM market_product_reviews r
       LEFT JOIN market_shops s ON s.id = r.shop_id AND s.deleted_at IS NULL
       LEFT JOIN admin_users u ON u.username = s.username
       WHERE r.id = ? AND r.deleted_at IS NULL
       LIMIT 1;`,
      [id],
    );
    const review = rows[0];
    if (!review) throw new NotFoundException('评价不存在');
    if (user.role !== 'admin' && review.shop_username !== user.username) throw new UnauthorizedException('只能回复自己店铺的评价');

    await this.db.execute<ResultSetHeader>(
      `UPDATE market_product_reviews
       SET reply_content = ?, reply_shop_name = ?, replied_at = NOW()
       WHERE id = ? AND deleted_at IS NULL;`,
      [replyContent, review.shop_name || user.shop_name || user.nickname || user.username, id],
    );
    return { status: 200, message: '回复成功', result: { id, replyContent } };
  }
}
