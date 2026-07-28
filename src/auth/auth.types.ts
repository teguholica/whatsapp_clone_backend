import { IsString, MinLength, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be in E.164 format (e.g. +628123456789)' })
  phone: string;
}

export class VerifyDto {
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be in E.164 format' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must be numeric' })
  otp: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    displayName: string | null;
  };
}

export interface JwtPayload {
  sub: string;
  phone: string;
}
