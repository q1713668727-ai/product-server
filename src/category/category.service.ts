import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { existsSync, unlinkSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { AuthService } from '../auth/auth.service';
import { extractUploadFilename, toStoredUploadValue, toUploadPublicUrl } from '../common/upload-path.util';
import { DatabaseService } from '../database/database.service';

type CategoryRow = {
  id: number;
  parent_id: number | null;
  parent_key: string | null;
  category_key: string;
  name: string;
  icon_url: string | null;
  level: number;
  sort_order: number;
  status: number;
  feature_titles: string | null;
};

const MAX_SECOND_LEVEL_CATEGORIES = 15;

@Injectable()
export class CategoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private normalizeFeatures(value: any) {
    return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  }

  private removeLocalCategoryIcons(urls: string[]) {
    const uploadRoot = normalize(join(process.cwd(), 'uploads', 'category-icons'));
    for (const url of urls) {
      const raw = String(url || '').trim();
      if (!raw) continue;
      const filename = extractUploadFilename(raw, 'category-icons');
      if (!filename) continue;
      const filePath = normalize(join(uploadRoot, decodeURIComponent(filename)));
      if (!filePath.startsWith(uploadRoot)) continue;
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  }

  async requireAdmin(authorization: string) {
    return this.authService.requireAdmin(this.token(authorization));
  }

  private mapRow(row: CategoryRow) {
    return {
      id: row.id,
      key: row.category_key,
      name: row.name,
      iconUrl: toUploadPublicUrl(row.icon_url || '', 'category-icons'),
      parentId: row.parent_id,
      parentKey: row.parent_key || '',
      level: row.level,
      sort: row.sort_order,
      status: row.status === 1 ? '启用' : '停用',
      features: row.feature_titles ? row.feature_titles.split('||').filter(Boolean) : [],
    };
  }

  private siblingParentWhere(parentId: number | null) {
    return parentId === null ? { sql: 'parent_id IS NULL', params: [] as any[] } : { sql: 'parent_id = ?', params: [parentId] as any[] };
  }

  private async shiftSiblingSorts(parentId: number | null, sort: number, excludeId = 0) {
    const parent = this.siblingParentWhere(parentId);
    const excludeSql = excludeId > 0 ? ' AND id <> ?' : '';
    await this.db.execute(
      `UPDATE market_categories
       SET sort_order = sort_order + 1
       WHERE ${parent.sql} AND sort_order >= ? AND deleted_at IS NULL${excludeSql};`,
      [...parent.params, sort, ...(excludeId > 0 ? [excludeId] : [])],
    );
  }

  private async moveSiblingSort(parentId: number | null, oldSort: number, sort: number, excludeId: number) {
    if (oldSort === sort) return;
    const parent = this.siblingParentWhere(parentId);
    if (sort < oldSort) {
      await this.db.execute(
        `UPDATE market_categories
         SET sort_order = sort_order + 1
         WHERE ${parent.sql} AND sort_order >= ? AND sort_order < ? AND id <> ? AND deleted_at IS NULL;`,
        [...parent.params, sort, oldSort, excludeId],
      );
      return;
    }
    await this.db.execute(
      `UPDATE market_categories
       SET sort_order = sort_order - 1
       WHERE ${parent.sql} AND sort_order <= ? AND sort_order > ? AND id <> ? AND deleted_at IS NULL;`,
      [...parent.params, sort, oldSort, excludeId],
    );
  }

  private async closeSiblingSortGap(parentId: number | null, oldSort: number) {
    const parent = this.siblingParentWhere(parentId);
    await this.db.execute(
      `UPDATE market_categories
       SET sort_order = sort_order - 1
       WHERE ${parent.sql} AND sort_order > ? AND deleted_at IS NULL;`,
      [...parent.params, oldSort],
    );
  }

  private async compactSiblingSorts(parentId: number | null) {
    const parent = this.siblingParentWhere(parentId);
    const rows = await this.db.query<{ id: number }>(
      `SELECT id FROM market_categories WHERE ${parent.sql} AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC;`,
      parent.params,
    );
    for (let index = 0; index < rows.length; index += 1) {
      await this.db.execute('UPDATE market_categories SET sort_order = ? WHERE id = ?;', [index + 1, rows[index].id]);
    }
  }

  private async ensureSecondLevelLimit(parentId: number | null, id = 0) {
    if (parentId === null) return;
    const rows = await this.db.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM market_categories WHERE parent_id = ? AND deleted_at IS NULL AND id <> ?;',
      [parentId, id],
    );
    if (Number(rows[0]?.total || 0) >= MAX_SECOND_LEVEL_CATEGORIES) {
      throw new BadRequestException(`一级分类下最多添加${MAX_SECOND_LEVEL_CATEGORIES}个二级分类`);
    }
  }

  private async ensureSiblingNameAvailable(parentId: number | null, name: string, id = 0) {
    const parent = this.siblingParentWhere(parentId);
    const rows = await this.db.query<{ id: number }>(
      `SELECT id FROM market_categories WHERE ${parent.sql} AND name = ? AND id <> ? AND deleted_at IS NULL LIMIT 1;`,
      [...parent.params, name, id],
    );
    if (rows.length) throw new BadRequestException('同一个父级下类目名称不能重复');
  }

  private async getCategoryWithParentKey(id: number) {
    const rows = await this.db.query<CategoryRow>(
      `SELECT c.*, p.category_key AS parent_key, NULL AS feature_titles
       FROM market_categories c
       LEFT JOIN market_categories p ON p.id = c.parent_id
       WHERE c.id = ? AND c.deleted_at IS NULL
       LIMIT 1;`,
      [id],
    );
    return rows[0];
  }

  async list(authorization: string) {
    await this.authService.getUserByToken(this.token(authorization));
    const rows = await this.db.query<CategoryRow>(
      `SELECT c.*, p.category_key AS parent_key,
        GROUP_CONCAT(f.title ORDER BY f.row_index ASC, f.sort_order ASC SEPARATOR '||') AS feature_titles
       FROM market_categories c
       LEFT JOIN market_categories p ON p.id = c.parent_id
       LEFT JOIN market_category_features f ON f.category_id = c.id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.level ASC, c.sort_order ASC, c.id ASC;`,
    );
    return { status: 200, message: '获取成功', result: rows.map((item) => this.mapRow(item)) };
  }

  async save(authorization: string, body: any) {
    await this.authService.requireAdmin(this.token(authorization));
    const id = Number(body.id || 0);
    const key = String(body.key || '').trim();
    const name = String(body.name || '').trim();
    const inputIconUrl = String(body.iconUrl || '').trim();
    const parentKey = String(body.parentKey || '').trim();
    const sort = Math.max(1, Number(body.sort || 1));
    const status = body.status === '停用' || body.status === 0 ? 0 : 1;
    const features = this.normalizeFeatures(body.features);

    if (!key || !name) throw new BadRequestException('分类Key和名称不能为空');

    let parentId: number | null = null;
    let level = 1;
    if (parentKey) {
      const parents = await this.db.query<any>('SELECT id, parent_id, level FROM market_categories WHERE category_key = ? AND deleted_at IS NULL LIMIT 1;', [parentKey]);
      if (!parents.length) throw new BadRequestException('父级分类不存在');
      if (Number(parents[0].level) >= 3) throw new BadRequestException('三级分类不能再添加下级分类');
      if (id > 0 && (Number(parents[0].id) === id || Number(parents[0].parent_id || 0) === id)) {
        throw new BadRequestException('不能选择当前分类或其子分类作为父级');
      }
      parentId = Number(parents[0].id);
      level = Number(parents[0].level) + 1;
    }

    if (level > 3) throw new BadRequestException('最多只能创建三级分类');
    if (level === 2) await this.ensureSecondLevelLimit(parentId, id);
    if (name === '推荐') throw new BadRequestException('类目名称不能叫做推荐');
    await this.ensureSiblingNameAvailable(parentId, name, id);
    const iconUrl = level === 2 ? toStoredUploadValue(inputIconUrl, 'category-icons') : '';

    if (id > 0) {
      const currentRows = await this.db.query<any>('SELECT level FROM market_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1;', [id]);
      const children = await this.db.query<any>('SELECT id FROM market_categories WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1;', [id]);
      if (children.length && Number(currentRows[0]?.level || level) !== level) {
        throw new BadRequestException('该分类已有子分类，不能调整层级');
      }
      if (children.length && level === 3) throw new BadRequestException('该分类已有子分类，不能调整为三级分类');
    }

    if (id > 0) {
      const currentRows = await this.db.query<{ parent_id: number | null; sort_order: number }>(
        'SELECT parent_id, sort_order FROM market_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
        [id],
      );
      const oldParentId = currentRows[0]?.parent_id ?? null;
      const oldSort = Number(currentRows[0]?.sort_order || sort);
      if (oldParentId === parentId) {
        await this.moveSiblingSort(parentId, oldSort, sort, id);
      } else {
        await this.closeSiblingSortGap(oldParentId, oldSort);
        await this.shiftSiblingSorts(parentId, sort, id);
      }
      const result = await this.db.execute<ResultSetHeader>(
        'UPDATE market_categories SET parent_id = ?, category_key = ?, name = ?, icon_url = ?, level = ?, sort_order = ?, status = ? WHERE id = ? AND deleted_at IS NULL;',
        [parentId, key, name, iconUrl || null, level, sort, status, id],
      );
      if (result.affectedRows === 0) throw new NotFoundException('分类不存在');
      await this.compactSiblingSorts(oldParentId);
      if (oldParentId !== parentId) await this.compactSiblingSorts(parentId);
      await this.replaceFeatures(id, features);
      return { status: 200, message: '保存成功', result: { id } };
    }

    await this.shiftSiblingSorts(parentId, sort);
    const result = await this.db.execute<ResultSetHeader>(
      'INSERT INTO market_categories (parent_id, category_key, name, icon_url, level, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [parentId, key, name, iconUrl || null, level, sort, status],
    );
    await this.compactSiblingSorts(parentId);
    await this.replaceFeatures(result.insertId, features);
    if (level === 2) await this.ensureRecommendedChildForSecondLevel(result.insertId);
    return { status: 200, message: '创建成功', result: { id: result.insertId } };
  }

  private async ensureRecommendedChildForSecondLevel(parentId: number) {
    const parentRows = await this.db.query<{ id: number; level: number }>(
      'SELECT id, level FROM market_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
      [parentId],
    );
    const parent = parentRows[0];
    if (!parent) return;
    if (Number(parent.level) !== 2) throw new BadRequestException('只能在二级分类下创建推荐分类');

    const exists = await this.db.query<CategoryRow>(
      `SELECT c.*, p.category_key AS parent_key, NULL AS feature_titles
       FROM market_categories c
       LEFT JOIN market_categories p ON p.id = c.parent_id
       WHERE c.parent_id = ? AND c.name = ? AND c.deleted_at IS NULL
       ORDER BY c.sort_order ASC, c.id ASC
       LIMIT 1;`,
      [parent.id, '推荐'],
    );
    if (exists[0]) return this.mapRow(exists[0]);

    const sortRows = await this.db.query<{ sort: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort FROM market_categories WHERE parent_id = ? AND deleted_at IS NULL;',
      [parent.id],
    );
    const key = String(Date.now());
    const result = await this.db.execute<ResultSetHeader>(
      'INSERT INTO market_categories (parent_id, category_key, name, level, sort_order, status) VALUES (?, ?, ?, 3, ?, 1);',
      [parent.id, key, '推荐', Number(sortRows[0]?.sort || 1)],
    );
    const created = await this.getCategoryWithParentKey(result.insertId);
    return this.mapRow(created);
  }

  private async replaceFeatures(categoryId: number, features: string[]) {
    await this.db.execute('DELETE FROM market_category_features WHERE category_id = ?;', [categoryId]);
    for (let index = 0; index < features.length; index += 1) {
      await this.db.execute(
        'INSERT INTO market_category_features (category_id, title, route_path, row_index, sort_order, status) VALUES (?, ?, ?, ?, ?, 1);',
        [categoryId, features[index], '/market-category', index >= 5 ? 1 : 0, (index + 1) * 10],
      );
    }
  }

  async remove(authorization: string, body: any) {
    await this.authService.requireAdmin(this.token(authorization));
    const id = Number(body.id || 0);
    if (!id) throw new BadRequestException('分类ID不能为空');

    const targetRows = await this.db.query<{ id: number; parent_id: number | null; level: number; name: string; sort_order: number }>(
      'SELECT id, parent_id, level, name, sort_order FROM market_categories WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
      [id],
    );
    const target = targetRows[0];
    if (!target) throw new NotFoundException('分类不存在');
    if (Number(target.level) === 3 && target.name === '推荐') throw new BadRequestException('推荐分类不允许删除');

    const categoryIds = [id];
    if (Number(target.level) === 2) {
      const childRows = await this.db.query<{ id: number }>('SELECT id FROM market_categories WHERE parent_id = ? AND deleted_at IS NULL;', [id]);
      categoryIds.push(...childRows.map((item) => item.id));
    } else if (Number(target.level) === 1) {
      const children = await this.db.query<any>('SELECT id FROM market_categories WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1;', [id]);
      if (children.length) throw new BadRequestException('请先删除或迁移子分类');
    }

    const productRows = await this.db.query<any>(`SELECT id FROM products WHERE category_id IN (${categoryIds.map(() => '?').join(',')}) AND deleted_at IS NULL LIMIT 1;`, categoryIds);
    if (productRows.length) throw new BadRequestException('该分类下仍有关联商品，不能删除');

    const iconRows = await this.db.query<{ icon_url: string | null }>(
      `SELECT icon_url FROM market_categories WHERE id IN (${categoryIds.map(() => '?').join(',')}) AND deleted_at IS NULL;`,
      categoryIds,
    );
    const iconUrls = iconRows.map((item) => item.icon_url || '').filter(Boolean);
    const parentId = target.parent_id ?? null;
    const result = await this.db.execute<ResultSetHeader>('DELETE FROM market_categories WHERE id = ? AND deleted_at IS NULL;', [id]);
    if (result.affectedRows === 0) throw new NotFoundException('分类不存在');
    this.removeLocalCategoryIcons(iconUrls);
    await this.compactSiblingSorts(parentId);
    return { status: 200, message: '删除成功' };
  }
}
