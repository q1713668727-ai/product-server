import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}
