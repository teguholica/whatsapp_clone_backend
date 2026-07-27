import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export interface UserProfile {
  id: string;
  phone: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
}
