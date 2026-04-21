import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
  total_count: number;
  received_count: number;
  end_at: Date | string | null;
  status: number;
  created_at: Date | string;
};

@Injectable()
export class CouponService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private couponCode(id = 0) {
    return `CP${Date.now()}${id ? `-${id}` : ''}`;
  }

  private normalizeDate(value: any) {
    const text = String(value || '').trim();
    if (!text) return null;
    return text.replace('T', ' ').slice(0, 19);
  }

  private mapRow(row: CouponRow) {
    return {
      id: row.id,
      code: row.coupon_code,
      scope: row.product_id ? 'product' : 'shop',
      productId: row.product_id,
      productName: row.product_name || '',
      title: row.title,
      threshold: Number(row.threshold_amount || 0),
      discount: Number(row.discount_amount || 0),
      stackable: Number(row.is_stackable || 0) === 1,
      oncePerUser: Number(row.is_once_per_user || 0) === 1,
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

  async list(authorization: string) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const shop = await this.ensureMerchantShop(user);
    const rows = await this.db.query<CouponRow>(
      `SELECT c.*, p.name AS product_name
       FROM market_coupons c
       LEFT JOIN products p ON p.id = c.product_id
       WHERE c.shop_id = ? AND c.deleted_at IS NULL
       ORDER BY c.id DESC;`,
      [shop.id],
    );
    return { status: 200, message: '获取成功', result: rows.map((item) => this.mapRow(item)) };
  }

  async save(authorization: string, body: any) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const shop = await this.ensureMerchantShop(user);
    const id = Number(body.id || 0);
    const scope = body.scope === 'product' ? 'product' : 'shop';
    const productId = scope === 'product' ? Number(body.productId || 0) : null;
    const title = String(body.title || '').trim();
    const threshold = Math.max(0, Number(body.threshold || 0));
    const discount = Math.max(0, Number(body.discount || 0));
    const stackable = body.stackable ? 1 : 0;
    const oncePerUser = scope === 'shop' && body.oncePerUser ? 1 : 0;
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
        [productId, shop.id],
      );
      if (!products.length) throw new BadRequestException('只能选择自己店铺的商品');
    }

    if (id > 0) {
      const existing = await this.db.query<{ id: number; received_count: number }>(
        'SELECT id, received_count FROM market_coupons WHERE id = ? AND shop_id = ? AND deleted_at IS NULL LIMIT 1;',
        [id, shop.id],
      );
      if (!existing[0]) throw new NotFoundException('优惠券不存在');
      if (totalCount > 0 && Number(existing[0].received_count || 0) > totalCount) throw new BadRequestException('数量不能小于已领取数量');
      await this.db.execute(
        `UPDATE market_coupons
         SET product_id = ?, title = ?, threshold_amount = ?, discount_amount = ?, is_stackable = ?, is_once_per_user = ?, total_count = ?, end_at = ?, status = ?
         WHERE id = ? AND shop_id = ? AND deleted_at IS NULL;`,
        [productId, title, threshold, discount, stackable, oncePerUser, totalCount, endAt, status, id, shop.id],
      );
      return { status: 200, message: '保存成功', result: { id } };
    }

    const result = await this.db.execute<ResultSetHeader>(
      `INSERT INTO market_coupons
       (coupon_code, shop_id, product_id, title, threshold_amount, discount_amount, is_stackable, is_once_per_user, total_count, end_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [this.couponCode(), shop.id, productId, title, threshold, discount, stackable, oncePerUser, totalCount, endAt, status],
    );
    return { status: 200, message: '创建成功', result: { id: result.insertId } };
  }

  async remove(authorization: string, body: any) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const shop = await this.ensureMerchantShop(user);
    const id = Number(body.id || 0);
    if (!id) throw new BadRequestException('优惠券ID不能为空');
    const result = await this.db.execute<ResultSetHeader>(
      'UPDATE market_coupons SET deleted_at = NOW() WHERE id = ? AND shop_id = ? AND deleted_at IS NULL;',
      [id, shop.id],
    );
    if (!result.affectedRows) throw new NotFoundException('优惠券不存在');
    return { status: 200, message: '删除成功' };
  }
}
