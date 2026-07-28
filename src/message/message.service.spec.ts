import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { MessageService } from './message.service';
import { DatabaseService } from '../shared/database/database.service';
import { WsGateway } from '../ws/ws.gateway';

describe('MessageService', () => {
  let msg: MessageService;
  let db: jest.Mocked<DatabaseService>;
  let ws: jest.Mocked<WsGateway>;

  const userId = '01ARBQS4S5X3PNC3P0QN8Y6DVA';
  const otherId = '01ARBQS4S5X3PNC3P0QN8Y6DVB';
  const conversationId = '01ARBQS4S5X3PNC3P0QN8Y6DVC';
  const messageId = '01ARBQS4S5X3PNC3P0QN8Y6DVD';

  const mockPool = { query: jest.fn() };

  const now = new Date();
  const msgRow = {
    id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    type: 'text',
    content: 'Hello!',
    created_at: now,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      getPool: jest.fn().mockReturnValue(mockPool as any),
    };

    const wsMock: jest.Mocked<Partial<WsGateway>> = {
      broadcastToRoom: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        { provide: DatabaseService, useValue: dbMock },
        { provide: WsGateway, useValue: wsMock },
      ],
    }).compile();

    msg = mod.get(MessageService);
    db = mod.get(DatabaseService) as jest.Mocked<DatabaseService>;
    ws = mod.get(WsGateway) as jest.Mocked<WsGateway>;
  });

  describe('send', () => {
    beforeEach(() => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: conversationId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ user_id: otherId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [msgRow] });
      ws.broadcastToRoom.mockReturnValue([]);
    });

    it('inserts message, creates status rows, broadcasts via WS', async () => {
      const result = await msg.send(conversationId, userId, 'Hello!');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('conversations'),
        expect.arrayContaining([userId, conversationId]),
      );

      const insertMsgCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('INSERT INTO messages'),
      );
      expect(insertMsgCall).toBeDefined();
      expect(insertMsgCall![1]).toEqual([
        expect.any(String),
        conversationId,
        userId,
        'Hello!',
      ]);

      const insertStatusCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('INSERT INTO message_status'),
      );
      expect(insertStatusCall).toBeDefined();

      expect(ws.broadcastToRoom).toHaveBeenCalledWith(
        conversationId,
        'message:new',
        expect.objectContaining({ content: 'Hello!' }),
        userId,
      );

      expect(result).toMatchObject({
        id: messageId,
        conversationId,
        senderId: userId,
        content: 'Hello!',
      });
    });

    it('upgrades status to delivered for online recipients', async () => {
      ws.broadcastToRoom.mockReturnValue([otherId]);

      const result = await msg.send(conversationId, userId, 'Hello!');

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes("UPDATE message_status SET status = 'delivered'"),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual([
        expect.any(String),
        otherId,
      ]);

      expect(ws.broadcastToRoom).toHaveBeenCalledWith(
        conversationId,
        'message:status',
        { messageId: expect.any(String), userId: otherId, status: 'delivered' },
        userId,
      );
    });

    it('throws ForbiddenException for non-member', async () => {
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        msg.send(conversationId, userId, 'Hello!'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      mockPool.query.mockReset();
    });

    it('inserts message_deletions row for mode=me', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...msgRow, deleted_at: null, deleted_by: null }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await msg.delete(messageId, userId, 'me');

      const insertCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('INSERT INTO message_deletions'),
      );
      expect(insertCall).toBeDefined();
      expect(ws.broadcastToRoom).toHaveBeenCalledWith(
        conversationId, 'message:deleted',
        { messageId, mode: 'me' },
        userId,
      );
    });

    it('sets deleted_at for mode=everyone as sender', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...msgRow, deleted_at: null, deleted_by: null }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await msg.delete(messageId, userId, 'everyone');

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('UPDATE messages SET deleted_at'),
      );
      expect(updateCall).toBeDefined();
      expect(ws.broadcastToRoom).toHaveBeenCalledWith(
        conversationId, 'message:deleted',
        { messageId, mode: 'everyone' },
        userId,
      );
    });

    it('throws ForbiddenException when non-sender tries delete for everyone', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: messageId, conversation_id: conversationId, sender_id: otherId, created_at: now }],
      });

      await expect(
        msg.delete(messageId, userId, 'everyone'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when deleting for everyone after 30 min', async () => {
      const oldDate = new Date(Date.now() - 31 * 60 * 1000);
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: messageId, conversation_id: conversationId, sender_id: userId, created_at: oldDate }],
      });

      await expect(
        msg.delete(messageId, userId, 'everyone'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        msg.delete('unknown', userId, 'me'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    const messages = [
      { id: 'msg2', conversation_id: conversationId, sender_id: userId, type: 'text', content: 'Second', created_at: new Date(Date.now() - 60 * 1000) },
      { id: 'msg1', conversation_id: conversationId, sender_id: userId, type: 'text', content: 'First', created_at: new Date(Date.now() - 120 * 1000) },
    ];

    beforeEach(() => {
      mockPool.query.mockReset();
    });

    it('returns messages newest-first with limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      mockPool.query.mockResolvedValueOnce({ rows: messages });

      const result = await msg.list(conversationId, userId, 10);

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[1]).toContain(conversationId);
      expect(queryCall[1]).toContain(10);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Second');
    });

    it('paginates with before cursor', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [messages[1]] });

      const result = await msg.list(conversationId, userId, 10, 'msg2');

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[1]).toContain('msg2');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('First');
    });

    it('excludes user-deleted messages via message_deletions join', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [messages[0]] });

      const result = await msg.list(conversationId, userId, 10);

      const queryCall = mockPool.query.mock.calls[1][0];
      expect(queryCall).toContain('message_deletions');
      expect(queryCall).toContain('LEFT JOIN');
      expect(result).toHaveLength(1);
    });

    it('throws ForbiddenException for non-member', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        msg.list(conversationId, userId, 10),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces max limit of 100', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await msg.list(conversationId, userId, 999);

      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[1]).toContain(100);
    });
  });
});
