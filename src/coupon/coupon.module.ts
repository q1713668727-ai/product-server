import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CouponController],
  providers: [CouponService],
})
export class CouponModule {}
