import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, Pool } from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = createPool({
      host: this.configService.get('DB_HOST') || '127.0.0.1',
      port: Number(this.configService.get('DB_PORT') || 3306),
      user: this.configService.get('DB_USER') || 'root',
      password: this.configService.get('DB_PASSWORD') || '990125wyf.',
      database: this.configService.get('DB_NAME') || 'backstage_server',
      charset: this.configService.get('DB_CHARSET') || 'utf8mb4',
      connectionLimit: Number(this.configService.get('DB_CONNECTION_LIMIT') || 10),
    });
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async execute<T = any>(sql: string, params: any[] = []): Promise<T> {
    const [result] = await this.pool.execute(sql, params);
    return result as T;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
