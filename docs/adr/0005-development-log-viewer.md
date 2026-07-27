# ADR 0005: Dozzle untuk Development Log Viewer

Kami menambahkan Dozzle sebagai service docker-compose untuk melihat log container secara real-time.

## Context

Selama development, perlu melihat log dari PostgreSQL, Redis, dan app backend secara simultan. `docker compose logs -f` membatasi ke satu service atau semua tanpa filter. Dozzle menyediakan web UI yang bisa filter per container, search, dan auto-refresh.

## Decision

- **Dozzle** sebagai container terpisah di docker-compose.yml.
- Port 8888 dibatasi ke localhost (127.0.0.1) — tidak bisa diakses dari luar.
- Mount Docker socket untuk akses log container lain.
- Tanpa autentikasi — hanya untuk development lokal.
- Tidak perlu tetap di production compose — service ini development-only.

## Consequences

- Developer bisa lihat log semua container di http://localhost:8888 tanpa terminal.
- Mount Docker socket adalah security risk jika diakses dari luar — dibatasi ke localhost untuk mitigasi.
- Tidak ada impact ke application code atau performance.
