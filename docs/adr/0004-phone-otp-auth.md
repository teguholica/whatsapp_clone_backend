# ADR 0004: Phone + OTP Authentication

Kami menggunakan nomor telepon sebagai identitas user dengan verifikasi OTP, mirip WhatsApp.

## Context

WhatsApp menggunakan nomor telepon sebagai primary identity. Untuk clone ini, kami mengadopsi approach yang sama agar pengalaman pengguna konsisten dengan WhatsApp asli. OTP dikirim via SMS atau mekanisme lain.

## Decision

- **Nomor telepon** sebagai unique identifier untuk registrasi dan login.
- **OTP 6 digit** dengan masa berlaku 5 menit, disimpan di Redis dengan TTL.
- **Fake OTP provider** untuk development — OTP code dicetak ke log console, bukan dikirim via SMS sungguhan.
- **JWT access token (15 menit) + refresh token (7 hari)** untuk session management.
- **Single device per user** — login baru meng-invalidasi sesi lama.

## Consequences

- Rate limiting ketat di endpoint `/auth/verify` (5 attempts per nomor per menit).
- OTP provider abstraction diperlukan agar bisa swap dari fake ke SMS gateway nyata tanpa mengubah business logic.
- Refresh token memungkinkan session persist tanpa re-login.
