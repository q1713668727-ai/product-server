import { BadRequestException, Body, Controller, Get, Headers, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { toUploadPublicUrl } from '../common/upload-path.util';
import { AuthService } from './auth.service';

const multer = require('multer');

const shopAvatarStorage = multer.diskStorage({
  destination: (_req: any, _file: any, callback: any) => {
    const dir = join(process.cwd(), 'uploads', 'shop-avatars');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req: any, file: any, callback: any) => {
    const ext = extname(file.originalname || '').toLowerCase() || '.png';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: any) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body);
  }

  @Get('me')
  me(@Headers('authorization') authorization = '') {
    return this.authService.me(authorization.replace(/^Bearer\s+/i, '').trim());
  }

  @Post('logout')
  logout(@Headers('authorization') authorization = '') {
    return this.authService.logout(authorization.replace(/^Bearer\s+/i, '').trim());
  }

  @Post('me/password')
  updateMyPassword(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.authService.updateMyPassword(authorization.replace(/^Bearer\s+/i, '').trim(), body);
  }

  @Post('me/shop')
  updateMyShopProfile(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.authService.updateMyShopProfile(authorization.replace(/^Bearer\s+/i, '').trim(), body);
  }

  @Post('me/shop/avatar')
  @UseInterceptors(FileInterceptor('file', { storage: shopAvatarStorage }))
  async uploadShopAvatar(@Headers('authorization') authorization = '', @UploadedFile() file: any) {
    await this.authService.getUserByToken(authorization.replace(/^Bearer\s+/i, '').trim());
    if (!file) throw new BadRequestException('请上传图片文件');
    if (!String(file.mimetype || '').startsWith('image/')) throw new BadRequestException('请上传图片文件');
    return { status: 200, message: '上传成功', result: { url: toUploadPublicUrl(file.filename, 'shop-avatars') } };
  }

  @Post('me/cancel')
  cancelMyAccount(@Headers('authorization') authorization = '') {
    return this.authService.cancelMyAccount(authorization.replace(/^Bearer\s+/i, '').trim());
  }

  @Get('users')
  users(@Headers('authorization') authorization = '') {
    return this.authService.listUsers(authorization.replace(/^Bearer\s+/i, '').trim());
  }

  @Post('users/update')
  updateUser(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.authService.updateUser(authorization.replace(/^Bearer\s+/i, '').trim(), Number(body.id), body);
  }

  @Post('users/password')
  updateUserPassword(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.authService.updateUserPassword(authorization.replace(/^Bearer\s+/i, '').trim(), Number(body.id), body);
  }

  @Post('users/cancel')
  cancelUser(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.authService.cancelUser(authorization.replace(/^Bearer\s+/i, '').trim(), Number(body.id));
  }

  @Post('users/enter')
  enterUser(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.authService.enterUser(authorization.replace(/^Bearer\s+/i, '').trim(), Number(body.id));
  }
}
