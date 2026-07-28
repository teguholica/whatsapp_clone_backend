import * as path from 'path';
import { LocalDiskStorage } from './local-disk-storage';

const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  promises: {
    writeFile: (...args: any[]) => mockWriteFile(...args),
  },
}));

describe('LocalDiskStorage', () => {
  const testUploadDir = '/tmp/test-uploads';
  const originalUploadDir = process.env.UPLOAD_DIR;

  afterEach(() => {
    if (originalUploadDir) {
      process.env.UPLOAD_DIR = originalUploadDir;
    } else {
      delete process.env.UPLOAD_DIR;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    process.env.UPLOAD_DIR = testUploadDir;
  });

  describe('save', () => {
    it('writes buffer to correct file path', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      const storage = new LocalDiskStorage();
      const filename = 'abc123.png';
      const buffer = Buffer.from('image-data');

      const url = await storage.save(filename, buffer);

      const expectedPath = path.join(testUploadDir, filename);
      expect(mockWriteFile).toHaveBeenCalledWith(expectedPath, buffer);
      expect(url).toBe(`/uploads/${filename}`);
    });

    it('creates upload directory if not exists', () => {
      mockExistsSync.mockReturnValue(false);

      const storage = new LocalDiskStorage();

      expect(mockMkdirSync).toHaveBeenCalledWith(testUploadDir, { recursive: true });
    });

    it('uses default uploads dir when UPLOAD_DIR not set', () => {
      delete process.env.UPLOAD_DIR;
      mockExistsSync.mockReturnValue(true);

      const storage = new LocalDiskStorage();

      const defaultDir = path.resolve('uploads');
      expect(mockExistsSync).toHaveBeenCalledWith(defaultDir);
    });
  });
});
