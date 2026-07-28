import { WsRoomManager } from './ws-room-manager';

describe('WsRoomManager', () => {
  let manager: WsRoomManager;
  let client1: any;
  let client2: any;

  beforeEach(() => {
    manager = new WsRoomManager();
    client1 = { readyState: 1, send: jest.fn() };
    client2 = { readyState: 1, send: jest.fn() };
  });

  function makeClient() {
    return { readyState: 1, send: jest.fn() };
  }

  describe('join', () => {
    it('adds client to room', () => {
      manager.join(client1 as any, 'room1');
      (manager as any).broadcast('room1', 'test', { x: 1 });
      expect(client1.send).toHaveBeenCalledWith(
        JSON.stringify({ event: 'test', data: { x: 1 } }),
      );
    });

    it('adds client to multiple rooms', () => {
      manager.join(client1 as any, 'room1');
      manager.join(client1 as any, 'room2');
      (manager as any).broadcast('room1', 'e1', {});
      (manager as any).broadcast('room2', 'e2', {});
      expect(client1.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('leave', () => {
    it('removes client from room', () => {
      manager.join(client1 as any, 'room1');
      manager.leave(client1 as any, 'room1');
      (manager as any).broadcast('room1', 'test', {});
      expect(client1.send).not.toHaveBeenCalled();
    });

    it('does not affect other clients', () => {
      manager.join(client1 as any, 'room1');
      manager.join(client2 as any, 'room1');
      manager.leave(client1 as any, 'room1');
      (manager as any).broadcast('room1', 'test', {});
      expect(client1.send).not.toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalled();
    });
  });

  describe('leaveAll', () => {
    it('removes client from all rooms', () => {
      manager.join(client1 as any, 'room1');
      manager.join(client1 as any, 'room2');
      manager.join(client2 as any, 'room1');
      manager.leaveAll(client1 as any);
      (manager as any).broadcast('room1', 'test', {});
      (manager as any).broadcast('room2', 'test2', {});
      expect(client1.send).not.toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcast', () => {
    it('sends message to all clients in room', () => {
      const clients = [makeClient(), makeClient(), makeClient()];
      clients.forEach((c) => manager.join(c as any, 'room1'));

      (manager as any).broadcast('room1', 'ev', { a: 1 });

      clients.forEach((c) => {
        expect(c.send).toHaveBeenCalledWith(
          JSON.stringify({ event: 'ev', data: { a: 1 } }),
        );
      });
    });

    it('skips clients that are not ready', () => {
      const open = makeClient();
      const closed = makeClient();
      closed.readyState = 3;
      manager.join(open as any, 'room1');
      manager.join(closed as any, 'room1');

      (manager as any).broadcast('room1', 'ev', {});

      expect(open.send).toHaveBeenCalled();
      expect(closed.send).not.toHaveBeenCalled();
    });

    it('does nothing when room is empty', () => {
      expect(() =>
        (manager as any).broadcast('nonexistent', 'ev', {}),
      ).not.toThrow();
    });
  });

  describe('broadcastToAll', () => {
    it('sends message to all clients in any room', () => {
      const a = makeClient();
      const b = makeClient();
      manager.join(a as any, 'room1');
      manager.join(b as any, 'room2');

      (manager as any).broadcastToAll('ev', { x: 1 });

      expect(a.send).toHaveBeenCalledWith(
        JSON.stringify({ event: 'ev', data: { x: 1 } }),
      );
      expect(b.send).toHaveBeenCalledWith(
        JSON.stringify({ event: 'ev', data: { x: 1 } }),
      );
    });
  });
});
