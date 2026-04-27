import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ResultSetHeader } from 'mysql2';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { toStoredUploadValue, toUploadPublicUrl } from '../common/upload-path.util';

type AdminRole = 'admin' | 'merchant';

type AdminUserRow = {
  id: number;
  username: string;
  password_hash?: string;
  nickname: string | null;
  role: AdminRole;
  shop_id: number | null;
  shop_name: string | null;
  shop_avatar_url: string | null;
  shop_description: string | null;
  permissions: string | null;
  status: number;
  auth_token?: string | null;
  token_expire_at?: Date | null;
  last_login_at: Date | null;
  created_at: Date;
};

type AuthUser = {
  id: number;
  username: string;
  nickname: string;
  role: AdminRole;
  shopId: number | null;
  shopName: string;
  shopAvatarUrl: string;
  shopDescription: string;
  status: number;
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  private normalizeRole(value: any): AdminRole {
    return String(value || '').trim() === 'admin' ? 'admin' : 'merchant';
  }

  private defaultPermissions(role: AdminRole) {
    if (role === 'admin') {
      return ['merchant:manage', 'category:manage', 'product:manage', 'order:view', 'service:view', 'shop:finance'];
    }
    return ['product:shelf', 'product:price', 'order:view', 'service:view', 'shop:finance'];
  }

  private parsePermissions(row: AdminUserRow) {
    if (!row.permissions) return this.defaultPermissions(row.role);
    try {
      const parsed = JSON.parse(row.permissions);
      return Array.isArray(parsed) ? parsed : this.defaultPermissions(row.role);
    } catch {
      return this.defaultPermissions(row.role);
    }
  }

  private pickUser(row: AdminUserRow): AuthUser {
    return {
      id: row.id,
      username: row.username,
      nickname: row.nickname || row.username,
      role: row.role,
      shopId: row.shop_id,
      shopName: row.shop_name || '',
      shopAvatarUrl: toUploadPublicUrl(row.shop_avatar_url || '', 'shop-avatars'),
      shopDescription: row.shop_description || '',
      status: row.status,
      permissions: this.parsePermissions(row),
    };
  }

  private createToken() {
    return randomBytes(32).toString('hex');
  }

  async getUserByToken(token: string) {
    if (!token) throw new UnauthorizedException('未登录');
    const rows = await this.db.query<AdminUserRow>(
      'SELECT * FROM `admin_users` WHERE `auth_token` = ? AND `token_expire_at` > NOW() AND `status` = 1 LIMIT 1;',
      [token],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException('登录已失效');
    return user;
  }

  async requireAdmin(token: string) {
    const user = await this.getUserByToken(token);
    if (user.role !== 'admin') throw new UnauthorizedException('需要管理员权限');
    return user;
  }

  async register(body: any) {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const nickname = String(body.nickname || username).trim();
    const role = this.normalizeRole(body.role);
    const shopName = role === 'merchant' ? String(body.shopName || nickname || username).trim() : '';

    if (!username || !password) throw new UnauthorizedException('账号和密码不能为空');
    if (password.length < 6) throw new UnauthorizedException('密码至少需要 6 位');

    const exists = await this.db.query<AdminUserRow>('SELECT id FROM `admin_users` WHERE `username` = ? LIMIT 1;', [username]);
    if (exists.length) throw new ConflictException('账号已存在');

    const passwordHash = await bcrypt.hash(password, 10);
    const permissions = this.defaultPermissions(role);
    const result = await this.db.execute<ResultSetHeader>(
      'INSERT INTO `admin_users` (`username`, `password_hash`, `nickname`, `role`, `shop_name`, `permissions`, `status`) VALUES (?, ?, ?, ?, ?, ?, 1);',
      [username, passwordHash, nickname, role, shopName || null, JSON.stringify(permissions)],
    );

    return {
      status: 200,
      message: '注册成功',
      result: { id: result.insertId, username, nickname, role, shopId: null, shopName, shopAvatarUrl: '', shopDescription: '', status: 1, permissions },
    };
  }

  async login(body: any) {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const rows = await this.db.query<AdminUserRow>('SELECT * FROM `admin_users` WHERE `username` = ? LIMIT 1;', [username]);
    const user = rows[0];
    if (!user || user.status !== 1 || !user.password_hash) throw new UnauthorizedException('账号或密码错误');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const token = this.createToken();
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.execute('UPDATE `admin_users` SET `auth_token` = ?, `token_expire_at` = ?, `last_login_at` = NOW() WHERE `id` = ?;', [
      token,
      expireAt,
      user.id,
    ]);

    return {
      status: 200,
      message: '登录成功',
      token,
      tokenExpireAt: expireAt.getTime(),
      result: this.pickUser(user),
    };
  }

  async me(token: string) {
    const user = await this.getUserByToken(token);
    return { status: 200, message: '获取成功', result: this.pickUser(user) };
  }

  async updateMyShopProfile(token: string, body: any) {
    const user = await this.getUserByToken(token);
    if (user.role !== 'merchant') throw new UnauthorizedException('只有普通商家可以维护店铺资料');

    const shopName = String(body.shopName || '').trim();
    const rawShopAvatarUrl = String(body.shopAvatarUrl || '').trim();
    const shopAvatarUrl = toStoredUploadValue(rawShopAvatarUrl, 'shop-avatars');
    const shopDescription = String(body.shopDescription || '').trim();
    if (!shopName) throw new BadRequestException('店铺名称不能为空');
    if (shopName.length > 120) throw new BadRequestException('店铺名称不能超过 120 个字符');
    if (rawShopAvatarUrl.length > 500) throw new BadRequestException('店铺头像地址不能超过 500 个字符');
    if (shopDescription.length > 500) throw new BadRequestException('店铺简介不能超过 500 个字符');

    await this.db.execute(
      'UPDATE `admin_users` SET `shop_name` = ?, `shop_avatar_url` = ?, `shop_description` = ? WHERE `id` = ?;',
      [shopName, shopAvatarUrl || null, shopDescription || null, user.id],
    );
    return {
      status: 200,
      message: '保存成功',
      result: this.pickUser({ ...user, shop_name: shopName, shop_avatar_url: shopAvatarUrl || null, shop_description: shopDescription || null }),
    };
  }

  async logout(token: string) {
    if (token) await this.db.execute('UPDATE `admin_users` SET `auth_token` = NULL, `token_expire_at` = NULL WHERE `auth_token` = ?;', [token]);
    return { status: 200, message: '退出成功' };
  }

  async updateMyPassword(token: string, body: any) {
    const user = await this.getUserByToken(token);
    const currentPassword = String(body.currentPassword || '');
    const password = String(body.password || '');
    if (!currentPassword) throw new BadRequestException('当前密码不能为空');
    if (!password) throw new BadRequestException('新密码不能为空');
    if (password.length < 6) throw new BadRequestException('密码至少需要 6 位');
    if (!user.password_hash) throw new BadRequestException('账号密码异常');

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw new BadRequestException('当前密码不正确');

    const passwordHash = await bcrypt.hash(password, 10);
    await this.db.execute('UPDATE `admin_users` SET `password_hash` = ?, `auth_token` = NULL, `token_expire_at` = NULL WHERE `id` = ?;', [
      passwordHash,
      user.id,
    ]);
    return { status: 200, message: '密码修改成功' };
  }

  async cancelMyAccount(token: string) {
    const user = await this.getUserByToken(token);
    const result = await this.db.execute<ResultSetHeader>('DELETE FROM `admin_users` WHERE `id` = ?;', [user.id]);
    if (!result.affectedRows) throw new BadRequestException('账号不存在');
    return { status: 200, message: '账号已注销' };
  }

  async listUsers(token: string) {
    await this.requireAdmin(token);
    const rows = await this.db.query<AdminUserRow>(
      'SELECT `id`,`username`,`nickname`,`role`,`shop_id`,`shop_name`,`shop_avatar_url`,`shop_description`,`permissions`,`status`,`last_login_at`,`created_at` FROM `admin_users` ORDER BY `id` DESC;',
    );
    return { status: 200, message: '获取成功', result: rows.map((item) => this.pickUser(item)) };
  }

  async updateUser(token: string, id: number, body: any) {
    await this.requireAdmin(token);
    const targetRows = await this.db.query<AdminUserRow>('SELECT `id`,`role` FROM `admin_users` WHERE `id` = ? LIMIT 1;', [id]);
    const target = targetRows[0];
    if (!target) throw new BadRequestException('账号不存在');
    if (target.role !== 'merchant') throw new BadRequestException('只能编辑普通商家账号');

    const updates: string[] = [];
    const params: any[] = [];
    const status = Number(body.status);
    const nickname = String(body.nickname || '').trim();
    const shopName = String(body.shopName || '').trim();

    if (body.role !== undefined && this.normalizeRole(body.role) !== 'merchant') {
      throw new BadRequestException('普通商家账号不能调整为管理员');
    }
    if (nickname) {
      updates.push('`nickname` = ?');
      params.push(nickname);
    }
    if (Number.isInteger(status) && (status === 0 || status === 1)) {
      updates.push('`status` = ?');
      params.push(status);
    }
    if (shopName) {
      updates.push('`shop_name` = ?');
      params.push(shopName);
    }
    if (!updates.length) return { status: 200, message: '无需更新' };

    params.push(id);
    await this.db.execute(`UPDATE \`admin_users\` SET ${updates.join(', ')} WHERE \`id\` = ?;`, params);
    return { status: 200, message: '更新成功' };
  }

  async updateUserPassword(token: string, id: number, body: any) {
    await this.requireAdmin(token);
    const password = String(body.password || '');
    if (!id) throw new BadRequestException('账号ID不能为空');
    if (!password) throw new BadRequestException('新密码不能为空');
    if (password.length < 6) throw new BadRequestException('密码至少需要 6 位');

    const targetRows = await this.db.query<AdminUserRow>('SELECT `id`,`role` FROM `admin_users` WHERE `id` = ? LIMIT 1;', [id]);
    const target = targetRows[0];
    if (!target) throw new BadRequestException('账号不存在');
    if (target.role !== 'merchant') throw new BadRequestException('只能修改普通商家账号密码');

    const passwordHash = await bcrypt.hash(password, 10);
    await this.db.execute('UPDATE `admin_users` SET `password_hash` = ?, `auth_token` = NULL, `token_expire_at` = NULL WHERE `id` = ?;', [
      passwordHash,
      id,
    ]);
    return { status: 200, message: '密码修改成功' };
  }

  async cancelUser(token: string, id: number) {
    await this.requireAdmin(token);
    if (!id) throw new BadRequestException('账号ID不能为空');

    const targetRows = await this.db.query<AdminUserRow>('SELECT `id`,`role` FROM `admin_users` WHERE `id` = ? LIMIT 1;', [id]);
    const target = targetRows[0];
    if (!target) throw new BadRequestException('账号不存在');
    if (target.role !== 'merchant') throw new BadRequestException('只能注销普通商家账号');

    const result = await this.db.execute<ResultSetHeader>('DELETE FROM `admin_users` WHERE `id` = ?;', [id]);
    if (!result.affectedRows) throw new BadRequestException('账号不存在');
    return { status: 200, message: '账号已注销' };
  }

  async enterUser(token: string, id: number) {
    await this.requireAdmin(token);
    if (!id) throw new BadRequestException('账号ID不能为空');

    const rows = await this.db.query<AdminUserRow>('SELECT * FROM `admin_users` WHERE `id` = ? LIMIT 1;', [id]);
    const target = rows[0];
    if (!target) throw new BadRequestException('账号不存在');
    if (target.role !== 'merchant') throw new BadRequestException('只能进入普通商家账号');
    if (target.status !== 1) throw new BadRequestException('该商家账号已禁用或注销');

    const impersonationToken = this.createToken();
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.execute('UPDATE `admin_users` SET `auth_token` = ?, `token_expire_at` = ?, `last_login_at` = NOW() WHERE `id` = ?;', [
      impersonationToken,
      expireAt,
      target.id,
    ]);

    return {
      status: 200,
      message: '进入成功',
      token: impersonationToken,
      tokenExpireAt: expireAt.getTime(),
      result: this.pickUser(target),
    };
  }
}
