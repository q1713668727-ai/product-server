import { BadRequestException, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

type ShopRow = {
  id: number | null;
  username: string;
  nickname: string | null;
  role: string;
  shop_name: string | null;
  service_level: string | null;
  fans_count: number | null;
  sales_count: number | null;
  rating: string | number | null;
  status: number | null;
};

@Injectable()
export class ShopService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private mapRow(row: ShopRow) {
    return {
      id: row.id || undefined,
      code: row.username,
      username: row.username,
      nickname: row.nickname || row.username,
      role: row.role || 'merchant',
      name: row.shop_name || row.nickname || row.username,
      serviceLevel: row.service_level || '金牌客服',
      fans: Number(row.fans_count || 0),
      sales: Number(row.sales_count || 0),
      rating: Number(row.rating || 5),
      status: Number(row.status ?? 1) === 1 ? '启用' : '停用',
    };
  }

  async list(authorization: string) {
    await this.authService.requireAdmin(this.token(authorization));
    const rows = await this.db.query<ShopRow>(
      `SELECT s.id, u.username, u.nickname, u.role, u.shop_name, s.service_level, s.fans_count, s.sales_count, s.rating, s.status
       FROM admin_users u
       LEFT JOIN market_shops s ON s.username = u.username AND s.deleted_at IS NULL
       WHERE u.role = 'merchant'
       ORDER BY u.id DESC;`,
    );
    return { status: 200, message: '获取成功', result: rows.map((item) => this.mapRow(item)) };
  }

  async save(authorization: string, body: any) {
    await this.authService.requireAdmin(this.token(authorization));
    const username = String(body.username || body.code || '').trim();
    const serviceLevel = String(body.serviceLevel || '').trim();
    const fans = Math.max(0, Number(body.fans || 0));
    const sales = Math.max(0, Number(body.sales || 0));
    const rating = Math.min(5, Math.max(0, Number(body.rating || 5)));
    const status = body.status === '停用' || body.status === 0 ? 0 : 1;

    if (!username) throw new BadRequestException('账号不能为空');

    const accounts = await this.db.query<{ id: number }>(
      "SELECT id FROM admin_users WHERE username = ? AND role = 'merchant' LIMIT 1;",
      [username],
    );
    if (!accounts.length) throw new BadRequestException('商家账号不存在');

    const exists = await this.db.query<{ id: number }>('SELECT id FROM market_shops WHERE username = ? AND deleted_at IS NULL LIMIT 1;', [username]);
    if (exists.length) {
      await this.db.execute<ResultSetHeader>(
        `UPDATE market_shops
         SET service_level = ?, fans_count = ?, sales_count = ?, rating = ?, status = ?
         WHERE username = ? AND deleted_at IS NULL;`,
        [serviceLevel || null, fans, sales, rating, status, username],
      );
      return { status: 200, message: '保存成功', result: { id: exists[0].id } };
    }

    const result = await this.db.execute<ResultSetHeader>(
      `INSERT INTO market_shops (username, service_level, fans_count, sales_count, rating, status)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [username, serviceLevel || null, fans, sales, rating, status],
    );
    return { status: 200, message: '创建成功', result: { id: result.insertId } };
  }
}
