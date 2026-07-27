# ADR 0003: Socket.IO + Redis Adapter untuk Real-time Transport

Kami memilih Socket.IO sebagai real-time transport layer dengan Redis adapter untuk horizontal scaling.

## Context

WhatsApp clone membutuhkan real-time delivery untuk messages, typing indicator, dan presence updates. Pilihan transport utama: WebSocket, SSE, atau Socket.IO yang membungkus WebSocket dengan fallback transport dan fitur built-in (rooms, reconnection, acknowledgements).

## Decision

- **Socket.IO** sebagai transport. Memberikan: room management (per-conversation), auto-reconnection, message acknowledgements, dan fallback ke long-polling jika WebSocket tidak tersedia.
- **Redis adapter** (`@socket.io/redis-adapter`) untuk broadcast events ke semua instance server. Tanpa ini, typing indicator dan message delivery hanya sampai ke koneksi di server yang sama.
- **REST + WebSocket hybrid** — REST untuk operasi CRUD (register, create group, fetch history, dll), WebSocket khusus untuk real-time events.

## Consequences

- Single device per user untuk MVP — satu koneksi Socket.IO per user.
- Socket.IO room naming convention: `conversation:{conversationId}` untuk broadcast per-chat.
- Client events: `message:send`, `typing:start`, `typing:stop`, `presence:online`.
- Server events: `message:new`, `message:status`, `typing`, `presence`.
