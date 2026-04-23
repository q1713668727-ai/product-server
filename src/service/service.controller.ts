import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ServiceService } from './service.service';

@Controller('service')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Get('sessions')
  sessions(@Headers('authorization') authorization = '') {
    return this.serviceService.sessions(authorization);
  }

  @Get('sessions/:id/messages')
  messages(@Headers('authorization') authorization = '', @Param('id') id = '') {
    return this.serviceService.messages(authorization, Number(id));
  }

  @Post('messages/reply')
  reply(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.serviceService.reply(authorization, body);
  }

  @Post('sessions/delete')
  deleteSession(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.serviceService.deleteSession(authorization, body);
  }
}
