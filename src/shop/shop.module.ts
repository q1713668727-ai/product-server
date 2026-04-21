import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
