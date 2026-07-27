# ADR 0001: Node.js/TypeScript + PostgreSQL + Redis

Kami memilih Node.js/TypeScript untuk runtime, PostgreSQL untuk persistent storage, dan Redis untuk pub/sub real-time.

## Context

Backend WhatsApp clone membutuhkan runtime yang cocok untuk I/O-heavy, real-time bidirectional communication (WebSocket), dan produktivitas tinggi untuk MVP. Juga membutuhkan database relasional untuk data terstruktur (users, messages, conversations) dan pub/sub untuk broadcast real-time events ke multiple server instance.

## Decision

- **Runtime:** Node.js + TypeScript. TypeScript memberikan type safety tanpa overhead runtime. Node.js ecosystem matang untuk WebSocket dan event-driven concurrency.
- **Database:** PostgreSQL. Relasional, ACID, JSONB support untuk metadata semi-struktural. Migration via native SQL.
- **Cache/pub-sub:** Redis. Pub/sub pattern untuk broadcast typing indicator, presence, dan message delivery ke semua WebSocket server instance. Juga dipakai untuk OTP code storage dengan TTL.

## Consequences

- Mudah scaling horizontal dengan Redis pub/sub untuk broadcast events ke semua instance.
- PostgreSQL schema migrasi perlu dikelola rapi sejak awal.
- Tidak memerlukan message broker berat (RabbitMQ/Kafka) untuk MVP — Redis pub/sub cukup.
