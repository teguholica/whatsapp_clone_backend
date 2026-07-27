import {
  Controller, Post, Get, Body, Param, Query, UseGuards, Inject, DefaultValuePipe, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SendMessageDto } from './message.types';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(@Inject(MessageService) private msg: MessageService) {}

  @Post(':conversationId')
  async send(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Body() body: Record<string, any>,
  ) {
    const content = typeof body?.content === 'string' ? body.content : '';
    if (content.length < 1 || content.length > 4096) {
      throw new BadRequestException('Message text must be between 1 and 4096 characters');
    }
    return this.msg.send(conversationId, user.id, content);
  }

  @Get(':conversationId')
  async list(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('before') before?: string,
  ) {
    return this.msg.list(conversationId, user.id, limit, before);
  }
}
