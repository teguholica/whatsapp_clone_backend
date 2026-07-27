import { Injectable, Inject, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ulid } from 'ulid';
import { LocalDiskStorage } from './local-disk-storage';
import { MediaResponse } from './media.types';

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif',
  'video/mp4', 'video/3gpp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const SIZE_LIMITS: Record<string, number> = {
  'image/': 16 * 1024 * 1024,
  'video/': 64 * 1024 * 1024,
  'application/': 100 * 1024 * 1024,
};

@Injectable()
export class MediaService {
  constructor(@Inject(LocalDiskStorage) private storage: LocalDiskStorage) {}

  async upload(file: Express.Multer.File): Promise<MediaResponse> {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const category = file.mimetype.split('/')[0] + '/';
    const limit = SIZE_LIMITS[category] ?? 16 * 1024 * 1024;
    if (file.size > limit) throw new PayloadTooLargeException('File exceeds size limit');

    const ext = file.originalname.split('.').pop() || 'bin';
    const filename = `${ulid()}.${ext}`;
    const url = await this.storage.save(filename, file.buffer);

    return { id: filename, url, mimeType: file.mimetype, fileSize: file.size };
  }
}
