import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  let ctrl: MediaController;
  let media: jest.Mocked<MediaService>;

  const mockFile = {
    originalname: 'test.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from(''),
    size: 1000,
  } as Express.Multer.File;

  const mockResponse = {
    id: 'file-1',
    url: '/uploads/test.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1000,
  };

  beforeEach(async () => {
    const mediaMock: jest.Mocked<Partial<MediaService>> = {
      upload: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaMock }],
    }).compile();

    ctrl = mod.get(MediaController);
    media = mod.get(MediaService) as jest.Mocked<MediaService>;
  });

  describe('upload', () => {
    it('delegates to media.upload', async () => {
      media.upload.mockResolvedValue(mockResponse);

      const result = await ctrl.upload(mockFile);

      expect(media.upload).toHaveBeenCalledWith(mockFile);
      expect(result).toEqual(mockResponse);
    });
  });
});
