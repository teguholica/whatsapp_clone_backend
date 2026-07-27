import { IsString, IsArray, ArrayNotEmpty, ArrayMaxSize, IsOptional, MaxLength, Matches } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(255)
  @IsString({ each: true })
  @Matches(/^\+[1-9]\d{6,14}$/, { each: true, message: 'Each phone must be in E.164 format' })
  members: string[];
}

export class UpdateGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(255)
  @IsString({ each: true })
  @Matches(/^\+[1-9]\d{6,14}$/, { each: true, message: 'Each phone must be in E.164 format' })
  members: string[];
}

export class PromoteAdminDto {
  @IsString()
  userId: string;
}

export interface GroupResponse {
  id: string;
  name: string;
  type: string;
  members: { userId: string; displayName: string | null }[];
  admins: string[];
  createdAt: string;
}
