import { BadRequestException, Body, Controller, Get, Headers, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { CategoryService } from './category.service';

const multer = require('multer');

const categoryIconStorage = multer.diskStorage({
  destination: (_req: any, _file: any, callback: any) => {
    const dir = join(process.cwd(), 'uploads', 'category-icons');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req: any, file: any, callback: any) => {
    const ext = extname(file.originalname || '').toLowerCase() || '.png';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  list(@Headers('authorization') authorization = '') {
    return this.categoryService.list(authorization);
  }

  @Post('save')
  save(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.categoryService.save(authorization, body);
  }

  @Post('icon')
  @UseInterceptors(FileInterceptor('file', { storage: categoryIconStorage }))
  async uploadIcon(@Headers('authorization') authorization = '', @UploadedFile() file: any) {
    await this.categoryService.requireAdmin(authorization);
    if (!file) throw new BadRequestException('请上传图片文件');
    if (!String(file.mimetype || '').startsWith('image/')) throw new BadRequestException('请上传图片文件');
    return { status: 200, message: '上传成功', result: { url: `/uploads/category-icons/${file.filename}` } };
  }

  @Post('delete')
  remove(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.categoryService.remove(authorization, body);
  }
}
