import { Test, TestingModule } from '@nestjs/testing';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

describe('ConversationController', () => {
  let ctrl: ConversationController;
  let conv: jest.Mocked<ConversationService>;

  const mockUser = { id: 'u1', phone: '+6281' };
  const mockConvDetail = {
    id: 'conv-1',
    type: 'individual',
    members: [],
    lastMessage: null,
    unreadCount: 0,
    createdAt: new Date().toISOString(),
  };

  const mockConvSummary = {
    id: 'conv-1',
    type: 'individual',
    otherUser: null,
    lastMessage: null,
    unreadCount: 0,
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const convMock: jest.Mocked<Partial<ConversationService>> = {
      create: jest.fn(),
      list: jest.fn(),
      getDetail: jest.fn(),
      leave: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [{ provide: ConversationService, useValue: convMock }],
    }).compile();

    ctrl = mod.get(ConversationController);
    conv = mod.get(ConversationService) as jest.Mocked<ConversationService>;
  });

  describe('create', () => {
    it('delegates to conv.create', async () => {
      const dto = { phone: '+6282' };
      conv.create.mockResolvedValue(mockConvDetail);

      const result = await ctrl.create(mockUser, dto);

      expect(conv.create).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual(mockConvDetail);
    });
  });

  describe('list', () => {
    it('delegates to conv.list', async () => {
      conv.list.mockResolvedValue([mockConvSummary]);

      const result = await ctrl.list(mockUser);

      expect(conv.list).toHaveBeenCalledWith('u1');
      expect(result).toEqual([mockConvSummary]);
    });
  });

  describe('get', () => {
    it('delegates to conv.getDetail', async () => {
      conv.getDetail.mockResolvedValue(mockConvDetail);

      const result = await ctrl.get(mockUser, 'conv-1');

      expect(conv.getDetail).toHaveBeenCalledWith('conv-1', 'u1');
      expect(result).toEqual(mockConvDetail);
    });
  });

  describe('remove', () => {
    it('delegates to conv.leave', async () => {
      conv.leave.mockResolvedValue(undefined);

      const result = await ctrl.remove(mockUser, 'conv-1');

      expect(conv.leave).toHaveBeenCalledWith('conv-1', 'u1');
      expect(result).toEqual({ message: 'Left conversation' });
    });
  });
});
