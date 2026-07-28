import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let ctrl: UserController;
  let user: jest.Mocked<UserService>;

  const mockUser = { id: 'u1', phone: '+6281' };
  const mockProfile = {
    id: 'u1',
    phone: '+6281',
    displayName: null,
    avatarUrl: null,
    lastSeenAt: null,
  };

  beforeEach(async () => {
    const userMock: jest.Mocked<Partial<UserService>> = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      searchByPhone: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userMock }],
    }).compile();

    ctrl = mod.get(UserController);
    user = mod.get(UserService) as jest.Mocked<UserService>;
  });

  describe('me', () => {
    it('delegates to user.getProfile', async () => {
      user.getProfile.mockResolvedValue(mockProfile);

      const result = await ctrl.me(mockUser);

      expect(user.getProfile).toHaveBeenCalledWith('u1');
      expect(result).toEqual(mockProfile);
    });
  });

  describe('updateMe', () => {
    it('delegates to user.updateProfile', async () => {
      const dto = { displayName: 'Alice' };
      user.updateProfile.mockResolvedValue({ ...mockProfile, displayName: 'Alice' });

      const result = await ctrl.updateMe(mockUser, dto);

      expect(user.updateProfile).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual({ ...mockProfile, displayName: 'Alice' });
    });
  });

  describe('search', () => {
    it('returns empty array when phone is empty', async () => {
      const result = await ctrl.search(mockUser, '');

      expect(result).toEqual([]);
      expect(user.searchByPhone).not.toHaveBeenCalled();
    });

    it('returns empty array when phone is whitespace', async () => {
      const result = await ctrl.search(mockUser, '   ');

      expect(result).toEqual([]);
      expect(user.searchByPhone).not.toHaveBeenCalled();
    });

    it('delegates to user.searchByPhone with trimmed phone', async () => {
      user.searchByPhone.mockResolvedValue([mockProfile]);

      const result = await ctrl.search(mockUser, '+6282');

      expect(user.searchByPhone).toHaveBeenCalledWith('+6282', 'u1');
      expect(result).toEqual([mockProfile]);
    });
  });
});
