/**
 * k6 load test — Auth + REST API
 *
 *   k6 run tests/load/auth-api.js
 *
 * Simulates a mix of registration, login, and authenticated chat-list
 * fetches against the API gateway. Ramps to 1,000 concurrent VUs.
 *
 * Thresholds fail the run if:
 *   - p95 latency > 500ms on reads
 *   - error rate > 1%
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const errors = new Rate('errors');
export const registerLatency = new Trend('register_latency');
export const loginLatency = new Trend('login_latency');
export const readLatency = new Trend('read_latency');
export const messagesSent = new Counter('messages_sent');

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 100 },   // warm
        { duration: '2m',  target: 500 },   // climb
        { duration: '3m',  target: 1000 },  // sustained peak
        { duration: '1m',  target: 0 },     // drain
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    'read_latency':    ['p(95)<500'],
    'login_latency':   ['p(95)<800'],
    'register_latency':['p(95)<1200'],
    errors:            ['rate<0.01'],
  },
};

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export function setup() {
  // Verify gateway is up before the big ramp
  const r = http.get(`${BASE_URL}/health`);
  if (r.status !== 200) throw new Error(`API gateway not reachable (${r.status})`);
  return {};
}

export default function () {
  const suffix = `${__VU}_${__ITER}_${randomString(6)}`;
  const user = {
    username: `load_${suffix}`,
    email:    `load_${suffix}@loadtest.local`,
    password: 'LoadTest!234',
    displayName: `Load ${suffix}`,
  };

  let accessToken;

  // ── Register ────────────────────────────────────────────
  group('register', () => {
    const res = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify(user),
      { headers: jsonHeaders(), tags: { endpoint: 'register' } }
    );
    registerLatency.add(res.timings.duration);
    const ok = check(res, {
      'register 201': (r) => r.status === 201,
      'has tokens': (r) => {
        try { return !!r.json('accessToken'); } catch { return false; }
      },
    });
    if (!ok) { errors.add(1); return; }
    accessToken = res.json('accessToken');
  });

  sleep(0.2);

  // ── Login (rotating refresh exercise) ──────────────────
  group('login', () => {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: jsonHeaders(), tags: { endpoint: 'login' } }
    );
    loginLatency.add(res.timings.duration);
    const ok = check(res, { 'login 200': (r) => r.status === 200 });
    if (!ok) { errors.add(1); return; }
    accessToken = res.json('accessToken');
  });

  sleep(0.3);

  // ── Authenticated reads ────────────────────────────────
  group('authenticated_reads', () => {
    const me = http.get(`${BASE_URL}/api/users/me`, {
      headers: jsonHeaders(accessToken), tags: { endpoint: 'me' },
    });
    readLatency.add(me.timings.duration);
    check(me, { 'me 200': (r) => r.status === 200 }) || errors.add(1);

    const chats = http.get(`${BASE_URL}/api/chats`, {
      headers: jsonHeaders(accessToken), tags: { endpoint: 'chats' },
    });
    readLatency.add(chats.timings.duration);
    check(chats, { 'chats 200': (r) => r.status === 200 }) || errors.add(1);
  });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'tests/load/reports/auth-api-summary.json': JSON.stringify(data, null, 2),
  };
}

// Minimal text summary (avoid pulling k6-utils for offline runs)
function textSummary(data) {
  const m = data.metrics;
  const line = (k, v) => `  ${k.padEnd(24)} ${v}\n`;
  let out = '\nLoad test summary\n';
  out += line('http_reqs',   m.http_reqs?.values?.count ?? 0);
  out += line('errors (%)',  ((m.errors?.values?.rate ?? 0) * 100).toFixed(2));
  out += line('p95 read (ms)', (m.read_latency?.values?.['p(95)'] ?? 0).toFixed(1));
  out += line('p95 login (ms)',(m.login_latency?.values?.['p(95)'] ?? 0).toFixed(1));
  out += line('p95 reg (ms)',  (m.register_latency?.values?.['p(95)'] ?? 0).toFixed(1));
  return out;
}
