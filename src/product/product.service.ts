import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { existsSync, unlinkSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { AuthService } from '../auth/auth.service';
import { extractUploadFilename, toStoredUploadValue, toUploadPublicUrl } from '../common/upload-path.util';
import { DatabaseService } from '../database/database.service';

type ProductStatus = '上架' | '下架' | '售罄';

type ProductRow = {
  id: number;
  spu_code: string;
  shop_id: number | null;
  category_id: number | null;
  category_name: string | null;
  category_path: string | null;
  shop_name: string | null;
  name: string;
  main_image_url: string | null;
  min_price: string | number;
  max_price: string | number;
  origin_price: string | number | null;
  total_stock: number;
  sold_count: number;
  favorite_count: number;
  is_free_shipping: number;
  status: number;
  detail_json: string | Record<string, any> | null;
};

type SkuPayload = {
  id?: number;
  code?: string;
  price?: number;
  originPrice?: number;
  stock?: number;
  imageUrl?: string;
  specs?: Array<{ name: string; value: string }>;
  status?: ProductStatus | number;
};

@Injectable()
export class ProductService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  private token(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private statusText(status: number): ProductStatus {
    if (status === 2) return '售罄';
    return status === 1 ? '上架' : '下架';
  }

  private statusValue(status: any) {
    if (status === '售罄' || status === 2) return 2;
    if (status === '下架' || status === 0) return 0;
    return 1;
  }

  private parseDetail(row: Pick<ProductRow, 'detail_json'>) {
    if (!row.detail_json) return {};
    if (typeof row.detail_json === 'object') return row.detail_json;
    try {
      return JSON.parse(row.detail_json);
    } catch {
      return {};
    }
  }

  async requireUser(authorization: string) {
    return this.authService.getUserByToken(this.token(authorization));
  }

  private normalizeStoredImageUrls(value: any) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => toStoredUploadValue(item, 'product-images'))
      .filter((item) => item && !item.startsWith('blob:'));
  }

  private normalizePublicImageUrls(value: any) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => toUploadPublicUrl(item, 'product-images'))
      .filter((item) => item && !item.startsWith('blob:'));
  }

  private normalizeSpecs(value: any) {
    return Array.isArray(value)
      ? value
          .map((item) => ({ name: String(item?.name || '').trim(), value: String(item?.value || '').trim() }))
          .filter((item) => item.name || item.value)
      : [];
  }

  private normalizeSkus(body: any): SkuPayload[] {
    if (Array.isArray(body.skus) && body.skus.length) return body.skus;
    return [
      {
        code: `${String(body.code || Date.now()).trim()}-default`,
        price: Number(body.price ?? body.originPrice ?? 0),
        originPrice: Number(body.originPrice ?? body.price ?? 0),
        stock: Number(body.stock || 0),
        imageUrl: Array.isArray(body.imageUrls) ? body.imageUrls[0] : body.imageUrl || '',
        specs: this.normalizeSpecs(body.specs),
        status: body.status,
      },
    ];
  }

  private imageUrlsFromRow(row: Pick<ProductRow, 'main_image_url' | 'detail_json'>, skus: Array<{ image_url?: string | null }> = []) {
    const detail = this.parseDetail(row) as any;
    return Array.from(new Set([
      ...this.normalizeStoredImageUrls([row.main_image_url]),
      ...this.normalizeStoredImageUrls(detail.imageUrls),
      ...this.normalizeStoredImageUrls(detail.hdImageUrls),
      ...this.normalizeStoredImageUrls(skus.map((sku) => sku.image_url || '')),
    ]));
  }

  private uniqueImageUrls(urls: string[]) {
    return Array.from(new Set(urls.map((item) => String(item || '').trim()).filter(Boolean)));
  }

  private imageUrlsToRemove(previousUrls: string[], nextUrls: string[]) {
    const nextSet = new Set(this.uniqueImageUrls(nextUrls));
    return this.uniqueImageUrls(previousUrls).filter((item) => !nextSet.has(item));
  }

  private removeLocalProductImages(urls: string[]) {
    const uploadRoot = normalize(join(process.cwd(), 'uploads', 'product-images'));
    for (const url of urls) {
      const raw = String(url || '').trim();
      if (!raw) continue;
      const filename = extractUploadFilename(raw, 'product-images');
      if (!filename) continue;
      const filePath = normalize(join(uploadRoot, decodeURIComponent(filename)));
      if (!filePath.startsWith(uploadRoot)) continue;
      if (!existsSync(filePath)) continue;
      try {
        unlinkSync(filePath);
      } catch {
        // Best-effort cleanup. Keep the business operation successful even if a file is locked.
      }
    }
  }

  private async getSkuRows(productId: number) {
    return this.db.query<{ id: number; sku_code: string; specs: string; image_url: string | null; price: string | number; origin_price: string | number | null; stock: number; status: number }>(
      'SELECT id, sku_code, specs, image_url, price, origin_price, stock, status FROM skus WHERE product_id = ? ORDER BY id ASC;',
      [productId],
    );
  }

  private mapRow(row: ProductRow, skuRows: Awaited<ReturnType<ProductService['getSkuRows']>> = []) {
    const detail = this.parseDetail(row) as any;
    const mainImageUrl = toUploadPublicUrl(row.main_image_url || '', 'product-images');
    const imageUrls = this.normalizePublicImageUrls(detail.imageUrls);
    if (mainImageUrl && !mainImageUrl.startsWith('blob:') && !imageUrls.includes(mainImageUrl)) imageUrls.unshift(mainImageUrl);
    const skus = skuRows.map((sku) => {
      let specs: Array<{ name: string; value: string }> = [];
      try {
        specs = this.normalizeSpecs(JSON.parse(sku.specs || '[]'));
      } catch {
        specs = [];
      }
      return {
        id: sku.id,
        code: sku.sku_code,
        price: Number(sku.price || 0),
        originPrice: Number(sku.origin_price || sku.price || 0),
        stock: Number(sku.stock || 0),
        imageUrl: toUploadPublicUrl(sku.image_url || '', 'product-images'),
        specs,
        status: this.statusText(Number(sku.status || 0)),
      };
    });
    const firstSku = skus[0];
    return {
      id: row.id,
      code: row.spu_code,
      name: row.name,
      category: row.category_name || '',
      categoryPath: row.category_path || row.category_name || '',
      categoryId: row.category_id,
      shop: row.shop_name || '',
      shopId: row.shop_id,
      price: firstSku?.price ?? Number(row.min_price || 0),
      originPrice: firstSku?.originPrice ?? Number(row.origin_price || row.min_price || 0),
      stock: Number(row.total_stock || 0),
      sold: Number(row.sold_count || 0),
      favorites: Number(row.favorite_count || 0),
      shippingFrom: detail.shippingFrom || '',
      freeShipping: row.is_free_shipping === 1,
      imageUrl: imageUrls[0] || '',
      imageUrls,
      hdImageUrls: this.normalizePublicImageUrls(detail.hdImageUrls),
      purchaseLimit: Number(detail.purchaseLimit || 0),
      specs: firstSku?.specs || [],
      skus,
      status: this.statusText(Number(row.status || 0)),
    };
  }

  private async findShopForUser(user: any, shopName: string) {
    const targetShopName = user.role === 'admin' ? shopName : user.shop_name || user.nickname || user.username || '';
    if (!targetShopName) throw new BadRequestException('店铺不能为空');

    const account = user.role === 'admin'
      ? (await this.db.query<{ username: string; shop_name: string | null; nickname: string | null }>(
          `SELECT username, shop_name, nickname
           FROM admin_users
           WHERE role = 'merchant' AND (shop_name = ? OR username = ?) LIMIT 1;`,
          [targetShopName, targetShopName],
        ))[0]
      : { username: user.username, shop_name: user.shop_name, nickname: user.nickname };
    if (!account?.username) throw new BadRequestException('商家账号不存在');

    const rows = await this.db.query<{ id: number; username: string }>(
      'SELECT id, username FROM market_shops WHERE username = ? AND deleted_at IS NULL LIMIT 1;',
      [account.username],
    );
    const shop = rows[0];
    if (shop) return { id: shop.id, username: account.username, name: account.shop_name || account.nickname || account.username };

    const result = await this.db.execute<ResultSetHeader>(
      'INSERT INTO market_shops (username, service_level, status) VALUES (?, ?, 1);',
      [account.username, '金牌客服'],
    );
    return { id: result.insertId, username: account.username, name: account.shop_name || account.nickname || account.username };
  }

  private async replaceSkuModel(productId: number, skuPayloads: SkuPayload[]) {
    await this.db.execute('DELETE FROM attributes WHERE product_id = ?;', [productId]);

    const attributeValueIdByPair = new Map<string, number>();
    const attributeNames = Array.from(new Set(skuPayloads.flatMap((sku) => this.normalizeSpecs(sku.specs).map((spec) => spec.name)).filter(Boolean)));

    for (let attrIndex = 0; attrIndex < attributeNames.length; attrIndex += 1) {
      const attrName = attributeNames[attrIndex];
      const attrResult = await this.db.execute<ResultSetHeader>(
        'INSERT INTO attributes (product_id, name, sort_order) VALUES (?, ?, ?);',
        [productId, attrName, attrIndex + 1],
      );
      const values = Array.from(new Set(skuPayloads.flatMap((sku) => this.normalizeSpecs(sku.specs).filter((spec) => spec.name === attrName).map((spec) => spec.value)).filter(Boolean)));
      for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
        const valueResult = await this.db.execute<ResultSetHeader>(
          'INSERT INTO attribute_values (attribute_id, value, sort_order) VALUES (?, ?, ?);',
          [attrResult.insertId, values[valueIndex], valueIndex + 1],
        );
        attributeValueIdByPair.set(`${attrName}\u0000${values[valueIndex]}`, valueResult.insertId);
      }
    }

    await this.db.execute('DELETE FROM skus WHERE product_id = ?;', [productId]);
    for (let index = 0; index < skuPayloads.length; index += 1) {
      const sku = skuPayloads[index];
      const specs = this.normalizeSpecs(sku.specs);
      const attributeValueIds = specs.map((spec) => attributeValueIdByPair.get(`${spec.name}\u0000${spec.value}`)).filter(Boolean);
      await this.db.execute(
        `INSERT INTO skus (product_id, sku_code, attribute_value_ids, specs, image_url, price, origin_price, stock, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          productId,
          String(sku.code || `${productId}-${index + 1}`).trim(),
          JSON.stringify(attributeValueIds),
          JSON.stringify(specs),
          toStoredUploadValue(sku.imageUrl || '', 'product-images') || null,
          Math.max(0, Number(sku.price || 0)),
          Math.max(0, Number(sku.originPrice ?? sku.price ?? 0)),
          Math.max(0, Number(sku.stock || 0)),
          this.statusValue(sku.status),
        ],
      );
    }
  }

  async list(authorization: string) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const params: any[] = [];
    let shopFilter = '';
    if (user.role !== 'admin') {
      shopFilter = ' AND s.username = ?';
      params.push(user.username);
    }
    const rows = await this.db.query<ProductRow>(
      `SELECT p.*, c.name AS category_name,
              CASE
                WHEN c.level = 1 THEN c.name
                WHEN c.level = 2 THEN CONCAT_WS(' / ', cp.name, c.name)
                ELSE CONCAT_WS(' / ', cgp.name, cp.name, c.name)
              END AS category_path,
              COALESCE(u.shop_name, u.nickname, u.username, s.username) AS shop_name
       FROM products p
       LEFT JOIN market_categories c ON c.id = p.category_id
       LEFT JOIN market_categories cp ON cp.id = c.parent_id
       LEFT JOIN market_categories cgp ON cgp.id = cp.parent_id
       LEFT JOIN market_shops s ON s.id = p.shop_id
       LEFT JOIN admin_users u ON u.username = s.username
       WHERE p.deleted_at IS NULL${shopFilter}
       ORDER BY p.sort_order ASC, p.id DESC;`,
      params,
    );
    const result: ReturnType<ProductService['mapRow']>[] = [];
    for (const row of rows) {
      result.push(this.mapRow(row, await this.getSkuRows(row.id)));
    }
    return { status: 200, message: '获取成功', result };
  }

  async save(authorization: string, body: any) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || 0);
    const code = String(body.code || Date.now()).trim();
    const name = String(body.name || '').trim();
    const categoryName = String(body.category || '').trim();
    const status = user.role === 'admin' ? this.statusValue(body.status) : this.statusValue(body.status === '售罄' ? '下架' : body.status);
    const shop = await this.findShopForUser(user, String(body.shop || '').trim());

    if (!name) throw new BadRequestException('商品名称不能为空');
    if (name.length > 500) throw new BadRequestException('商品名称不能超过 500 个字符');
    if (!categoryName) throw new BadRequestException('商品分类不能为空');

    const categories = await this.db.query<{ id: number }>('SELECT id FROM market_categories WHERE name = ? AND level = 3 AND deleted_at IS NULL LIMIT 1;', [
      categoryName,
    ]);
    const category = categories[0];
    if (!category) throw new BadRequestException('商品分类不存在');

    if (id > 0) {
      const existing = await this.db.query<{ id: number; shop_id: number | null }>(
        'SELECT id, shop_id FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
        [id],
      );
      if (!existing[0]) throw new NotFoundException('商品不存在');
      if (user.role !== 'admin' && Number(existing[0].shop_id || 0) !== Number(shop.id)) throw new UnauthorizedException('只能保存自己店铺的商品');
    }

    const imageUrls = this.normalizeStoredImageUrls(Array.isArray(body.imageUrls) ? body.imageUrls : body.imageUrl ? [body.imageUrl] : []);
    const hdImageUrls = this.normalizeStoredImageUrls(body.hdImageUrls);
    const skuPayloads = this.normalizeSkus({ ...body, imageUrls });
    const skuPrices = skuPayloads.map((sku) => Math.max(0, Number(sku.price ?? body.price ?? body.originPrice ?? 0)));
    const totalStock = skuPayloads.reduce((sum, sku) => sum + Math.max(0, Number(sku.stock || 0)), 0);
    const detailJson = JSON.stringify({
      shippingFrom: String(body.shippingFrom || '').trim(),
      imageUrls,
      hdImageUrls,
      purchaseLimit: Math.max(0, Number(body.purchaseLimit || 0)),
    });
    const mainImageUrl = String(imageUrls[0] || '').trim() || null;
    const minPrice = skuPrices.length ? Math.min(...skuPrices) : 0;
    const maxPrice = skuPrices.length ? Math.max(...skuPrices) : minPrice;
    const originPrice = Math.max(0, Number(body.originPrice ?? minPrice));

    if (id > 0) {
      const existingRows = await this.db.query<Pick<ProductRow, 'main_image_url' | 'detail_json'>>(
        'SELECT main_image_url, detail_json FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
        [id],
      );
      const previousSkuRows = await this.getSkuRows(id);
      const previousImageUrls = existingRows[0] ? this.imageUrlsFromRow(existingRows[0], previousSkuRows) : [];
      const result = await this.db.execute<ResultSetHeader>(
        `UPDATE products
         SET spu_code = ?, shop_id = ?, category_id = ?, name = ?, main_image_url = ?, min_price = ?, max_price = ?,
             origin_price = ?, total_stock = ?, is_free_shipping = ?, status = ?, detail_json = ?
         WHERE id = ? AND deleted_at IS NULL;`,
        [code, shop.id, category.id, name, mainImageUrl, minPrice, maxPrice, originPrice, totalStock, body.freeShipping === false ? 0 : 1, status, detailJson, id],
      );
      if (result.affectedRows === 0) throw new NotFoundException('商品不存在');
      await this.replaceSkuModel(id, skuPayloads);
      const nextImageUrls = this.uniqueImageUrls([
        ...imageUrls,
        ...hdImageUrls,
        ...skuPayloads.map((sku) => toStoredUploadValue(sku.imageUrl || '', 'product-images')).filter(Boolean) as string[],
      ]);
      this.removeLocalProductImages(this.imageUrlsToRemove(previousImageUrls, nextImageUrls));
      return { status: 200, message: '保存成功', result: { id } };
    }

    const result = await this.db.execute<ResultSetHeader>(
      `INSERT INTO products
       (spu_code, shop_id, category_id, name, main_image_url, min_price, max_price, origin_price, total_stock, is_free_shipping, status, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [code, shop.id, category.id, name, mainImageUrl, minPrice, maxPrice, originPrice, totalStock, body.freeShipping === false ? 0 : 1, status, detailJson],
    );
    await this.replaceSkuModel(result.insertId, skuPayloads);
    return { status: 200, message: '创建成功', result: { id: result.insertId } };
  }

  async remove(authorization: string, body: any) {
    const user = await this.authService.getUserByToken(this.token(authorization));
    const id = Number(body.id || 0);
    const code = String(body.code || '').trim();
    if (!id && !code) throw new BadRequestException('商品ID不能为空');

    const whereSql = id ? 'p.id = ?' : 'p.spu_code = ?';
    const whereParam = id || code;
    const rows = await this.db.query<ProductRow>(
      `SELECT p.*, c.name AS category_name,
              CASE
                WHEN c.level = 1 THEN c.name
                WHEN c.level = 2 THEN CONCAT_WS(' / ', cp.name, c.name)
                ELSE CONCAT_WS(' / ', cgp.name, cp.name, c.name)
              END AS category_path,
              COALESCE(u.shop_name, u.nickname, u.username, s.username) AS shop_name
       FROM products p
       LEFT JOIN market_categories c ON c.id = p.category_id
       LEFT JOIN market_categories cp ON cp.id = c.parent_id
       LEFT JOIN market_categories cgp ON cgp.id = cp.parent_id
       LEFT JOIN market_shops s ON s.id = p.shop_id
       LEFT JOIN admin_users u ON u.username = s.username
       WHERE ${whereSql} AND p.deleted_at IS NULL
       LIMIT 1;`,
      [whereParam],
    );
    const product = rows[0];
    if (!product) throw new NotFoundException('商品不存在');
    const shopName = user.shop_name || user.nickname || '';
    if (user.role !== 'admin' && product.shop_name !== shopName) throw new UnauthorizedException('只能删除自己店铺的商品');

    const skuRows = await this.getSkuRows(product.id);
    const imageUrls = this.imageUrlsFromRow(product, skuRows);
    const result = await this.db.execute<ResultSetHeader>('DELETE FROM products WHERE id = ?;', [product.id]);
    if (result.affectedRows === 0) throw new NotFoundException('商品不存在');
    this.removeLocalProductImages(imageUrls);
    return { status: 200, message: '删除成功' };
  }
}
