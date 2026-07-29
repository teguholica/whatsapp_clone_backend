import { Test, TestingModule } from '@nestjs/testing';
import { WsGateway } from './ws.gateway';
import { WsRoomManager } from './ws-room-manager';
import { DatabaseService } from '../shared/database/database.service';
import { RedisService } from '../shared/redis/redis.service';

describe('WsGateway', () => {
  let gateway: WsGateway;
  let rooms: WsRoomManager;
  let db: jest.Mocked<DatabaseService>;

  const mockPool = { query: jest.fn() };

  function makeClient(userId?: string) {
    return {
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      __userId: userId ?? 'user1',
    } as any;
  }

  function expectSent(client: any, event: string, data: any) {
    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({ event, data }),
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const redisMock: jest.Mocked<Partial<RedisService>> = {
      getClient: jest.fn().mockReturnValue({ get: jest.fn(), set: jest.fn(), del: jest.fn() }),
    };

    const dbMock: jest.Mocked<Partial<DatabaseService>> = {
      getPool: jest.fn().mockReturnValue(mockPool as any),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        WsRoomManager,
        { provide: RedisService, useValue: redisMock },
        { provide: DatabaseService, useValue: dbMock },
      ],
    }).compile();

    gateway = mod.get(WsGateway);
    rooms = mod.get(WsRoomManager);
    db = mod.get(DatabaseService) as jest.Mocked<DatabaseService>;
  });

  describe('broadcastToRoom', () => {
    it('sends event to all clients in room except excluded userId', () => {
      const recipient = makeClient('recipient');
      const sender = makeClient('sender');
      const other = makeClient('other');
      rooms.join(recipient, 'conv1');
      rooms.join(sender, 'conv1');
      rooms.join(other, 'conv1');

      const delivered = gateway.broadcastToRoom('conv1', 'message:new', { text: 'hi' }, 'sender');

      expectSent(recipient, 'message:new', { text: 'hi' });
      expect(sender.send).not.toHaveBeenCalled();
      expect(other.send).toHaveBeenCalled();
      expect(delivered).toEqual(['recipient', 'other']);
    });

    it('returns empty array when room has no clients', () => {
      const delivered = gateway.broadcastToRoom('empty', 'ev', {});
      expect(delivered).toEqual([]);
    });

    it('skips clients that are not ready', () => {
      const ready = makeClient('ready');
      const notReady = makeClient('not-ready');
      notReady.readyState = 3;
      rooms.join(ready, 'conv1');
      rooms.join(notReady, 'conv1');

      const delivered = gateway.broadcastToRoom('conv1', 'ev', {});

      expect(ready.send).toHaveBeenCalled();
      expect(notReady.send).not.toHaveBeenCalled();
      expect(delivered).toEqual(['ready']);
    });
  });

  describe('markRead', () => {
    const messageId = 'msg1';
    const userId = 'user1';
    const conversationId = 'conv1';
    const otherUserId = 'user2';

    it('updates message_status to read for individual conversation', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ conversation_id: conversationId, sender_id: otherUserId }] })
        .mockResolvedValueOnce({ rows: [{ type: 'individual' }] })
        .mockResolvedValueOnce({ rows: [] });

      await gateway.markRead(messageId, userId);

      const upsertCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('INSERT INTO message_status'),
      );
      expect(upsertCall).toBeDefined();
      expect(upsertCall![1]).toEqual([messageId, userId]);
    });

    it('broadcasts message:status to room', async () => {
      const client = makeClient('listener');
      rooms.join(client, conversationId);
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ conversation_id: conversationId, sender_id: otherUserId }] })
        .mockResolvedValueOnce({ rows: [{ type: 'individual' }] })
        .mockResolvedValueOnce({ rows: [] });

      await gateway.markRead(messageId, userId);

      expectSent(client, 'message:status', { messageId, userId, status: 'read' });
    });

    it('does nothing for group conversations', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ conversation_id: conversationId, sender_id: otherUserId }] })
        .mockResolvedValueOnce({ rows: [{ type: 'group' }] });

      await gateway.markRead(messageId, userId);

      const upsertCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('INSERT INTO message_status'),
      );
      expect(upsertCall).toBeUndefined();
    });

    it('does nothing for unknown message', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(gateway.markRead('unknown', userId)).resolves.not.toThrow();

      const convCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes('conversations'),
      );
      expect(convCall).toBeUndefined();
    });
  });

  describe('broadcastToAll', () => {
    it('excludes sender when excludeUserId provided', () => {
      const sender = makeClient('sender');
      const recipient = makeClient('recipient');
      const other = makeClient('other');
      (gateway as any).connections.set(sender, { id: 'sender', phone: '+1' });
      (gateway as any).connections.set(recipient, { id: 'recipient', phone: '+2' });
      (gateway as any).connections.set(other, { id: 'other', phone: '+3' });

      (gateway as any).broadcastToAll('presence', { userId: 'sender', status: 'online' }, 'sender');

      expect(sender.send).not.toHaveBeenCalled();
      expect(recipient.send).toHaveBeenCalled();
      expect(other.send).toHaveBeenCalled();
    });
  });

  describe('deliverPending', () => {
    const userId = 'userB';
    const conversationId = 'conv1';
    const messageId = 'msg1';
    const pendingRow = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: 'userA',
      type: 'text',
      content: 'Hello!',
      created_at: new Date(),
    };

    it('delivers pending messages and updates status to delivered', async () => {
      const client = makeClient(userId);
      rooms.join(client, conversationId);
      mockPool.query.mockResolvedValueOnce({ rows: [pendingRow] });

      await (gateway as any).deliverPending(client, conversationId, userId);

      expect(client.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(client.send.mock.calls[0][0]);
      expect(sent.event).toBe('message:new');
      expect(sent.data).toMatchObject({
        id: messageId,
        conversationId,
        senderId: 'userA',
        type: 'text',
        content: 'Hello!',
      });
      expect(typeof sent.data.createdAt).toBe('string');

      const updateCall = mockPool.query.mock.calls.find(
        (c) => c[0].includes("UPDATE message_status SET status = 'delivered'"),
      );
      expect(updateCall).toBeDefined();
    });

    it('broadcasts message:status delivered to room', async () => {
      const listener = makeClient('listener');
      const client = makeClient(userId);
      rooms.join(client, conversationId);
      rooms.join(listener, conversationId);
      mockPool.query.mockResolvedValueOnce({ rows: [pendingRow] });

      await (gateway as any).deliverPending(client, conversationId, userId);

      expectSent(listener, 'message:status', { messageId, userId, status: 'delivered' });
    });

    it('does nothing when no pending messages', async () => {
      const client = makeClient(userId);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await (gateway as any).deliverPending(client, conversationId, userId);

      expect(client.send).not.toHaveBeenCalled();
    });
  });
});
