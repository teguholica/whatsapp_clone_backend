import { IsString, Matches } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be in E.164 format' })
  phone: string;
}

export interface ConversationDetail {
  id: string;
  type: string;
  members: { userId: string; displayName: string | null }[];
  lastMessage: { content: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  type: string;
  otherUser: { id: string; displayName: string | null } | null;
  lastMessage: { content: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string;
}
