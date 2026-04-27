import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { toUploadPublicUrl } from '../common/upload-path.util';
import { DatabaseService } from '../database/database.service';

type ServiceSessionRow = {
  id: number;
  session_no: string;
  user_account: string | null;
  shop_id: number | null;
  product_id: number | null;
  shop_name: string | null;
  product_name: string | null;
  product_image_url: string | null;
  product_price: string | number | null;
  buyer_order_no: string | null;
  buyer_order_status_code: number | null;
  buyer_refund_status_code: number | null;
  last_message: string | null;
  status: number;
  updated_at: Date | string;
};

type ServiceOrderTag = {
  orderId: number;
  orderNo: string;
  status: string;
  createdAt: string;
};

type ServiceOrderTagRow = {
  id: number;
  order_no: string;
  status: number;
  refund_status: number | null;
  created_at: Date | string;
  user_account: string | null;
  shop_id: number | null;
};

type ServiceMessageRow = {
  id: number;
  session_id: number;
  sender_type: number;
  content: string | null;
  payload: string | Record<string, any> | null;
  created_at: Date | string;
};

@Injectable()
export class ServiceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
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

  private buyerOrderStatusText(orderStatus: number | null | undefined, refundStatus: number | null | undefined) {
    const status = Number(orderStatus || 0);
    const refund = Number(refundStatus || 0);
    if (!status) return '未购买';
    if (status === 10) return '未付款';
    if (status === 20 || status === 30) return '已付款';
    if (status === 40) return '已完成';
    if (status === 50) return '已取消';
    if (status === 60) {
      if (refund === 1) return '申请售后（商家审核中）';
      if (refund === 2) return '申请售后（商家同意退款）';
      if (refund === 3) return '申请售后（商家拒绝退款）';
      return '申请售后';
    }
    return '未购买';
  }

  private async ensureTables() {
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS market_service_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        session_no VARCHAR(64) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
        user_account VARCHAR(255) NULL,
        shop_id BIGINT UNSIGNED NULL,
        product_id BIGINT UNSIGNED NULL,
        status TINYINT UNSIGNED NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_market_service_sessions_session_no (session_no),
        KEY idx_market_service_sessions_user_status (user_account, status, updated_at),
        KEY idx_market_service_sessions_shop_status (shop_id, status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS market_service_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        session_id BIGINT UNSIGNED NOT NULL,
        sender_type TINYINT UNSIGNED NOT NULL,
        sender_id BIGINT UNSIGNED NULL,
        message_type TINYINT UNSIGNED NOT NULL DEFAULT 1,
        content TEXT NULL,
        payload JSON NULL,
        is_read TINYINT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_market_service_messages_session_time (session_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );
    const columns = await this.db.query<{ Field: string; Null: string; Default: string | null }>('SHOW COLUMNS FROM market_service_sessions;');
    const names = new Set(columns.map((item) => item.Field));
    if (!names.has('user_account')) {
      await this.db.execute('ALTER TABLE market_service_sessions ADD COLUMN user_account VARCHAR(255) NULL AFTER user_id;');
    }
    const userId = columns.find((item) => item.Field === 'user_id');
    if (userId && !String(userId.Default ?? '').length && String(userId.Null).toUpperCase() === 'NO') {
      await this.db.execute('ALTER TABLE market_service_sessions MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL DEFAULT 0;');
    }
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS market_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_no VARCHAR(64) NOT NULL,
        user_account VARCHAR(255) NULL,
        shop_id BIGINT UNSIGNED NULL,
        refund_status TINYINT UNSIGNED NULL,
        status TINYINT UNSIGNED NOT NULL DEFAULT 10,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_market_order_items_order (order_id),
        KEY idx_market_order_items_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );
  }

  private mapSession(row: ServiceSessionRow) {
    const orderTags = [] as ServiceOrderTag[];
    return {
      id: row.id,
      sessionNo: row.session_no,
      account: row.user_account || '',
      shopId: row.shop_id == null ? null : Number(row.shop_id),
      shop: row.shop_name || '店铺',
      product: row.product_name || '',
      productImageUrl: toUploadPublicUrl(row.product_image_url || '', 'product-images'),
      productPrice: Number(row.product_price || 0),
      buyerOrderNo: row.buyer_order_no || '',
      buyerOrderStatus: this.buyerOrderStatusText(row.buyer_order_status_code, row.buyer_refund_status_code),
      orderTags,
      lastMessage: row.last_message || '',
      status: Number(row.status || 1) === 1 ? '进行中' : '已关闭',
      updatedAt: this.formatDate(row.updated_at),
    };
  }

  private mapOrderTag(row: ServiceOrderTagRow): ServiceOrderTag {
    return {
      orderId: Number(row.id || 0),
      orderNo: String(row.order_no || ''),
      status: this.buyerOrderStatusText(Number(row.status || 10), row.refund_status),
      createdAt: this.formatDate(row.created_at),
    };
  }

  private async attachOrderTagsToSessions(
    sessions: Array<ReturnType<ServiceService['mapSession']>>,
  ) {
    if (!sessions.length) return sessions;
    const pairs = new Map<string, { account: string; shopId: number }>();
    sessions.forEach((session) => {
      const account = String(session.account || '').trim();
      const shopId = Number(session.shopId || 0);
      if (!account || !shopId) return;
      const key = `${account}__${shopId}`;
      if (!pairs.has(key)) pairs.set(key, { account, shopId });
    });
    const tagMap = new Map<string, ServiceOrderTag[]>();
    for (const [key, pair] of pairs) {
      const rows = await this.db.query<ServiceOrderTagRow>(
        `SELECT id, order_no, status, refund_status, created_at, user_account, shop_id
         FROM market_orders
         WHERE deleted_at IS NULL AND user_account = ? AND shop_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 20;`,
        [pair.account, pair.shopId],
      );
      tagMap.set(key, rows.map((row) => this.mapOrderTag(row)));
    }
    return sessions.map((session) => {
      const account = String(session.account || '').trim();
      const shopId = Number(session.shopId || 0);
      const key = `${account}__${shopId}`;
      const orderTags = tagMap.get(key) || [];
      const latest = orderTags[0];
      return {
        ...session,
        buyerOrderNo: session.buyerOrderNo || latest?.orderNo || '',
        buyerOrderStatus: session.buyerOrderStatus && session.buyerOrderStatus !== '未购买'
          ? session.buyerOrderStatus
          : latest?.status || session.buyerOrderStatus,
        orderTags,
      };
    });
  }

  private async consolidateServiceSessionsForScope(shopUsername?: string) {
    const params: any[] = [];
    const scopeFilter = shopUsername ? ' AND ms.username = ?' : '';
    if (shopUsername) params.push(shopUsername);
    const rows = await this.db.query<Array<{ user_account: string | null; shop_id: number | null }>[number]>(
      `SELECT s.user_account, s.shop_id
       FROM market_service_sessions s
       LEFT JOIN market_shops ms ON ms.id = s.shop_id AND ms.deleted_at IS NULL
       WHERE s.status = 1 AND s.user_account IS NOT NULL AND s.shop_id IS NOT NULL${scopeFilter}
       GROUP BY s.user_account, s.shop_id
       HAVING COUNT(1) > 1;`,
      params,
    );
    for (const row of rows) {
      const account = String(row.user_account || '').trim();
      const shopId = Number(row.shop_id || 0);
      if (!account || !shopId) continue;
      const group = await this.db.query<Array<{ id: number }>[number]>(
        `SELECT id
         FROM market_service_sessions
         WHERE status = 1 AND user_account = ? AND shop_id = ?
         ORDER BY updated_at DESC, id DESC;`,
        [account, shopId],
      );
      if (group.length <= 1) continue;
      const masterId = Number(group[0].id || 0);
      const slaveIds = group.slice(1).map((item) => Number(item.id || 0)).filter((id) => id > 0);
      if (!masterId || !slaveIds.length) continue;
      await this.db.execute(
        `UPDATE market_service_messages
         SET session_id = ?
         WHERE session_id IN (${slaveIds.map(() => '?').join(',')});`,
        [masterId, ...slaveIds],
      );
      await this.db.execute(
        `UPDATE market_service_sessions
         SET status = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${slaveIds.map(() => '?').join(',')});`,
        slaveIds,
      );
    }
  }

  private mapMessage(row: ServiceMessageRow) {
    return {
      id: row.id,
      sessionId: row.session_id,
      sender: Number(row.sender_type) === 2 ? 'merchant' : Number(row.sender_type) === 3 ? 'ai' : 'user',
      content: row.content || '',
      payload: this.parseJson(row.payload),
      createdAt: this.formatDate(row.created_at),
    };
  }

  private async assertSessionAccess(authorization: string, sessionId: number) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const rows = await this.db.query<{ id: number; shop_username: string | null }>(
      `SELECT s.id, ms.username AS shop_username
       FROM market_service_sessions s
       LEFT JOIN market_shops ms ON ms.id = s.shop_id AND ms.deleted_at IS NULL
       WHERE s.id = ?
       LIMIT 1;`,
      [sessionId],
    );
    const session = rows[0];
    if (!session) throw new NotFoundException('客服会话不存在');
    if (user.role !== 'admin' && session.shop_username !== user.username) throw new UnauthorizedException('只能处理自己店铺的客服会话');
    return user;
  }

  async sessions(authorization: string) {
    await this.ensureTables();
    const user = await this.authService.getUserByToken(this.token(authorization));
    if (user.role !== 'admin') {
      await this.consolidateServiceSessionsForScope(user.username);
    } else {
      await this.consolidateServiceSessionsForScope();
    }
    const params: any[] = [];
    let shopFilter = '';
    if (user.role !== 'admin') {
      shopFilter = ' AND ms.username = ?';
      params.push(user.username);
    }
    const rows = await this.db.query<ServiceSessionRow>(
      `SELECT s.*,
              COALESCE(u.shop_name, u.nickname, u.username, ms.username) AS shop_name,
              p.name AS product_name,
              p.main_image_url AS product_image_url,
              p.min_price AS product_price,
              (
                SELECT mo.order_no
                FROM market_orders mo
                WHERE mo.deleted_at IS NULL
                  AND mo.user_account = s.user_account
                  AND mo.shop_id = s.shop_id
                  AND (
                    s.product_id IS NULL
                    OR EXISTS (
                      SELECT 1
                      FROM market_order_items moi
                      WHERE moi.order_id = mo.id
                        AND moi.product_id = s.product_id
                    )
                  )
                ORDER BY mo.created_at DESC, mo.id DESC
                LIMIT 1
              ) AS buyer_order_no,
              (
                SELECT mo.status
                FROM market_orders mo
                WHERE mo.deleted_at IS NULL
                  AND mo.user_account = s.user_account
                  AND mo.shop_id = s.shop_id
                  AND (
                    s.product_id IS NULL
                    OR EXISTS (
                      SELECT 1
                      FROM market_order_items moi
                      WHERE moi.order_id = mo.id
                        AND moi.product_id = s.product_id
                    )
                  )
                ORDER BY mo.created_at DESC, mo.id DESC
                LIMIT 1
              ) AS buyer_order_status_code,
              (
                SELECT mo.refund_status
                FROM market_orders mo
                WHERE mo.deleted_at IS NULL
                  AND mo.user_account = s.user_account
                  AND mo.shop_id = s.shop_id
                  AND (
                    s.product_id IS NULL
                    OR EXISTS (
                      SELECT 1
                      FROM market_order_items moi
                      WHERE moi.order_id = mo.id
                        AND moi.product_id = s.product_id
                    )
                  )
                ORDER BY mo.created_at DESC, mo.id DESC
                LIMIT 1
              ) AS buyer_refund_status_code,
              lm.content AS last_message
       FROM market_service_sessions s
       LEFT JOIN market_shops ms ON ms.id = s.shop_id AND ms.deleted_at IS NULL
       LEFT JOIN admin_users u ON u.username = ms.username
       LEFT JOIN products p ON p.id = s.product_id
       LEFT JOIN market_service_messages lm ON lm.id = (
         SELECT id FROM market_service_messages WHERE session_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1
       )
       WHERE s.status = 1${shopFilter}
       ORDER BY s.updated_at DESC, s.id DESC
       LIMIT 300;`,
      params,
    );
    const mapped = rows.map((row) => this.mapSession(row));
    const withTags = await this.attachOrderTagsToSessions(mapped);
    return { status: 200, message: '获取成功', result: withTags };
  }

  async messages(authorization: string, sessionId: number) {
    await this.ensureTables();
    if (!sessionId) throw new BadRequestException('会话ID不能为空');
    await this.assertSessionAccess(authorization, sessionId);
    const rows = await this.db.query<ServiceMessageRow>(
      'SELECT * FROM market_service_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC;',
      [sessionId],
    );
    return { status: 200, message: '获取成功', result: rows.map((row) => this.mapMessage(row)) };
  }

  async reply(authorization: string, body: any) {
    await this.ensureTables();
    const sessionId = Number(body.sessionId || body.id || 0);
    const content = String(body.content || '').trim();
    if (!sessionId) throw new BadRequestException('会话ID不能为空');
    if (!content) throw new BadRequestException('回复内容不能为空');
    if (content.length > 500) throw new BadRequestException('回复内容不能超过 500 个字符');
    const user = await this.assertSessionAccess(authorization, sessionId);
    const result = await this.db.execute<any>(
      'INSERT INTO market_service_messages (session_id, sender_type, sender_id, message_type, content) VALUES (?, 2, ?, 1, ?);',
      [sessionId, user.id, content],
    );
    await this.db.execute('UPDATE market_service_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [sessionId]);
    return { status: 200, message: '回复成功', result: { id: Number(result.insertId || 0), sessionId, content } };
  }

  async deleteSession(authorization: string, body: any) {
    await this.ensureTables();
    const sessionId = Number(body?.sessionId || body?.id || 0);
    if (!sessionId) throw new BadRequestException('会话ID不能为空');
    await this.assertSessionAccess(authorization, sessionId);
    const result = await this.db.execute<any>(
      'UPDATE market_service_sessions SET status = 0 WHERE id = ? AND status = 1;',
      [sessionId],
    );
    if (Number(result?.affectedRows || 0) === 0) throw new NotFoundException('会话不存在或已删除');
    return { status: 200, message: '删除成功', result: { sessionId } };
  }
}
