# ADR 0002: Modular (Feature-based) Architecture

Kami mengorganisir kode berdasarkan fitur (modul), bukan layer teknis.

## Context

Backend akan memiliki 6-8 domain area (auth, user, conversation, message, group, media, presence, WebSocket). Layered architecture standar (controller → service → repository) per feature menghasilkan kode yang lebih cohesive, navigable, dan mudah di-test dibandingkan flat folder-by-role.

## Decision

Setiap modul adalah direktori dengan file-file berikut (hanya yang dibutuhkan):
- `{module}.controller.ts` — HTTP route handlers
- `{module}.service.ts` — business logic
- `{module}.repository.ts` — database access
- `{module}.types.ts` — type definitions
- `{module}.socket.ts` — WebSocket event handlers (jika ada)

Modul shared (middleware, utils, types) dipisah di `shared/`.

## Consequences

- Developer bisa bekerja di satu modul tanpa memahami detail modul lain.
- Tidak ada dependency sirkuler antar modul — modul hanya bergantung ke `shared/types`.
- Struktur flat dan modular — mudah direfactor ke package terpisah jika monorepo diperlukan nanti.
