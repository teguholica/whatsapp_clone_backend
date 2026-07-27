# WhatsApp Clone Backend

Real-time messaging backend, clone of WhatsApp. Chat 1-on-1, group chat, delivery tracking, typing indicator, presence, phone + OTP auth.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** NestJS (modular, decorator-based)
- **Database:** PostgreSQL (relational, ACID)
- **Cache/Pub-sub:** Redis (OTP storage, pub/sub)
- **Real-time:** Raw WebSocket (`ws` + `@nestjs/platform-ws`)
- **Auth:** Phone number + OTP (fake provider for development)

## Architecture

Feature-based modules — each domain owns its controller, service, gateway, and types:

```
src/
  auth/         registration, OTP, JWT
  user/         profile, search
  conversation/ 1-on-1 conversation CRUD
  message/      send, paginate, delete
  group/        group chat, admin, membership
  media/        file upload, storage
  presence/     online/offline, typing indicator
  ws/           WebSocket gateway, room manager
  health/       health check
  shared/       database, redis, guards, decorators
```

## Quick Start

```bash
# Start services
docker compose up -d postgres redis

# Install dependencies
npm install

# Run migrations
npm run migrate

# Start dev server (hot-reload)
npm run dev
```

Server runs on `http://localhost:3000`. Log viewer at `http://localhost:8888` (Dozzle, dev-only — lihat [Full Docker](#full-docker-all-services-in-containers)).

### Full Docker (all services in containers)

```bash
# Core services only (postgres, redis, app)
docker compose up -d

# With dev tools (Dozzle log viewer)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## API

All authenticated endpoints require header: `Authorization: Bearer <jwt_token>`

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Send OTP to phone (`{ phone }`) |
| `POST` | `/api/auth/verify` | Verify OTP, get JWT (`{ phone, otp }`) |

OTP is printed to server log in development (fake provider).

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/me` | ✅ | Get own profile |
| `PUT` | `/api/users/me` | ✅ | Update display name/avatar |
| `GET` | `/api/users/search?phone=` | ✅ | Search users by phone |

### Conversations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/conversations` | ✅ | Create 1-on-1 by phone |
| `GET` | `/api/conversations` | ✅ | List conversations |
| `GET` | `/api/conversations/:id` | ✅ | Get detail with members |
| `DELETE` | `/api/conversations/:id` | ✅ | Leave conversation |

Creating a conversation with an existing pair returns the existing conversation (idempotent).

### Messages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/messages/:conversationId` | ✅ | Send text message |
| `GET` | `/api/messages/:conversationId` | ✅ | Paginate history (`?limit=50&before=cursor`) |
| `DELETE` | `/api/messages/:messageId` | ✅ | Delete (`?mode=me` or `?mode=everyone`) |

- Text limit: 4,096 characters
- Delete `mode=everyone`: sender only, within 30 minutes
- Delete `mode=me`: per-user soft delete

### Groups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/groups` | ✅ | Create group (`{ name, members[] }`) |
| `PUT` | `/api/groups/:id` | ✅ | Update name (admin only) |
| `POST` | `/api/groups/:id/members` | ✅ | Add members (admin, max 256) |
| `DELETE` | `/api/groups/:id/members/:userId` | ✅ | Remove member (admin) |
| `POST` | `/api/groups/:id/admins` | ✅ | Promote to admin (super admin) |
| `DELETE` | `/api/groups/:id/admins/:userId` | ✅ | Demote admin (super admin, not self) |

### Media

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/media/upload` | ✅ | Upload file (`multipart/form-data`, field: `file`) |

Allowed types: `jpg`, `png`, `gif`, `mp4`, `3gp`, `pdf`, `doc`, `docx`

Size limits: image 16MB, video 64MB, document 100MB.

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Returns DB + Redis status |

## WebSocket Events

Connect: `ws://localhost:3000?token=<jwt>`

### Client → Server

```json
{ "event": "room:join", "data": { "conversationId": "..." } }
{ "event": "room:leave", "data": { "conversationId": "..." } }
{ "event": "message:read", "data": { "messageId": "..." } }
{ "event": "typing:start", "data": { "conversationId": "..." } }
{ "event": "typing:stop", "data": { "conversationId": "..." } }
{ "event": "presence:online", "data": {} }
```

### Server → Client

```json
{ "event": "message:new", "data": { "id": "...", "senderId": "...", "conversationId": "...", "type": "text", "content": "...", "createdAt": "..." } }
{ "event": "message:status", "data": { "messageId": "...", "userId": "...", "status": "delivered|read" } }
{ "event": "message:deleted", "data": { "messageId": "...", "mode": "me|everyone" } }
{ "event": "typing", "data": { "conversationId": "...", "userId": "..." } }
{ "event": "typing:stop", "data": { "conversationId": "...", "userId": "..." } }
{ "event": "presence", "data": { "userId": "...", "status": "online|offline", "lastSeenAt": "..." } }
```

- Join room (conversation) to receive real-time events for that conversation
- Presence broadcasts to all connected users
- Group typing omits `userId`
- Typing auto-stops after 5s if no `typing:stop` received
- Sender excluded from their own typing/presence broadcasts

## Message Delivery Status

State machine: `sent` → `delivered` → `read`

- **sent**: server stored the message
- **delivered**: recipient's WebSocket received `message:new`
- **read**: recipient sent `message:read` event (1-on-1 only)

Offline messages delivered via `deliverPending` on room join — status transitions to `delivered` on delivery.

## Domain Language

| Term | Definition |
|------|------------|
| **Conversation** | Container for messages (1-on-1 or group) |
| **Message** | Unit of content within a conversation |
| **MessageStatus** | Per-user per-message delivery tracking |
| **User** | Individual registered with phone number |
| **Group** | Conversation with 3+ members, has admins |
| **Presence** | Online/offline + typing indicator |
| **Media** | Binary content attached to a message |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start production build |
| `npm run migrate` | Run database migrations |
| `npm run db:up` | Start Docker services + migrate |
| `npm run typecheck` | TypeScript type check |

## Environment Variables

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/whatsapp
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-production
```

## Out of Scope (MVP)

- Voice/video calls
- Stories/status
- Broadcast channels
- End-to-end encryption
- Multi-device support
- Push notifications
- Message editing
- Reactions
- S3 storage (local disk with abstraction layer ready)
