import { IsString, IsIn, IsOptional, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096, { message: 'Message text must be at most 4096 characters' })
  content: string;

  @IsString()
  @IsOptional()
  @IsIn(['text'])
  type?: string;
}

export class MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string;
  createdAt: string;
}
