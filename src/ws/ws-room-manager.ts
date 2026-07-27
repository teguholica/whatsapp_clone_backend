import { Injectable, Inject } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class WsRoomManager {
  private rooms = new Map<string, Set<WebSocket>>();
  private clientRooms = new Map<WebSocket, Set<string>>();

  join(client: WebSocket, roomId: string): void {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(client);

    if (!this.clientRooms.has(client)) this.clientRooms.set(client, new Set());
    this.clientRooms.get(client)!.add(roomId);
  }

  leave(client: WebSocket, roomId: string): void {
    this.rooms.get(roomId)?.delete(client);
    this.clientRooms.get(client)?.delete(roomId);
  }

  leaveAll(client: WebSocket): void {
    const rooms = this.clientRooms.get(client);
    if (rooms) {
      for (const roomId of rooms) {
        this.rooms.get(roomId)?.delete(client);
      }
    }
    this.clientRooms.delete(client);
  }

  broadcast(roomId: string, event: string, data: any): void {
    const message = JSON.stringify({ event, data });
    const clients = this.rooms.get(roomId);
    console.log(`[WS-RM] broadcast ${event} to ${roomId}, clients: ${clients?.size || 0}`);
    if (!clients) return;
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
        console.log(`[WS-RM] Sent ${event} to client`);
      }
    }
  }

  broadcastToAll(event: string, data: any): void {
    const message = JSON.stringify({ event, data });
    for (const [client, _rooms] of this.clientRooms) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}
