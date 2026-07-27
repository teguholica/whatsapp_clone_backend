# ADR 0003: Raw WebSocket via `@nestjs/platform-ws` untuk Real-time Transport

Kami memilih raw WebSocket (`ws`) via `@nestjs/platform-ws` adapter sebagai real-time transport layer, bukan Socket.IO.

## Context

WhatsApp clone membutuhkan real-time delivery untuk messages, typing indicator, dan presence updates. Client utama adalah aplikasi mobile native (Android/iOS). Socket.IO memiliki protocol sendiri yang tidak kompatibel dengan native WebSocket tanpa library tambahan. Raw WebSocket (RFC 6455) didukung nativ oleh semua platform mobile dan web.

## Decision

- **`@nestjs/platform-ws`** — NestJS adapter yang membungkus library `ws`. Memberikan decorator NestJS (`@WebSocketGateway`, `@SubscribeMessage`) untuk raw WebSocket murni.
- **Message format** — JSON text frames dengan struktur `{ event: string, data: object }`. Server parsing manual tanpa packet encoding seperti Socket.IO.
- **Tidak ada Redis adapter untuk MVP** — single instance server cukup dengan in-memory room management. Redis adapter akan ditambahkan saat horizontal scaling diperlukan.
- **Tidak ada auto-reconnection built-in** — client mobile harus handle reconnection logic sendiri.
- **REST + WebSocket hybrid** — REST untuk operasi CRUD (register, create group, fetch history, dll), WebSocket untuk real-time events saja.

## Consequences

- Client mobile bisa pakai `ws`/`okhttp3.WebSocket`/`URLSessionWebSocketTask` langsung tanpa library tambahan.
- Server perlu implement sendiri room management (track WebSocket connections per conversationId).
- Tidak ada built-in acknowledgement — client perlu kirim ack event jika diperlukan.
- Tidak ada fallback transport — WebSocket harus available. Jika tidak, client harus fallback ke polling REST.
