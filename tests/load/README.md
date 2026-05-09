# Load Testing

Two k6 scripts exercise the chat system end-to-end:

| Script | What it stresses | Peak concurrency |
|---|---|---|
| `auth-api.js` | REST path: register → login → authenticated reads via API gateway | 1,000 VUs |
| `websocket-chat.js` | WebSocket path: Socket.io connect, join room, send messages with ack round-trip | 10,000 VUs |

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) installed (`brew install k6` or see docs)
- The full stack running (either `docker compose up` locally or a staging cluster)
- A JWT-capable auth endpoint reachable at `$BASE_URL`

## Run

```bash
# Local docker-compose
BASE_URL=http://localhost:3000 WS_URL=ws://localhost:3000 \
  k6 run tests/load/auth-api.js

BASE_URL=http://localhost:3000 WS_URL=ws://localhost:3000 \
  k6 run tests/load/websocket-chat.js

# Against staging with InfluxDB output for Grafana
k6 run --out influxdb=http://monitoring.internal:8086/k6 \
  -e BASE_URL=https://staging-api.chat.example.com \
  -e WS_URL=wss://staging-api.chat.example.com \
  tests/load/websocket-chat.js
```

## Thresholds (CI gate)

Both scripts `exit != 0` if:

- `auth-api.js`: p95 read > 500ms, p95 login > 800ms, error rate > 1%
- `websocket-chat.js`: p95 msg round-trip > 500ms, p99 > 1500ms, connect p95 > 2s, error rate > 2%

Wire them up in `.github/workflows/ci.yml` as a scheduled nightly job against staging.

## Capacity notes

At 10k concurrent WebSockets, expect:

- **chat-service**: ~3,500 sockets per replica (file descriptor limit on the pod), so plan HPA for ≥ 3 replicas. The manifest already scales 3→30.
- **Redis pub/sub**: ~5k msg/s fanout at `MESSAGES_PER_VU=10, ROOM_COUNT=200` (50 VUs per room). Watch `redis_cmd_pubsub_*` metrics.
- **Kafka**: single `chat.messages` partition set should be sized to ≥ number of chat-service replicas so each consumer group member gets a partition. Default 12 partitions handles up to 12 replicas.
- **Postgres**: register is the bottleneck (bcrypt cost 12 ≈ 250ms CPU per hash). Don't run `auth-api.js` simultaneously with production traffic.
