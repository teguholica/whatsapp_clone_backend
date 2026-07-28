import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { MediaService } from './media.service';
import { LocalDiskStorage } from './local-disk-storage';

describe('MediaService', () => {
  let svc: MediaService;
  let storage: jest.Mocked<LocalDiskStorage>;

  function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
    return {
      fieldname: 'file',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-data'),
      size: 1024,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
      ...overrides,
    };
  }

  beforeEach(async () => {
    const storageMock: jest.Mocked<Partial<LocalDiskStorage>> = {
      save: jest.fn().mockResolvedValue('/uploads/test.png'),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: LocalDiskStorage, useValue: storageMock },
      ],
    }).compile();

    svc = mod.get(MediaService);
    storage = mod.get(LocalDiskStorage) as jest.Mocked<LocalDiskStorage>;
  });

  describe('upload', () => {
    it('accepts valid image/jpeg', async () => {
      const file = makeFile({ mimetype: 'image/jpeg', originalname: 'photo.jpg' });
      storage.save.mockResolvedValue('/uploads/photo.jpg');

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('image/jpeg');
      expect(storage.save).toHaveBeenCalled();
    });

    it('accepts valid video/mp4', async () => {
      const file = makeFile({ mimetype: 'video/mp4', originalname: 'clip.mp4', size: 1024 * 1024 });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('video/mp4');
    });

    it('accepts valid application/pdf', async () => {
      const file = makeFile({ mimetype: 'application/pdf', originalname: 'doc.pdf', size: 1024 * 1024 });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('application/pdf');
    });

    it('accepts valid image/png', async () => {
      const file = makeFile({ mimetype: 'image/png', originalname: 'img.png' });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('image/png');
    });

    it('accepts valid image/gif', async () => {
      const file = makeFile({ mimetype: 'image/gif', originalname: 'anim.gif' });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('image/gif');
    });

    it('accepts valid video/3gpp', async () => {
      const file = makeFile({ mimetype: 'video/3gpp', originalname: 'clip.3gp', size: 1024 * 1024 });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('video/3gpp');
    });

    it('accepts valid application/msword', async () => {
      const file = makeFile({ mimetype: 'application/msword', originalname: 'doc.doc', size: 1024 * 1024 });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('application/msword');
    });

    it('accepts valid application/vnd.openxmlformats-officedocument.wordprocessingml.document', async () => {
      const file = makeFile({ mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalname: 'doc.docx', size: 1024 * 1024 });

      const result = await svc.upload(file);

      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('rejects unsupported file type', async () => {
      const file = makeFile({ mimetype: 'application/xml', originalname: 'data.xml' });

      await expect(svc.upload(file)).rejects.toThrow(BadRequestException);
    });

    it('rejects image exceeding 16MB', async () => {
      const file = makeFile({ mimetype: 'image/jpeg', size: 17 * 1024 * 1024 });

      await expect(svc.upload(file)).rejects.toThrow(PayloadTooLargeException);
    });

    it('rejects video exceeding 64MB', async () => {
      const file = makeFile({ mimetype: 'video/mp4', size: 65 * 1024 * 1024 });

      await expect(svc.upload(file)).rejects.toThrow(PayloadTooLargeException);
    });

    it('rejects application exceeding 100MB', async () => {
      const file = makeFile({ mimetype: 'application/pdf', size: 101 * 1024 * 1024 });

      await expect(svc.upload(file)).rejects.toThrow(PayloadTooLargeException);
    });

    it('rejects missing file', async () => {
      await expect(svc.upload(null as any)).rejects.toThrow(BadRequestException);
    });

    it('returns correct response shape on success', async () => {
      const file = makeFile({ mimetype: 'image/png', originalname: 'photo.png', size: 2048 });
      storage.save.mockResolvedValue('/uploads/abc123.png');

      const result = await svc.upload(file);

      expect(result).toMatchObject({
        id: expect.any(String),
        url: '/uploads/abc123.png',
        mimeType: 'image/png',
        fileSize: 2048,
      });
    });
  });
});
