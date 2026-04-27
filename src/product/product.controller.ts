import { BadRequestException, Body, Controller, Get, Headers, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { toUploadPublicUrl } from '../common/upload-path.util';
import { ProductService } from './product.service';

const multer = require('multer');

const productImageStorage = multer.diskStorage({
  destination: (_req: any, _file: any, callback: any) => {
    const dir = join(process.cwd(), 'uploads', 'product-images');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req: any, file: any, callback: any) => {
    const ext = extname(file.originalname || '').toLowerCase() || '.png';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  list(@Headers('authorization') authorization = '') {
    return this.productService.list(authorization);
  }

  @Post('save')
  save(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.productService.save(authorization, body);
  }

  @Post('delete')
  remove(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.productService.remove(authorization, body);
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('file', { storage: productImageStorage }))
  async uploadImage(@Headers('authorization') authorization = '', @UploadedFile() file: any) {
    await this.productService.requireUser(authorization);
    if (!file) throw new BadRequestException('请上传图片文件');
    if (!String(file.mimetype || '').startsWith('image/')) throw new BadRequestException('请上传图片文件');
    return { status: 200, message: '上传成功', result: { url: toUploadPublicUrl(file.filename, 'product-images') } };
  }
}
