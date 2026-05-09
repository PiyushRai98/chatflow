/**
 * k6 load test — WebSocket / chat fanout
 *
 *   k6 run tests/load/websocket-chat.js
 *
 * Simulates N concurrent users connected to chat-service (via the
 * gateway's /socket.io WS upgrade path). Each VU:
 *   1. Logs in over REST to get a JWT.
 *   2. Opens a WebSocket with Socket.io's Engine.IO protocol.
 *   3. Joins a shared room and sends a message every few seconds.
 *   4. Measures round-trip latency for its own ack.
 *
 * We speak the Engine.IO protocol directly since k6 has no Socket.io
 * client. The wire format is: `<type><namespace>[<json>]`, with a
 * periodic "2" ping and "3" pong. See socket.io docs for details.
 *
 * Ramps up to 10k concurrent VUs across multiple rooms to exercise
 * Redis pub/sub fanout and sticky-session routing.
 */
import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_HTTP = __ENV.BASE_URL || 'http://localhost:3000';
const BASE_WS   = __ENV.WS_URL   || 'ws://localhost:3000';
const ROOM_COUNT = parseInt(__ENV.ROOM_COUNT || '200', 10);
const MESSAGES_PER_VU = parseInt(__ENV.MESSAGES_PER_VU || '10', 10);

export const wsConnectTime = new Trend('ws_connect_ms');
export const msgRoundTrip  = new Trend('msg_rtt_ms');
export const msgErrors     = new Rate('msg_errors');
export const msgsSent      = new Counter('msgs_sent');
export const msgsReceived  = new Counter('msgs_received');

export const options = {
  scenarios: {
    ws_chat: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 500   }, // baseline
        { duration: '2m',  target: 2000  },
        { duration: '3m',  target: 5000  },
        { duration: '5m',  target: 10000 }, // "thousands of users"
        { duration: '2m',  target: 0     },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ws_connect_ms: ['p(95)<2000'],
    msg_rtt_ms:    ['p(95)<500', 'p(99)<1500'],
    msg_errors:    ['rate<0.02'],
  },
};

function registerAndLogin(vu) {
  const suffix = `wsload_${vu}_${Date.now()}`;
  const body = {
    username: suffix,
    email: `${suffix}@loadtest.local`,
    password: 'Load!234',
    displayName: suffix,
  };
  const r = http.post(`${BASE_HTTP}/api/auth/register`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (r.status === 201) return r.json('accessToken');

  // Already exists (from a previous run) → fall back to login
  const li = http.post(
    `${BASE_HTTP}/api/auth/login`,
    JSON.stringify({ email: body.email, password: body.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return li.json('accessToken');
}

// ── Engine.IO / Socket.io frame helpers ────────────────────
// Engine.IO packet types: 0=open, 1=close, 2=ping, 3=pong, 4=message, 5=upgrade, 6=noop
// Socket.io packet types (inside a 4 message): 0=connect, 1=disconnect, 2=event, 3=ack
function sioConnect()       { return '40'; }                      // namespace connect
function sioEvent(name, d)  { return `42${JSON.stringify([name, d])}`; }
function sioEventAck(id, name, d) {
  return `42${id}${JSON.stringify([name, d])}`;
}

export default function () {
  const token = registerAndLogin(__VU);
  if (!token) { msgErrors.add(1); return; }

  const room = `loadroom:${__VU % ROOM_COUNT}`;
  const wsUrl = `${BASE_WS}/socket.io/?EIO=4&transport=websocket&token=${encodeURIComponent(token)}`;

  const tConnStart = Date.now();
  const pendingAcks = new Map();     // ackId → sendTs
  let ackId = 1;
  let sentCount = 0;

  const res = ws.connect(wsUrl, { headers: { Authorization: `Bearer ${token}` } }, (socket) => {
    socket.on('open', () => {
      wsConnectTime.add(Date.now() - tConnStart);
    });

    socket.on('message', (raw) => {
      // Engine.IO "open" handshake: "0{...}"
      if (raw.startsWith('0')) {
        socket.send(sioConnect());
        return;
      }
      // Socket.io CONNECT ack: "40{...}" — now we can join and start sending
      if (raw.startsWith('40')) {
        socket.send(sioEvent('chat:join', { chatId: room }));

        // Send a burst of messages with acks at a rate of ~1/s
        for (let i = 0; i < MESSAGES_PER_VU; i++) {
          socket.setTimeout(() => {
            const id = ackId++;
            pendingAcks.set(id, Date.now());
            socket.send(sioEventAck(id, 'message:send', {
              chatId: room,
              content: `hello from VU${__VU} #${i}`,
            }));
            msgsSent.add(1);
            sentCount++;
          }, i * 1000);
        }

        // Close after all messages + a grace period for acks
        socket.setTimeout(() => socket.close(), (MESSAGES_PER_VU + 5) * 1000);
      }
      // Engine.IO ping: "2" → respond with pong "3"
      if (raw === '2') { socket.send('3'); return; }
      // Socket.io ACK frame: "43<id>[...payload]"
      const ackMatch = raw.match(/^43(\d+)(\[.*\])$/);
      if (ackMatch) {
        const id = parseInt(ackMatch[1], 10);
        const t0 = pendingAcks.get(id);
        if (t0) {
          msgRoundTrip.add(Date.now() - t0);
          pendingAcks.delete(id);
          msgsReceived.add(1);
        }
        return;
      }
      // Incoming event from another VU: "42[\"event\",{...}]" — just count it
      if (raw.startsWith('42')) {
        msgsReceived.add(1);
      }
    });

    socket.on('error', () => msgErrors.add(1));
  });

  check(res, { 'ws handshake 101': (r) => r && r.status === 101 });
}
