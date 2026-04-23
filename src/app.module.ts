import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { ShopModule } from './shop/shop.module';
import { CouponModule } from './coupon/coupon.module';
import { OrderModule } from './order/order.module';
import { ServiceModule } from './service/service.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, CategoryModule, ProductModule, ShopModule, CouponModule, OrderModule, ServiceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
