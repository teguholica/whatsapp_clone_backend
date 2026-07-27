import {
  Controller, Get, Put, Body, Query, UseGuards, Inject,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateProfileDto } from './user.types';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(@Inject(UserService) private user: UserService) {}

  @Get('me')
  async me(@CurrentUser() user: any) {
    return this.user.getProfile(user.id);
  }

  @Put('me')
  async updateMe(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.user.updateProfile(user.id, dto);
  }

  @Get('search')
  async search(
    @CurrentUser() user: any,
    @Query('phone') phone: string,
  ) {
    if (!phone || phone.trim().length === 0) return [];
    return this.user.searchByPhone(phone.trim(), user.id);
  }
}
