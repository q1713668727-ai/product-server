import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
