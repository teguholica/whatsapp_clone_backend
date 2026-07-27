import { Controller, Post, Get, Delete, Body, Param, UseGuards, Inject } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateConversationDto } from './conversation.types';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(@Inject(ConversationService) private conv: ConversationService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateConversationDto) {
    return this.conv.create(user.id, dto);
  }

  @Get()
  async list(@CurrentUser() user: any) {
    return this.conv.list(user.id);
  }

  @Get(':id')
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conv.getDetail(id, user.id);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.conv.leave(id, user.id);
    return { message: 'Left conversation' };
  }
}
