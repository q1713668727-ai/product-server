import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ShopService } from './shop.service';

@Controller('shops')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  list(@Headers('authorization') authorization = '') {
    return this.shopService.list(authorization);
  }

  @Post('save')
  save(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.shopService.save(authorization, body);
  }
}
