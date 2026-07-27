# Mobile Integration Guide

Guide for Android (Kotlin) and iOS (Swift) developers to integrate with the WhatsApp Clone Backend.

## Table of Contents

- [Auth Flow](#auth-flow)
- [REST API](#rest-api)
- [WebSocket](#websocket)
- [Real-time Message Flow](#real-time-message-flow)
- [Media Upload](#media-upload)
- [Delivery Status](#delivery-status)
- [Error Handling](#error-handling)
- [Connection Lifecycle](#connection-lifecycle)

---

## Auth Flow

### 1. Request OTP

```
POST /api/auth/register
Content-Type: application/json

{ "phone": "+628123456789" }
```

**Response:** `{ "message": "OTP sent" }`

OTP is printed to server console in development. Check server logs for `[OTP] +628123456789: 123456`.

### 2. Verify OTP

```
POST /api/auth/verify
Content-Type: application/json

{ "phone": "+628123456789", "otp": "123456" }
```

**Response:**

```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
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

### 4. Subsequent logins

User already registered — call `/api/auth/register` again to get a new OTP, then `/api/auth/verify` to login. Single-device: logging in invalidates the previous session's token.

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

## REST API

All authenticated endpoints require:

```
Authorization: Bearer <accessToken>
```

### Standard headers

```http
Content-Type: application/json
Authorization: Bearer eyJhbG...
```

### Pagination

Message history uses cursor-based pagination:

```
GET /api/messages/:conversationId?limit=50&before=<messageId>
```

- Results are newest-first
- `limit` defaults to 50, max 100
- `before` is a message ULID — returns messages older than that ID
- Omit `before` for the first page (most recent messages)
- An empty array `[]` means no more messages

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

---

## WebSocket

### Connection

```
ws://<host>:3000?token=<accessToken>
```

Use the same JWT from the auth flow. Connection is authenticated on connect.

**Important:** The WebSocket `open` event may fire before server-side auth validates the token. The server will close the connection with code `4001` if the token is invalid. Handle this:

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

### Joining a conversation room

After connection, join a conversation to receive real-time events:

```json
{ "event": "room:join", "data": { "conversationId": "01ABCD..." } }
```

### Leaving a room

```json
{ "event": "room:leave", "data": { "conversationId": "01ABCD..." } }
```

### Message format

All frames are JSON text frames:

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event name |
| `data` | object | Event payload |

### Events: Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `room:join` | `{ conversationId }` | Join a conversation room |
| `room:leave` | `{ conversationId }` | Leave a room |
| `message:read` | `{ messageId }` | Mark message as read (1-on-1 only) |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `presence:online` | `{}` | Announce online status |

### Events: Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `message:new` | `{ id, conversationId, senderId, type, content, createdAt }` | New message in room |
| `message:status` | `{ messageId, userId, status }` | Delivery status update (`delivered` or `read`) |
| `message:deleted` | `{ messageId, mode }` | Message deleted (`me` or `everyone`) |
| `typing` | `{ conversationId, userId? }` | Someone is typing (userId omitted for groups) |
| `typing:stop` | `{ conversationId, userId }` | Stopped typing |
| `presence` | `{ userId, status, lastSeenAt? }` | Online/offline status |

---

## Real-time Message Flow

### Send message (REST)

1. Send text via `POST /api/messages/:conversationId`
2. Server saves, creates `message_status` rows for all members
3. Server broadcasts `message:new` to all room connections (except sender)
4. Server marks recipients as `delivered` and broadcasts `message:status` to sender

### Receive message (WebSocket)

1. Client receives `message:new` event
2. Client displays the message
3. (Optional) Client sends `message:read` to mark as read

### Mark as read

```json
{ "event": "message:read", "data": { "messageId": "01ABCD..." } }
```

Only for 1-on-1 conversations. Server broadcasts `message:status` with `status: "read"` to the room (sender receives it).

### Recommended flow

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

## Delivery Status

State machine: `sent` → `delivered` → `read`

| Status | Trigger | Notes |
|--------|---------|-------|
| `sent` | Server stores message | Initial state for all recipients |
| `delivered` | WebSocket delivered to recipient | Transitions on send; also on room join for offline users |
| `read` | Client sends `message:read` | 1-on-1 only |

### Offline delivery

When an offline user connects and joins a conversation room, any messages with `sent` status are delivered via WebSocket and transition to `delivered`. The sender receives `message:status=delivered` when this happens.

---

## Error Handling

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

1. Authenticate (register + verify) → get JWT
2. Connect WebSocket with JWT
3. Join conversation rooms for active chats
4. Send `presence:online`

### Active

- Keep WebSocket connection alive. The `ws` library handles ping/pong automatically.
- Listen for `message:new`, `typing`, `presence` events.
- Send messages via REST (POST to `/api/messages/:id`).
- Send `typing:start`/`typing:stop` when user types.
- Send `message:read` when user opens a conversation.

### Background / Switch app

- Send `typing:stop` for any active conversation.
- The server detects disconnect after ~30s (TCP timeout). On disconnect, it broadcasts `presence` with `status: "offline"` and `lastSeenAt`.
- No push notifications in MVP — reconnect on app foreground.

### Reconnect

1. Check if WebSocket is closed
2. If closed: reconnect with stored JWT
3. If 4001 close (session expired): re-authenticate → get new JWT → reconnect
4. Re-join conversation rooms
5. Fetch latest messages via REST (cursor pagination from last known message)
