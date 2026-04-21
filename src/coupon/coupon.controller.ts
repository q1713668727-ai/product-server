import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { CouponService } from './coupon.service';

@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get()
  list(@Headers('authorization') authorization = '') {
    return this.couponService.list(authorization);
  }

  @Post('save')
  save(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.couponService.save(authorization, body);
  }

  @Post('delete')
  remove(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.couponService.remove(authorization, body);
  }
}
