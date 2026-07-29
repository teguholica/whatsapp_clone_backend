import { Test, TestingModule } from '@nestjs/testing';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { BadRequestException } from '@nestjs/common';

describe('MessageController', () => {
  let ctrl: MessageController;
  let msg: jest.Mocked<MessageService>;

  const mockUser = { id: 'u1', phone: '+6281' };
  const mockMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'u1',
    type: 'text',
    content: 'Hello',
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const msgMock: jest.Mocked<Partial<MessageService>> = {
      send: jest.fn(),
      list: jest.fn(),
      delete: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [MessageController],
      providers: [
        { provide: MessageService, useValue: msgMock },
      ],
    }).compile();

    ctrl = mod.get(MessageController);
    msg = mod.get(MessageService) as jest.Mocked<MessageService>;
  });

  describe('send', () => {
    it('throws BadRequestException when content is too short', async () => {
      await expect(
        ctrl.send(mockUser, 'conv-1', { content: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when content exceeds 4096 chars', async () => {
      await expect(
        ctrl.send(mockUser, 'conv-1', { content: 'a'.repeat(4097) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when content is missing', async () => {
      await expect(
        ctrl.send(mockUser, 'conv-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to msg.send with valid content', async () => {
      msg.send.mockResolvedValue(mockMessage);

      const result = await ctrl.send(mockUser, 'conv-1', { content: 'Hello' });

      expect(msg.send).toHaveBeenCalledWith('conv-1', 'u1', 'Hello', 'text');
      expect(result).toEqual(mockMessage);
    });

    it('passes type to msg.send when provided', async () => {
      msg.send.mockResolvedValue({ ...mockMessage, type: 'image' });

      const result = await ctrl.send(mockUser, 'conv-1', { content: 'Photo', type: 'image' });

      expect(msg.send).toHaveBeenCalledWith('conv-1', 'u1', 'Photo', 'image');
    });

    it('defaults type to text when not provided', async () => {
      msg.send.mockResolvedValue(mockMessage);

      await ctrl.send(mockUser, 'conv-1', { content: 'Hi' });

      expect(msg.send).toHaveBeenCalledWith('conv-1', 'u1', 'Hi', 'text');
    });
  });

  describe('list', () => {
    it('delegates to msg.list with default limit', async () => {
      msg.list.mockResolvedValue([mockMessage]);

      const result = await ctrl.list(mockUser, 'conv-1', 50, undefined);

      expect(msg.list).toHaveBeenCalledWith('conv-1', 'u1', 50, undefined);
      expect(result).toEqual([mockMessage]);
    });

    it('delegates to msg.list with before cursor', async () => {
      msg.list.mockResolvedValue([mockMessage]);

      const result = await ctrl.list(mockUser, 'conv-1', 20, 'msg-0');

      expect(msg.list).toHaveBeenCalledWith('conv-1', 'u1', 20, 'msg-0');
      expect(result).toEqual([mockMessage]);
    });
  });

  describe('remove', () => {
    it('throws BadRequestException when mode is invalid', async () => {
      await expect(
        ctrl.remove(mockUser, 'msg-1', 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to msg.delete with mode "me"', async () => {
      msg.delete.mockResolvedValue({ message: 'Message deleted' });

      const result = await ctrl.remove(mockUser, 'msg-1', 'me');

      expect(msg.delete).toHaveBeenCalledWith('msg-1', 'u1', 'me');
      expect(result).toEqual({ message: 'Message deleted' });
    });

    it('delegates to msg.delete with mode "everyone"', async () => {
      msg.delete.mockResolvedValue({ message: 'Message deleted' });

      const result = await ctrl.remove(mockUser, 'msg-1', 'everyone');

      expect(msg.delete).toHaveBeenCalledWith('msg-1', 'u1', 'everyone');
      expect(result).toEqual({ message: 'Message deleted' });
    });
  });
});
