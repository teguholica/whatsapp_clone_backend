import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RateLimitService } from './rate-limit.service';
import { RefreshDto } from './auth.types';

describe('AuthController', () => {
  let ctrl: AuthController;
  let auth: jest.Mocked<AuthService>;

  const validBody = new RefreshDto();
  validBody.refreshToken = 'eyJ.valid';

  const mockResponse = {
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    user: { id: 'u1', phone: '+6281', displayName: null },
  };

  beforeEach(async () => {
    const authMock: jest.Mocked<Partial<AuthService>> = {
      refresh: jest.fn(),
    };
    const rateLimitMock: jest.Mocked<Partial<RateLimitService>> = {};

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: RateLimitService, useValue: rateLimitMock },
      ],
    }).compile();

    ctrl = mod.get(AuthController);
    auth = mod.get(AuthService) as jest.Mocked<AuthService>;
  });

  describe('refresh', () => {
    it('calls auth.refresh with the refresh token', async () => {
      auth.refresh.mockResolvedValue(mockResponse);

      const result = await ctrl.refresh(validBody);

      expect(auth.refresh).toHaveBeenCalledWith(validBody.refreshToken);
      expect(result).toEqual(mockResponse);
    });
  });
});
