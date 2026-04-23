import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ServiceController],
  providers: [ServiceService],
})
export class ServiceModule {}
