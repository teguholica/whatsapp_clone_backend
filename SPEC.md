# WhatsApp Clone Backend — MVP Spec

## Problem Statement

Tidak ada backend real-time messaging yang mirip WhatsApp untuk keperluan learning, prototyping, atau self-hosted deployment. Existing open-source solusi biasanya over-engineered (microservices, Kafka, E2EE) atau under-featured (hanya REST, tanpa real-time delivery tracking). Kami ingin backend WhatsApp clone yang cukup untuk MVP: chat 1-on-1, grup, delivery status, typing indicator, dan presence — dengan arsitektur yang bisa diskalakan nanti.

## Solution

Backend Node.js/TypeScript dengan PostgreSQL + Redis yang menyediakan:

- Registrasi/login via nomor telepon + OTP
- Chat 1-on-1 (satu conversation per pasangan user)
- Group chat (max 256 anggota, dengan admin)
- Delivery tracking (sent → delivered → read) untuk 1-on-1
- Typing indicator real-time
- Presence (online/offline)
- Media upload (image, video, document)
- REST API untuk CRUD + WebSocket (Socket.IO) untuk real-time events

## User Stories

1. As a **user**, I want to **register with my phone number via OTP**, so that I can create an account quickly without password.
2. As a **user**, I want to **search for other users by phone number**, so that I can find people to chat with.
3. As a **user**, I want to **start a 1-on-1 conversation with another user**, so that I can send them messages privately.
4. As a **user**, I want to **send text messages in a conversation**, so that I can communicate with others.
5. As a **user**, I want to **send images, videos, and documents in a conversation**, so that I can share media with others.
6. As a **user**, I want to **receive messages in real-time**, so that I don't need to refresh the page.
7. As a **user**, I want to **see when my message is delivered and read**, so that I know the recipient has seen it.
8. As a **user**, I want to **see when someone is typing**, so that I know they are composing a reply.
9. As a **user**, I want to **see which of my contacts are online**, so that I know who is available to chat.
10. As a **user**, I want to **create a group conversation**, so that I can chat with multiple people at once.
11. As a **user**, I want to **add members to a group I created**, so that I can grow the conversation.
12. As a **user**, I want to **remove members from my group**, so that I can moderate the conversation.
13. As a **group admin**, I want to **promote other members to admin**, so that they can help manage the group.
14. As a **user**, I want to **delete a message I sent (delete me)**, so that I can remove it from my view.
15. As a **user**, I want to **delete a message for everyone (within 30 minutes)**, so that I can retract a mistake.
16. As a **user**, I want to **leave a conversation**, so that I stop receiving messages from it.
17. As a **user**, I want to **see my conversation list**, so that I can pick which chat to open.
18. As a **user**, I want to **view message history with pagination**, so that I can scroll back through old messages.
19. As a **user**, I want to **mark a conversation as read**, so that read receipts are sent to the other person.
20. As a **user**, I want to **update my display name and avatar**, so that others can recognize me.

## Implementation Decisions

### Tech Stack
- **Runtime:** Node.js + TypeScript
- **Database:** PostgreSQL (relational, ACID)
- **Cache/Pub-sub:** Redis (OTP storage, pub/sub for Socket.IO)
- **Transport:** Socket.IO + Redis adapter (real-time) + REST (CRUD)
- **Auth:** Phone number + OTP (fake provider prints to log for development)
- **File storage:** Local disk with S3-ready abstraction layer
- **Message ID format:** ULID (sortable, unique, generated at application layer)

### Database Schema
- `users` — id (ULID), phone_number (unique), display_name, avatar_url, last_seen_at, created_at
- `conversations` — id (ULID), type (individual|group), created_at
- `conversation_members` — conversation_id, user_id, joined_at
- `messages` — id (ULID), conversation_id, sender_id, type, content, reply_to_message_id, created_at, deleted_at, deleted_by
- `message_status` — message_id, user_id, status (sent|delivered|read), updated_at
- `group_admins` — conversation_id, user_id

### Message Status State Machine
- `sent` → `delivered` → `read`
- `sent`: server has received and stored the message
- `delivered`: Socket.IO has delivered to all active devices of recipient
- `read`: recipient has opened the conversation (only for 1-on-1)
- Read receipts for group conversations are out of scope for MVP.

### API Design - REST Endpoints
**Auth:**
- `POST /api/auth/register` — initiate OTP registration
- `POST /api/auth/verify` — verify OTP, return JWT

**User:**
- `GET /api/users/me` — get own profile
- `PUT /api/users/me` — update display_name, avatar
- `GET /api/users/search?phone=` — search users by phone

**Conversations:**
- `GET /api/conversations` — list user's conversations
- `POST /api/conversations` — create 1-on-1 conversation (by phone)
- `GET /api/conversations/:id` — get conversation detail
- `DELETE /api/conversations/:id` — leave/delete conversation

**Groups:**
- `POST /api/groups` — create group
- `PUT /api/groups/:id` — update group info
- `POST /api/groups/:id/members` — add members
- `DELETE /api/groups/:id/members/:userId` — remove member
- `POST /api/groups/:id/admins` — promote to admin
- `DELETE /api/groups/:id/admins/:userId` — demote admin

**Messages:**
- `GET /api/messages/:conversationId?limit=&before=` — cursor pagination
- `POST /api/messages/:conversationId` — send text message
- `DELETE /api/messages/:messageId` — soft delete (with 30min window for delete-everyone)
- `PUT /api/messages/:messageId/read` — mark as read (triggers read receipt)

**Media:**
- `POST /api/media/upload` — upload file, return mediaId

### WebSocket Events
**Client → Server:**
- `message:send` — send message to a conversation
- `typing:start` — user started typing
- `typing:stop` — user stopped typing
- `presence:online` — user came online

**Server → Client:**
- `message:new` — new message in a conversation
- `message:status` — delivery/read status update
- `typing` — someone is typing in a conversation
- `presence` — user online/offline status

### Module Structure (feature-based)
- `auth/` — registration, OTP verification, JWT management
- `user/` — profile, search
- `conversation/` — conversation lifecycle, member management
- `message/` — send, receive, delete, pagination
- `group/` — group creation, admin management, membership
- `media/` — file upload, storage
- `presence/` — online/offline + typing indicator (in-memory + Redis pub/sub)
- `shared/` — middleware, types, utils, db connection

### Security
- Rate limiting: 5 attempts/minute/phone for OTP verify
- JWT access token: 15 minutes, refresh token: 7 days
- Message text limit: 4,096 characters
- File type whitelist: jpg, png, gif, mp4, 3gp, pdf, doc, docx
- Single device per user: new login invalidates old session

## Testing Decisions

### Testing Philosophy
- Test external behavior (API contracts, WebSocket event flows), not implementation details.
- Prefer integration tests that exercise the full stack (server → DB → response) over isolated unit tests.
- A good test: sends an HTTP request or WebSocket event, asserts on response body, status code, or emitted event.

### Testing Seam
The primary seam is the **HTTP + WebSocket server interface**. Tests will:
1. Start the server with a test PostgreSQL database (dedicated test DB).
2. Make HTTP requests using a test client (e.g., supertest or built-in fetch).
3. Connect Socket.IO clients to test real-time flows (message delivery, typing, presence).
4. Assert on HTTP responses, database state, and received WebSocket events.

This is the highest possible seam — it validates the entire system from the outside in, without exposing internal modules.

### What to Test
- Auth flow: register → verify OTP → receive JWT
- Conversation CRUD: create 1-on-1, list, delete
- Message send/receive: send via REST, receive via WebSocket (in same conversation room)
- Delivery status: sent → delivered → read transitions
- Group operations: create, add/remove members, promote/demote admin
- Typing indicator: start typing event broadcast to conversation room
- Presence: online/offline status broadcast
- Media upload: file upload → receive mediaId → attach to message
- Message delete: soft delete, 30min window enforcement for delete-everyone
- Pagination: cursor-based message history
- Error cases: unauthorized, rate limited, invalid input, conversation not found

### Prior Art
Since this is a greenfield project, there is no prior art yet. Tests will follow patterns from the Node.js/TypeScript ecosystem (e.g., supertest for HTTP, Socket.IO test client for WebSocket).

## Out of Scope
- Voice/video calls
- Stories/status updates
- Broadcast channels
- End-to-end encryption
- Multi-device support (multiple sessions per user)
- Username (@handle) system
- Contact sync from phone book
- Thumbnail generation for media
- Message reactions
- Message editing
- Push notifications
- File storage on S3 (local disk only for MVP; abstraction layer ready)
- Read receipts for group conversations
- Message forwarding
- Blocked users
- Deleted account cleanup

## Further Notes
- Fake OTP provider prints the 6-digit code to the server log. In production, swap to an SMS gateway via the OTP provider interface.
- The media abstraction layer exposes a `StorageProvider` interface — swap from local disk to S3 by providing a new implementation without changing business logic.
- Socket.IO rooms follow the convention `conversation:{conversationId}` for targeted event broadcasting.
- Horizontal scaling: add more server instances behind a load balancer; Redis adapter handles cross-instance event broadcasting.
