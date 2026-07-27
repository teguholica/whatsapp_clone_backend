# ADR 0005: Dozzle untuk Development Log Viewer

Kami menambahkan Dozzle sebagai service docker-compose untuk melihat log container secara real-time.

## Context

Selama development, perlu melihat log dari PostgreSQL, Redis, dan app backend secara simultan. `docker compose logs -f` membatasi ke satu service atau semua tanpa filter. Dozzle menyediakan web UI yang bisa filter per container, search, dan auto-refresh.

## Decision

- **Dozzle** sebagai container di `docker-compose.dev.yml` — service ini **development-only**, tidak masuk production compose.
- Filter container: `DOZZLE_FILTER=name=whatsapp-*` — hanya menangkap log container ber-prefix `whatsapp-`. Container project lain di host yg sama tidak terlihat.
- Port 8888 dibatasi ke localhost (127.0.0.1) — tidak bisa diakses dari luar.
- Mount Docker socket untuk akses log container.
- Tanpa autentikasi — hanya untuk development lokal.
- Developer menjalankan: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` untuk full stack + dozzle.

## Consequences

- Developer bisa lihat log container whatsapp-* di http://localhost:8888 tanpa terminal.
- Log container luar project tidak tampak — Dozzle hanya fokus ke `whatsapp-*`.
- Mount Docker socket tetap security risk jika diakses dari luar — dibatasi ke localhost untuk mitigasi.
- Tidak ada impact ke application code atau performance.
- Developer perlu tambah `-f docker-compose.dev.yml` untuk mengaktifkan Dozzle.
