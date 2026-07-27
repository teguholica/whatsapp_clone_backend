import { IsNumber, IsOptional, IsString } from 'class-validator';

export class MediaResponse {
  id: string;
  url: string;
  mimeType: string;
  fileSize: number;
}
