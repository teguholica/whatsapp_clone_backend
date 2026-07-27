import { Controller, Post, Put, Delete, Body, Param, UseGuards, Inject } from '@nestjs/common';
import { GroupService } from './group.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateGroupDto, UpdateGroupDto, AddMembersDto, PromoteAdminDto } from './group.types';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(@Inject(GroupService) private group: GroupService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateGroupDto) {
    return this.group.create(user.id, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.group.update(id, user.id, dto);
  }

  @Post(':id/members')
  async addMembers(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.group.addMembers(id, user.id, dto);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('userId') targetId: string,
  ) {
    return this.group.removeMember(id, user.id, targetId);
  }

  @Post(':id/admins')
  async promoteAdmin(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: PromoteAdminDto,
  ) {
    return this.group.promoteAdmin(id, user.id, dto);
  }

  @Delete(':id/admins/:userId')
  async demoteAdmin(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('userId') targetId: string,
  ) {
    return this.group.demoteAdmin(id, user.id, { userId: targetId });
  }
}
