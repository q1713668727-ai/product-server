import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResultSetHeader } from 'mysql2';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

type CouponRow = {
  id: number;
  coupon_code: string;
  shop_id: number | null;
  product_id: number | null;
  product_name: string | null;
  title: string;
  threshold_amount: string | number;
  discount_amount: string | number;
  is_stackable: number;
  is_once_per_user: number;
  coupon_level?: 'product' | 'shop' | 'platform' | null;
  receive_mode?: 'once' | 'unlimited' | 'grant_only' | null;
  total_count: number;
  received_count: number;
  end_at: Date | string | null;
  status: number;
  created_at: Date | string;
};

@Injectable()
export class CouponService {
  private readonly clientDb: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const configured = String(configService.get('CLIENT_DB_NAME') || configService.get('APP_DB_NAME') || 'server').trim();
    this.clientDb = /^[a-zA-Z0-9_]+$/.test(configured) ? configured : 'server';
  }

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private clientTable(name: string) {
    return `\`${this.clientDb}\`.\`${name}\``;
  }

  private couponCode(id = 0) {
    return `CP${Date.now()}${id ? `-${id}` : ''}`;
  }

  private normalizeDate(value: any) {
    const text = String(value || '').trim();
    if (!text) return null;
    return text.replace('T', ' ').slice(0, 19);
  }

  private normalizeReceiveMode(value: any, oncePerUser = false) {
    const mode = String(value || '').trim();
    if (mode === 'grant_only') return 'grant_only';
    if (mode === 'unlimited') return 'unlimited';
    if (mode === 'once') return 'once';
    return oncePerUser ? 'once' : 'unlimited';
  }

  private normalizeCouponLevel(value: any, row?: Pick<CouponRow, 'shop_id' | 'product_id'>) {
    const level = String(value || '').trim();
    if (level === 'product' || level === 'shop' || level === 'platform') return level;
    return row?.product_id ? 'product' : row?.shop_id ? 'shop' : 'platform';
  }

  private async ensureCouponReceiveModeColumn() {
    const columns = await this.db.query<any>('SHOW COLUMNS FROM `market_coupons`;');
    const names = new Set(columns.map((item) => item.Field));
    if (!names.has('coupon_level')) {
      await this.db.execute(
        "ALTER TABLE `market_coupons` ADD COLUMN `coupon_level` VARCHAR(24) NOT NULL DEFAULT 'shop' COMMENT '优惠券层级：product商品 shop店铺 platform平台' AFTER `is_once_per_user`;",
      );
      await this.db.execute(
        "UPDATE `market_coupons` SET `coupon_level` = CASE WHEN `product_id` IS NOT NULL THEN 'product' WHEN `shop_id` IS NOT NULL THEN 'shop' ELSE 'platform' END;",
      );
    }
    if (!names.has('receive_mode')) {
      await this.db.execute(
        "ALTER TABLE `market_coupons` ADD COLUMN `receive_mode` VARCHAR(24) NOT NULL DEFAULT 'unlimited' COMMENT '领取方式：once单用户一次 unlimited不限领取 grant_only仅后台发放' AFTER `coupon_level`;",
      );
      await this.db.execute(
        "UPDATE `market_coupons` SET `receive_mode` = CASE WHEN `is_once_per_user` = 1 THEN 'once' ELSE 'unlimited' END;",
      );
    }
  }

  private mapRow(row: CouponRow) {
    const scope = this.normalizeCouponLevel(row.coupon_level, row);
    const receiveMode = this.normalizeReceiveMode(row.receive_mode, Number(row.is_once_per_user || 0) === 1);
    return {
      id: row.id,
      code: row.coupon_code,
      scope,
      couponLevel: scope,
      productId: row.product_id,
      productName: row.product_name || '',
      title: row.title,
      threshold: Number(row.threshold_amount || 0),
      discount: Number(row.discount_amount || 0),
      stackable: Number(row.is_stackable || 0) === 1,
      oncePerUser: receiveMode === 'once',
      receiveMode,
      totalCount: Number(row.total_count || 0),
      receivedCount: Number(row.received_count || 0),
      unlimitedCount: Number(row.total_count || 0) === 0,
      endAt: row.end_at ? String(row.end_at).replace('T', ' ').slice(0, 19) : '',
      unlimitedTime: !row.end_at,
      status: Number(row.status || 0) === 1 ? '启用' : '停用',
      createdAt: String(row.created_at || '').replace('T', ' ').slice(0, 19),
    };
  }

  private async ensureMerchantShop(user: any) {
    if (user.role !== 'merchant') throw new UnauthorizedException('只有普通商家可以维护优惠券');
    const rows = await this.db.query<{ id: number }>(
      'SELECT id FROM market_shops WHERE username = ? AND deleted_at IS NULL LIMIT 1;',
      [user.username],
    );
    if (rows[0]) return rows[0];
    const result = await this.db.execute<ResultSetHeader>(
      'INSERT INTO market_shops (username, service_level, status) VALUES (?, ?, 1);',
      [user.username, '金牌客服'],
    );
    return { id: result.insertId };
  }

  private async couponOwner(user: any) {
    if (user.role === 'admin') return { scope: 'platform' as const, shopId: null as number | null };
    const shop = await this.ensureMerchantShop(user);
    return { scope: 'merchant' as const, shopId: shop.id };
  }

  private normalizeClaimedCoupons(value: any) {
    let raw = value;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw || '[]');
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => ({
        couponId: Number(item?.couponId || item?.id || 0),
        claimedAt: Number(item?.claimedAt || Date.now()),
      }))
      .filter((item) => Number.isFinite(item.couponId) && item.couponId > 0);
  }

  private async ensureClientOrderCouponColumn() {
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS ${this.clientTable('order')} (
        \`account\` VARCHAR(255) NOT NULL,
        \`market_coupons\` JSON NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`account\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    );
    const columns = await this.db.query<any>(`SHOW COLUMNS FROM ${this.clientTable('order')};`);
    const names = new Set(columns.map((item) => item.Field));
    if (!names.has('market_coupons')) await this.db.execute(`ALTER TABLE ${this.clientTable('order')} ADD COLUMN \`market_coupons\` JSON NULL;`);
    if (!names.has('created_at')) await this.db.execute(`ALTER TABLE ${this.clientTable('order')} ADD COLUMN \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
    if (!names.has('updated_at')) await this.db.execute(`ALTER TABLE ${this.clientTable('order')} ADD COLUMN \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;`);
  }

  async list(authorization: string) {
    await this.ensureCouponReceiveModeColumn();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const owner = await this.couponOwner(user);
    const where = owner.scope === 'platform' ? 'c.shop_id IS NULL' : 'c.shop_id = ?';
    const params = owner.scope === 'platform' ? [] : [owner.shopId];
    const rows = await this.db.query<CouponRow>(
      `SELECT c.*, p.name AS product_name
       FROM market_coupons c
       LEFT JOIN products p ON p.id = c.product_id
       WHERE ${where} AND c.deleted_at IS NULL
       ORDER BY c.id DESC;`,
      params,
    );
    return { status: 200, message: '获取成功', result: rows.map((item) => this.mapRow(item)) };
  }

  async save(authorization: string, body: any) {
    await this.ensureCouponReceiveModeColumn();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const owner = await this.couponOwner(user);
    const id = Number(body.id || 0);
    const scope = owner.scope === 'platform' ? 'platform' : body.scope === 'product' ? 'product' : 'shop';
    const productId = scope === 'product' ? Number(body.productId || 0) : null;
    const shopId = owner.scope === 'platform' ? null : owner.shopId;
    const title = String(body.title || '').trim();
    const threshold = Math.max(0, Number(body.threshold || 0));
    const discount = Math.max(0, Number(body.discount || 0));
    const stackable = body.stackable ? 1 : 0;
    const receiveMode = scope === 'platform'
      ? this.normalizeReceiveMode(body.receiveMode, Boolean(body.oncePerUser))
      : this.normalizeReceiveMode('', Boolean(body.oncePerUser));
    const oncePerUser = (scope === 'shop' || scope === 'platform') && receiveMode === 'once' ? 1 : 0;
    const totalCount = body.unlimitedCount ? 0 : Math.max(0, Number(body.totalCount || 0));
    const endAt = body.unlimitedTime ? null : this.normalizeDate(body.endAt);
    const status = body.status === '停用' || body.status === 0 ? 0 : 1;

    if (!title) throw new BadRequestException('优惠券名称不能为空');
    if (discount <= 0) throw new BadRequestException('优惠金额必须大于 0');
    if (scope === 'product' && !productId) throw new BadRequestException('请选择指定商品');
    if (!body.unlimitedCount && totalCount <= 0) throw new BadRequestException('优惠券数量必须大于 0，或选择无限数量');
    if (!body.unlimitedTime && !endAt) throw new BadRequestException('请选择失效时间，或选择不限时间');

    if (productId) {
      const products = await this.db.query<{ id: number }>(
        'SELECT id FROM products WHERE id = ? AND shop_id = ? AND deleted_at IS NULL LIMIT 1;',
        [productId, shopId],
      );
      if (!products.length) throw new BadRequestException('只能选择自己店铺的商品');
    }

    if (id > 0) {
      const ownerWhere = owner.scope === 'platform' ? 'shop_id IS NULL' : 'shop_id = ?';
      const ownerParams = owner.scope === 'platform' ? [id] : [id, shopId];
      const existing = await this.db.query<{ id: number; received_count: number }>(
        `SELECT id, received_count FROM market_coupons WHERE id = ? AND ${ownerWhere} AND deleted_at IS NULL LIMIT 1;`,
        ownerParams,
      );
      if (!existing[0]) throw new NotFoundException('优惠券不存在');
      if (totalCount > 0 && Number(existing[0].received_count || 0) > totalCount) throw new BadRequestException('数量不能小于已领取数量');
      await this.db.execute(
        `UPDATE market_coupons
         SET product_id = ?, title = ?, threshold_amount = ?, discount_amount = ?, is_stackable = ?, is_once_per_user = ?, coupon_level = ?, receive_mode = ?, total_count = ?, end_at = ?, status = ?
         WHERE id = ? AND ${ownerWhere} AND deleted_at IS NULL;`,
        [...[productId, title, threshold, discount, stackable, oncePerUser, scope, receiveMode, totalCount, endAt, status], ...ownerParams],
      );
      return { status: 200, message: '保存成功', result: { id } };
    }

    const result = await this.db.execute<ResultSetHeader>(
      `INSERT INTO market_coupons
       (coupon_code, shop_id, product_id, title, threshold_amount, discount_amount, is_stackable, is_once_per_user, coupon_level, receive_mode, total_count, end_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [this.couponCode(), shopId, productId, title, threshold, discount, stackable, oncePerUser, scope, receiveMode, totalCount, endAt, status],
    );
    return { status: 200, message: '创建成功', result: { id: result.insertId } };
  }

  async remove(authorization: string, body: any) {
    await this.ensureCouponReceiveModeColumn();
    const user = await this.authService.getUserByToken(this.token(authorization));
    const owner = await this.couponOwner(user);
    const id = Number(body.id || 0);
    if (!id) throw new BadRequestException('优惠券ID不能为空');
    const ownerWhere = owner.scope === 'platform' ? 'shop_id IS NULL' : 'shop_id = ?';
    const params = owner.scope === 'platform' ? [id] : [id, owner.shopId];
    const result = await this.db.execute<ResultSetHeader>(
      `UPDATE market_coupons SET deleted_at = NOW() WHERE id = ? AND ${ownerWhere} AND deleted_at IS NULL;`,
      params,
    );
    if (!result.affectedRows) throw new NotFoundException('优惠券不存在');
    return { status: 200, message: '删除成功' };
  }

  async grant(authorization: string, body: any) {
    await this.ensureCouponReceiveModeColumn();
    const user = await this.authService.getUserByToken(this.token(authorization));
    if (user.role !== 'admin') throw new UnauthorizedException('需要管理员权限');

    const couponId = Number(body.id || body.couponId || 0);
    const account = String(body.account || '').trim();
    if (!couponId) throw new BadRequestException('优惠券ID不能为空');
    if (!account) throw new BadRequestException('请输入用户账号');

    const users = await this.db.query<{ account: string }>(
      `SELECT account FROM ${this.clientTable('login')} WHERE account = ? LIMIT 1;`,
      [account],
    );
    if (!users.length) throw new NotFoundException('用户账号不存在');

    const coupons = await this.db.query<CouponRow>(
      `SELECT c.*, p.name AS product_name
       FROM market_coupons c
       LEFT JOIN products p ON p.id = c.product_id
       WHERE c.id = ? AND c.shop_id IS NULL AND c.product_id IS NULL AND c.deleted_at IS NULL AND c.status = 1
         AND (c.end_at IS NULL OR c.end_at >= NOW())
       LIMIT 1;`,
      [couponId],
    );
    const coupon = coupons[0];
    if (!coupon) throw new NotFoundException('平台优惠券不存在或已失效');

    await this.ensureClientOrderCouponColumn();
    await this.db.execute(`INSERT IGNORE INTO ${this.clientTable('order')} (\`account\`, \`market_coupons\`) VALUES (?, JSON_ARRAY());`, [account]);
    const rows = await this.db.query<any>(`SELECT \`market_coupons\` FROM ${this.clientTable('order')} WHERE \`account\` = ? LIMIT 1;`, [account]);
    const claimed = this.normalizeClaimedCoupons(rows[0]?.market_coupons);
    if (claimed.some((item) => item.couponId === couponId)) {
      return { status: 200, message: '该用户已拥有此优惠券', result: this.mapRow(coupon) };
    }

    const totalCount = Number(coupon.total_count || 0);
    const receivedCount = Number(coupon.received_count || 0);
    if (totalCount > 0 && receivedCount >= totalCount) throw new BadRequestException('优惠券已发完');

    const updateResult = await this.db.execute<ResultSetHeader>(
      `UPDATE market_coupons
       SET received_count = received_count + 1
       WHERE id = ? AND shop_id IS NULL AND product_id IS NULL AND deleted_at IS NULL AND status = 1
         AND (end_at IS NULL OR end_at >= NOW()) AND (total_count = 0 OR received_count < total_count);`,
      [couponId],
    );
    if (!updateResult.affectedRows) throw new BadRequestException('优惠券已发完');

    const next = [{ couponId, claimedAt: Date.now() }, ...claimed];
    await this.db.execute(
      `UPDATE ${this.clientTable('order')} SET \`market_coupons\` = ?, \`updated_at\` = CURRENT_TIMESTAMP WHERE \`account\` = ?;`,
      [JSON.stringify(next), account],
    );
    return { status: 200, message: '发放成功', result: this.mapRow({ ...coupon, received_count: receivedCount + 1 }) };
  }
}
