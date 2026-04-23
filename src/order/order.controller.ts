import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  list(@Headers('authorization') authorization = '') {
    return this.orderService.list(authorization);
  }

  @Post('ship')
  ship(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.orderService.ship(authorization, body);
  }

  @Post('cancel')
  cancel(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.orderService.cancel(authorization, body);
  }

  @Post('delete')
  delete(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.orderService.delete(authorization, body);
  }

  @Post('refund/review')
  reviewRefund(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.orderService.reviewRefund(authorization, body);
  }

  @Get('reviews')
  reviews(@Headers('authorization') authorization = '') {
    return this.orderService.reviews(authorization);
  }

  @Post('reviews/reply')
  replyReview(@Headers('authorization') authorization = '', @Body() body: any) {
    return this.orderService.replyReview(authorization, body);
  }
}
