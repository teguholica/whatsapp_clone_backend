# Mobile Integration Guide

Guide for Android (Kotlin) and iOS (Swift) developers to integrate with the WhatsApp Clone Backend.

## Table of Contents

- [Auth Flow](#auth-flow)
- [Users API](#users-api)
- [Conversations API](#conversations-api)
- [Groups API](#groups-api)
- [Messages API](#messages-api)
- [Media Upload](#media-upload)
- [Health](#health)
- [WebSocket](#websocket)
- [Real-time Message Flow](#real-time-message-flow)
- [Delivery Status](#delivery-status)
- [Error Handling](#error-handling)
- [Connection Lifecycle](#connection-lifecycle)
- [Environment Variables](#environment-variables)

---

## Auth Flow

Single-device, phone + OTP authentication.

### 1. Request OTP

```
POST /api/auth/register
Content-Type: application/json

{ "phone": "+628123456789" }
```

**Validation:**
- `phone`: required, must match E.164 format `^\+[1-9]\d{6,14}$`

**Response:** `{ "message": "OTP sent" }`

OTP is printed to server console in development. Check server logs for `[OTP] +628123456789: 123456`.

- OTP expires after 300 seconds (5 minutes).
- Each verify attempt consumes the OTP (one-time use).
- Rate limit: `/api/auth/verify` is limited to 5 attempts per 60 seconds per phone number. `/api/auth/register` is NOT rate-limited.

### 2. Verify OTP

```
POST /api/auth/verify
Content-Type: application/json

{ "phone": "+628123456789", "otp": "123456" }
```

**Validation:**
- `phone`: required, E.164
- `otp`: required, exactly 6 digits

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "01ABCD...",
    "phone": "+628123456789",
    "displayName": null
  }
}
```

### 3. Store tokens

- **accessToken** — 15 minute expiry. Send as `Authorization: Bearer <token>` on all API calls.
- **refreshToken** — 7 day expiry. Use to get a new access token when it expires.

**JWT payload:** `{ sub: <userId>, phone: <phone> }` — signed with `JWT_SECRET`.

### 4. Refresh token

For MVP there is no dedicated refresh endpoint. When the access token expires:

1. Call `POST /api/auth/register` with the same phone to get a new OTP.
2. Call `POST /api/auth/verify` to get new tokens.
3. Update stored tokens and reconnect WebSocket.

### 5. Single-device enforcement

Each login invalidates the previous session. The server stores the current JWT in Redis with key `session:{userId}`. On each authenticated request, the server compares the presented token against the stored one. A mismatch returns 401 or closes WebSocket with code 4001.

### Kotlin (OkHttp)

```kotlin
data class VerifyResponse(
  val accessToken: String,
  val refreshToken: String,
  val user: User
)

fun register(phone: String, callback: (Result<Unit>) -> Unit) {
  val json = """{"phone":"$phone"}"""
  val request = Request.Builder()
    .url("$BASE_URL/api/auth/register")
    .post(json.toRequestBody(JSON_MEDIA_TYPE))
    .build()
  client.newCall(request).enqueue(callback)
}

fun verify(phone: String, otp: String, callback: (Result<VerifyResponse>) -> Unit) {
  val json = """{"phone":"$phone","otp":"$otp"}"""
  val request = Request.Builder()
    .url("$BASE_URL/api/auth/verify")
    .post(json.toRequestBody(JSON_MEDIA_TYPE))
    .build()
  client.newCall(request).enqueue(callback)
}
```

### Swift (URLSession)

```swift
struct VerifyResponse: Codable {
  let accessToken: String
  let refreshToken: String
  let user: User
}

func register(phone: String) async throws {
  let body = ["phone": phone]
  var req = URLRequest(url: URL(string: "\(baseURL)/api/auth/register")!)
  req.httpMethod = "POST"
  req.httpBody = try JSONEncoder().encode(body)
  req.setValue("application/json", forHTTPHeaderField: "Content-Type")
  let _ = try await URLSession.shared.data(for: req)
}

func verify(phone: String, otp: String) async throws -> VerifyResponse {
  let body = ["phone": phone, "otp": otp]
  var req = URLRequest(url: URL(string: "\(baseURL)/api/auth/verify")!)
  req.httpMethod = "POST"
  req.httpBody = try JSONEncoder().encode(body)
  req.setValue("application/json", forHTTPHeaderField: "Content-Type")
  let (data, _) = try await URLSession.shared.data(for: req)
  return try JSONDecoder().decode(VerifyResponse.self, from: data)
}
```

---

## Users API

All endpoints require `Authorization: Bearer <accessToken>`.

### Get own profile

```
GET /api/users/me
```

**Response:**

```json
{
  "id": "01ABCD...",
  "phone": "+628123456789",
  "displayName": null,
  "avatarUrl": null,
  "lastSeenAt": null
}
```

### Update profile

```
PUT /api/users/me
Content-Type: application/json

{ "displayName": "John", "avatarUrl": "/uploads/01ABCD.jpg" }
```

**Validation:**
- `displayName`: optional, string, max 100 characters
- `avatarUrl`: optional, string (format not validated)

**Response:** Same `UserProfile` shape as get profile.

### Search users by phone

```
GET /api/users/search?phone=62812
```

- Partial match using `LIKE '%query%'`.
- Excludes self from results.
- Maximum 20 results, ordered by `displayName`.

**Response:**

```json
[
  {
    "id": "01ABCD...",
    "phone": "+628123456789",
    "displayName": "John",
    "avatarUrl": null,
    "lastSeenAt": "2024-01-01T00:00:00.000Z"
  }
]
```

Return empty array `[]` when query is empty or no matches.

---

## Conversations API

All endpoints require `Authorization: Bearer <accessToken>`.

### Create 1-on-1 conversation

```
POST /api/conversations
Content-Type: application/json

{ "phone": "+628123456789" }
```

**Validation:**
- `phone`: required, E.164 format

**Rules:**
- Returns 400 if target phone is your own.
- Returns 404 if target phone is not registered.
- **Idempotent:** If a conversation already exists between the pair, returns the existing conversation (no duplicate).

**Response (also returned by detail endpoint):**

```json
{
  "id": "01ABCD...",
  "type": "individual",
  "members": [
    { "userId": "01AAA...", "displayName": "John" },
    { "userId": "01BBB...", "displayName": null }
  ],
  "lastMessage": { "content": "Hello", "createdAt": "2024-01-01T00:00:00.000Z" },
  "unreadCount": 0,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

> `unreadCount` is always `0` in MVP (not yet implemented).

### List conversations

```
GET /api/conversations
```

Ordered by most recent activity (last message or creation date). Only returns conversations the user is an active member of (`left_at IS NULL`).

**Response:**

```json
[
  {
    "id": "01ABCD...",
    "type": "individual",
    "otherUser": { "id": "01BBB...", "displayName": "John" },
    "lastMessage": { "content": "Hello", "createdAt": "2024-01-01T00:00:00.000Z" },
    "unreadCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

- `otherUser` is `null` for group conversations (use Groups API instead).
- `lastMessage` is `null` if no messages have been sent.

### Get conversation detail

```
GET /api/conversations/:id
```

Returns the same `ConversationDetail` shape as create response, with full member list.

### Leave conversation

```
DELETE /api/conversations/:id
```

Soft-deletes the user's membership (sets `left_at` timestamp). User will no longer appear in conversation lists.

**Response:** `{ "message": "Left conversation" }`

---

## Groups API

All endpoints require `Authorization: Bearer <accessToken>`.

### Create group

```
POST /api/groups
Content-Type: application/json

{
  "name": "Family Group",
  "members": ["+6281111111111", "+6282222222222"]
}
```

**Validation:**
- `name`: required, max 100 characters
- `members`: required array of E.164 phone numbers, 1–255 items, no duplicates, no self

**Rules:**
- Creator becomes the first admin (super admin).
- Total members (including creator) cannot exceed 256.
- All phone numbers must belong to registered users.

**Response:**

```json
{
  "id": "01ABCD...",
  "name": "Family Group",
  "type": "group",
  "members": [
    { "userId": "01AAA...", "displayName": "John" },
    { "userId": "01BBB...", "displayName": "Jane" },
    { "userId": "01CCC...", "displayName": "Bob" }
  ],
  "admins": ["01AAA..."],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Update group name

```
PUT /api/groups/:id
Content-Type: application/json

{ "name": "Updated Name" }
```

- Requires admin rights.
- `name`: optional, max 100 characters.

**Response:** `GroupResponse` (same shape as create).

### Add members

```
POST /api/groups/:id/members
Content-Type: application/json

{ "members": ["+6283333333333", "+6284444444444"] }
```

**Validation:**
- `members`: required array of E.164 phone numbers, 1–255 items

**Rules:**
- Requires admin rights.
- Total members cannot exceed 256.
- If an ex-member (previously removed) is re-added, their membership is restored (`left_at` set to `NULL`).

**Response:** `GroupResponse`.

### Remove member

```
DELETE /api/groups/:id/members/:userId
```

- Requires admin rights.
- Cannot remove yourself (use leave conversation instead).
- Removed member is also demoted from admin if they were one.

**Response:** `GroupResponse`.

### Promote to admin

```
POST /api/groups/:id/admins
Content-Type: application/json

{ "userId": "01BBB..." }
```

- Requires super admin (the group creator).
- Target must be a current member.

**Response:** `GroupResponse`.

### Demote admin

```
DELETE /api/groups/:id/admins/:userId
```

- Requires super admin.
- Cannot demote yourself.

**Response:** `GroupResponse`.

---

## Messages API

All endpoints require `Authorization: Bearer <accessToken>`.

### Send message

```
POST /api/messages/:conversationId
Content-Type: application/json

{ "content": "Hello!" }
```

**Validation:**
- `content`: required, must be between 1 and 4,096 characters (manually validated by controller).
- `type`: currently always set to `"text"` by the server.

**Real-time side-effect:**
1. Server saves message and creates `message_status` rows for all other members (initial status: `sent`).
2. Server broadcasts `message:new` to all members in the conversation room (except sender).
3. For each online recipient, status transitions to `delivered` and server broadcasts `message:status` to the sender.

**Response:**

```json
{
  "id": "01ABCD...",
  "conversationId": "01CONV...",
  "senderId": "01AAA...",
  "type": "text",
  "content": "Hello!",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Paginate message history

```
GET /api/messages/:conversationId?limit=50&before=<messageId>
```

- Results are newest-first.
- `limit` defaults to 50, max 100, min 1.
- `before` is a message ULID — returns messages older than that ID (cursor-based pagination).
- Omit `before` for the first page (most recent messages).
- Messages soft-deleted by the requesting user (via `mode=me` delete) are excluded from results.
- Empty array `[]` means no more messages.

**Response:**

```json
[
  {
    "id": "01ABCD...",
    "conversationId": "01CONV...",
    "senderId": "01AAA...",
    "type": "text",
    "content": "Hello!",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Delete message

```
DELETE /api/messages/:messageId?mode=everyone
```

**Query parameters:**
- `mode`: required, must be `"me"` or `"everyone"`.

**Mode `everyone`:**
- Only the original sender can delete for everyone.
- Must be within 30 minutes of message creation.
- Server sets `deleted_at` and `deleted_by` on the message row.
- Broadcasts `message:deleted` event to all room members.

**Mode `me`:**
- Any conversation member can delete for themselves.
- Uses a separate `message_deletions` table (per-user soft delete).
- The message is hidden only from the deleter's perspective.
- Broadcasts `message:deleted` event to the room.

**Response:** `{ "message": "Message deleted" }`

**WebSocket event broadcasted for both modes:**

```json
{ "event": "message:deleted", "data": { "messageId": "01ABCD...", "mode": "everyone" } }
```

> Note: The `message:deleted` event does NOT include `conversationId`. Clients should derive the conversation from their local message store.

---

## Media Upload

### Upload a file

```
POST /api/media/upload
Content-Type: multipart/form-data; boundary=...
Authorization: Bearer <token>

--boundary
Content-Disposition: form-data; name="file"; filename="photo.jpg"
Content-Type: image/jpeg

<binary data>
--boundary--
```

- Form field name must be `"file"`.
- Filename on disk: `{ULID}.{originalExt}`.
- Upload directory is set by `UPLOAD_DIR` env var (default `uploads/`).
- Files are served at `/uploads/{filename}`.

**Response:**

```json
{
  "id": "01ABCD.jpg",
  "url": "/uploads/01ABCD.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 467
}
```

### Attach media to a message

Media is not automatically attached to a conversation. After upload, send a message with the media reference:

```
POST /api/messages/:conversationId
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "image",
  "content": "{\"mediaId\":\"01ABCD.jpg\",\"url\":\"/uploads/01ABCD.jpg\"}"
}
```

Supported media types:

| Type | Extension | Max Size |
|------|-----------|----------|
| image/jpeg | .jpg | 16 MB |
| image/png | .png | 16 MB |
| image/gif | .gif | 16 MB |
| video/mp4 | .mp4 | 64 MB |
| video/3gpp | .3gp | 64 MB |
| application/pdf | .pdf | 100 MB |
| application/msword | .doc | 100 MB |
| application/vnd.openxmlformats-officedocument.wordprocessingml.document | .docx | 100 MB |

---

## Health

No authentication required.

```
GET /api/health
```

**Response:**

```json
{
  "status": "ok",
  "db": "connected",
  "redis": "connected"
}
```

- `status` is `"ok"` when both DB and Redis are healthy, `"degraded"` otherwise.
- `db`: `"connected"` or `"disconnected"`.
- `redis`: `"connected"` or `"disconnected"`.

---

## WebSocket

### Connection

```
ws://<host>:3000?token=<accessToken>
```

Use the same JWT from the auth flow. The gateway validates the token and checks the Redis session store on connect.

**Important:** The WebSocket `open` event may fire before server-side auth validates the token. The server will close the connection with one of these codes:

| Close Code | Reason |
|------------|--------|
| 4001 | Authentication required (no token provided) |
| 4001 | Invalid or expired token |
| 4001 | Session no longer active (new login from another device) |

Handle accordingly:

```kotlin
// Kotlin (OkHttp WebSocket)
val ws = client.newWebSocket(request, object : WebSocketListener() {
  override fun onOpen(ws: WebSocket, response: Response) {
    // Connection upgraded — wait briefly for potential auth rejection
  }

  override fun onClosing(ws: WebSocket, code: Int, reason: String) {
    if (code == 4001) {
      // Token invalid or session expired — re-authenticate
    }
  }
})
```

```swift
// Swift (URLSessionWebSocketTask)
let task = session.webSocketTask(with: url)
task.resume()
// If connection closes quickly with code 4001, token is invalid
```

### Joining and leaving rooms

```json
{ "event": "room:join", "data": { "conversationId": "01ABCD..." } }
{ "event": "room:leave", "data": { "conversationId": "01ABCD..." } }
```

**When joining a room:** the server automatically delivers all pending messages (those with `sent` status) to the client. Each pending message transitions to `delivered` and the sender receives `message:status`.

### Message format

All frames are JSON text frames:

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event name |
| `data` | object | Event payload |

### Events: Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `room:join` | `{ conversationId }` | Join a conversation room. Triggers pending delivery. |
| `room:leave` | `{ conversationId }` | Leave a room |
| `message:read` | `{ messageId }` | Mark message as read (1-on-1 only; silently ignored for groups) |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `presence:online` | `{}` | Announce online status (broadcasts to ALL connected users) |

### Events: Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `message:new` | `{ id, conversationId, senderId, type, content, createdAt }` | New message in room (excludes sender) |
| `message:status` | `{ messageId, userId, status }` | Delivery status update (`delivered` or `read`). Broadcast to **all** room members. |
| `message:deleted` | `{ messageId, mode }` | Message deleted (`me` or `everyone`). No `conversationId` in payload. |
| `typing` | `{ conversationId, userId }` | Someone is typing |
| `typing:stop` | `{ conversationId, userId }` | Stopped typing |
| `presence` | `{ userId, status, lastSeenAt? }` | Online/offline (broadcasts to ALL connected users) |

### Important WebSocket behaviors

- **Group typing omits `userId`:** For group conversations, the `typing` event data is `{ conversationId }` only (no `userId` field).
- **Typing auto-stop:** If a user starts typing but does not send `typing:stop` within 5 seconds, the server automatically broadcasts `typing:stop`.
- **Sender excluded:** The sender is excluded from their own broadcasts (e.g., typing, presence, `message:new`).
- **Presence scope:** `presence:online` and `presence:offline` events are broadcast to **all** connected users, not just room members.
- **Disconnect:** When a WebSocket disconnects, the server:
  1. Updates `last_seen_at` in the database.
  2. Broadcasts `presence` with `status: "offline"` and `lastSeenAt` to all connected users.
  3. Clears the user's active typing timeouts.

---

## Real-time Message Flow

```
Mobile App                          Server
    |                                 |
    |--- POST /api/messages/:id ----->|  (send message via REST)
    |                                 |--- broadcast message:new ---> (other clients)
    |                                 |--- message:status=delivered -> (sender)
    |                                 |
    |<-- message:new (for inbound) ---|
    |--- message:read (user opened) ->|
    |<-- message:status=read ---------|
```

### Send message

1. Send text via `POST /api/messages/:conversationId`.
2. Server saves, creates `message_status` rows for all members (initial: `sent`).
3. Server broadcasts `message:new` to all room connections (except sender).
4. For each online recipient, status transitions to `delivered` and server broadcasts `message:status=delivered` to sender.

### Receive message

1. Client receives `message:new` event.
2. Client displays the message.
3. (Optional) Client sends `message:read` to mark as read.

### Mark as read

```json
{ "event": "message:read", "data": { "messageId": "01ABCD..." } }
```

Only for 1-on-1 conversations. Broadcasts `message:status` with `status: "read"` to the room.

### Delete message

1. Client sends `DELETE /api/messages/:id?mode=everyone`.
2. Server validates rules (sender only, within 30 min).
3. Server broadcasts `message:deleted` event to the room.
4. Recipients remove the message from the UI.

---

## Delivery Status

State machine: `sent` → `delivered` → `read`

| Status | Trigger | Notes |
|--------|---------|-------|
| `sent` | Server stores message | Initial state for all recipients |
| `delivered` | WebSocket delivered to recipient | Transitions on send; also on room join for offline users |
| `read` | Client sends `message:read` | 1-on-1 only |

### Offline delivery

When an offline user connects and joins a conversation room, the server runs `deliverPending`:
1. Fetches all messages with `sent` status for that user.
2. Sends each as `message:new` via WebSocket.
3. Transitions status to `delivered` in the database.
4. Broadcasts `message:status=delivered` to the sender.

---

## Error Handling

### Error response format

```json
{
  "message": "Description of the error",
  "error": "Error type",
  "statusCode": 400
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid input, validation error) |
| 401 | Unauthorized (missing/expired/invalid JWT) |
| 403 | Forbidden (not a member, not admin) |
| 404 | Resource not found |
| 409 | Conflict (already exists) |
| 413 | Payload too large (file exceeds size limit) |
| 429 | Too many requests (rate limited) |

### Token expired (401)

When a REST API call returns 401 or WebSocket closes with 4001:

1. Use the `refreshToken` to get a new JWT. (For MVP: re-run `/api/auth/verify` with a new OTP.)
2. Reconnect WebSocket with the new token.

### Rate limited (429)

The `/api/auth/verify` endpoint is rate-limited to 5 attempts per minute per phone number. Wait 60 seconds before retrying.

### Network errors

- **WebSocket disconnect:** Reconnect with the same token. If the token expired, re-authenticate first.
- **Request timeout:** Retry with exponential backoff (1s, 2s, 4s, max 30s).

---

## Connection Lifecycle

### Start

1. Authenticate (register + verify) → get JWT.
2. Connect WebSocket with JWT.
3. Join conversation rooms for active chats.
4. Send `presence:online`.

### Active

- Keep WebSocket connection alive. The `ws` library handles ping/pong automatically.
- Listen for `message:new`, `typing`, `presence` events.
- Send messages via REST (POST to `/api/messages/:id`).
- Send `typing:start`/`typing:stop` when user types.
- Send `message:read` when user opens a conversation.

### Background / Switch app

- Send `typing:stop` for any active conversation.
- The server detects disconnect after ~30s (TCP timeout). On disconnect, it broadcasts `presence` with `status: "offline"` and `lastSeenAt` and updates `last_seen_at` in the database.
- No push notifications in MVP — reconnect on app foreground.

### Reconnect

1. Check if WebSocket is closed.
2. If closed: reconnect with stored JWT.
3. If 4001 close (session expired): re-authenticate → get new JWT → reconnect.
4. Re-join conversation rooms.
5. Fetch latest messages via REST (cursor pagination from last known message).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/whatsapp` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `dev-secret` | Access token signing key |
| `JWT_REFRESH_SECRET` | `refresh-secret` | Refresh token signing key |
| `UPLOAD_DIR` | `uploads` | File storage directory |
| `NODE_ENV` | `development` | Environment mode |

---

## Domain Language

| Term | Definition |
|------|------------|
| **Conversation** | Container for messages (1-on-1 or group) |
| **Message** | Unit of content within a conversation |
| **MessageStatus** | Per-user per-message delivery tracking (`sent` → `delivered` → `read`) |
| **User** | Individual registered with a phone number |
| **Group** | Conversation with 3+ members, has admins |
| **Presence** | Online/offline + typing indicator |
| **Media** | Binary content attached to a message |
