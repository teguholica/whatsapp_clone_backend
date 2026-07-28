# ADR 0006: Refresh Token Endpoint

MVP sebelumnya tidak punya dedicated refresh endpoint — fallback OTP ulang tiap 15 menit, UX rusak untuk chat app. Tambah `POST /api/auth/refresh` dengan rotation: refresh token baru tiap call, refresh token lama di-revoke via Redis `refresh:{userId}`.

## Considered Options

- **Rate limit:** 5/min bucket terpisah dari verify — dipilih supaya bucket verify tidak habis karena refresh.
- **Response shape:** full `AuthResponse` (konsisten dengan `POST /api/auth/verify`).
- **Refresh token rotation:** tiap refresh invalidate refresh token sebelumnya.
- **WebSocket reconnect:** passthrough — client REST refresh dulu, baru reconnect WS.
