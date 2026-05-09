/**
 * Integration test for the realtime message flow inside chat-service.
 *
 * We stand up a real Socket.io server in-process with the actual auth
 * middleware and chat handlers, then drive it with a real socket.io-client.
 *
 * Kafka + Redis are stubbed at the module level — we assert that handlers
 * publish the right payloads to the right channels/topics, and that acks
 * flow back to the client. This catches contract drift between the
 * frontend wire events and the server handlers without needing a broker.
 */
const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');

// ── Stub Kafka ─────────────────────────────────────────────
const publishChatMessage = jest.fn().mockResolvedValue();
const publishNotification = jest.fn().mockResolvedValue();
jest.mock('../../src/utils/kafka', () => ({
  publishChatMessage,
  publishNotification,
  connectProducer: jest.fn().mockResolvedValue(),
  disconnectProducer: jest.fn().mockResolvedValue(),
}));

// ── Stub Redis ─────────────────────────────────────────────
const pubPublish = jest.fn().mockResolvedValue(1);
jest.mock('../../src/utils/redis', () => ({
  setUserOnline: jest.fn().mockResolvedValue(),
  setUserOffline: jest.fn().mockResolvedValue(),
  getUserPresence: jest.fn().mockResolvedValue(null),
  setTyping: jest.fn().mockResolvedValue(),
  clearTyping: jest.fn().mockResolvedValue(),
  getPubClient: () => ({ publish: pubPublish }),
  getSubClient: () => ({ subscribe: jest.fn(), on: jest.fn() }),
}));

const { socketAuthMiddleware } = require('../../src/middleware/socketAuth');
const { registerChatHandlers } = require('../../src/handlers/chatHandler');
const config = require('../../src/utils/config');

const JWT_SECRET = config.jwt.secret;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function makeServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 2000,
    pingInterval: 500,
  });
  io.use(socketAuthMiddleware);
  io.on('connection', (socket) => registerChatHandlers(io, socket));
  return { httpServer, io };
}

function listen(httpServer) {
  return new Promise((resolve) => {
    httpServer.listen(0, () => resolve(httpServer.address().port));
  });
}

function connect(port, token) {
  return new Promise((resolve, reject) => {
    const client = Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
  });
}

describe('chat-service message flow (integration)', () => {
  let httpServer, io, port;

  beforeAll(async () => {
    ({ httpServer, io } = makeServer());
    port = await listen(httpServer);
  });

  afterAll(async () => {
    io.disconnectSockets(true);
    await new Promise((r) => io.close(r));
    await new Promise((r) => httpServer.close(r));
  });

  beforeEach(() => {
    publishChatMessage.mockClear();
    publishNotification.mockClear();
    pubPublish.mockClear();
  });

  describe('authentication', () => {
    it('rejects connection with no token', async () => {
      await expect(connect(port, undefined)).rejects.toThrow();
    });

    it('rejects a forged token', async () => {
      const bad = jwt.sign({ sub: 'u-1' }, 'wrong-secret');
      await expect(connect(port, bad)).rejects.toThrow();
    });

    it('accepts a valid token', async () => {
      const token = signToken({ id: 'u-1', username: 'alice' });
      const client = await connect(port, token);
      expect(client.connected).toBe(true);
      client.disconnect();
    });
  });

  describe('message:send', () => {
    let client;
    beforeEach(async () => {
      client = await connect(port, signToken({ id: 'u-1', username: 'alice' }));
    });
    afterEach(() => client?.disconnect());

    it('publishes to Kafka and Redis, then acks the sender', async () => {
      const ack = await new Promise((resolve) => {
        client.emit('message:send', {
          chatId: 'chat-42',
          content: 'Hello, Bob!',
        }, resolve);
      });

      expect(ack).toMatchObject({ success: true });
      expect(ack.messageId).toMatch(/[0-9a-f-]{36}/);
      expect(ack.timestamp).toEqual(expect.any(String));

      // Kafka publish was called with a well-formed message
      expect(publishChatMessage).toHaveBeenCalledTimes(1);
      const kafkaMsg = publishChatMessage.mock.calls[0][0];
      expect(kafkaMsg).toMatchObject({
        id: ack.messageId,
        chatId: 'chat-42',
        senderId: 'u-1',
        senderUsername: 'alice',
        content: 'Hello, Bob!',
        type: 'text',
        status: 'sent',
      });

      // Redis pub for realtime fanout
      const messagePublish = pubPublish.mock.calls.find(
        ([ch]) => ch === 'chat:messages'
      );
      expect(messagePublish).toBeDefined();
      const payload = JSON.parse(messagePublish[1]);
      expect(payload).toMatchObject({
        chatId: 'chat-42',
        message: { id: ack.messageId, senderId: 'u-1' },
      });
    });

    it('rejects messages with empty content', async () => {
      const ack = await new Promise((resolve) => {
        client.emit('message:send', { chatId: 'c-1', content: '   ' }, resolve);
      });
      expect(ack).toEqual({ error: 'chatId and content required' });
      expect(publishChatMessage).not.toHaveBeenCalled();
    });

    it('rejects messages without chatId', async () => {
      const ack = await new Promise((resolve) => {
        client.emit('message:send', { content: 'hi' }, resolve);
      });
      expect(ack.error).toBeTruthy();
      expect(publishChatMessage).not.toHaveBeenCalled();
    });

    it('trims whitespace from content before persisting', async () => {
      await new Promise((r) => client.emit('message:send',
        { chatId: 'c-1', content: '  hi  ' }, r));
      expect(publishChatMessage.mock.calls[0][0].content).toBe('hi');
    });
  });

  describe('receipts + typing', () => {
    let client;
    beforeEach(async () => {
      client = await connect(port, signToken({ id: 'u-1', username: 'alice' }));
    });
    afterEach(() => client?.disconnect());

    it('publishes a "delivered" receipt on message:delivered', async () => {
      client.emit('message:delivered', { messageId: 'm-1', chatId: 'c-1' });
      await new Promise((r) => setTimeout(r, 50));
      const call = pubPublish.mock.calls.find(([ch]) => ch === 'chat:receipts');
      expect(call).toBeDefined();
      expect(JSON.parse(call[1])).toMatchObject({
        type: 'delivered', messageId: 'm-1', chatId: 'c-1', userId: 'u-1',
      });
    });

    it('publishes a batched "read" receipt for multiple messages', async () => {
      client.emit('message:read', {
        messageIds: ['m-1', 'm-2', 'm-3'], chatId: 'c-1',
      });
      await new Promise((r) => setTimeout(r, 50));
      const call = pubPublish.mock.calls.find(([ch]) => ch === 'chat:receipts');
      expect(JSON.parse(call[1])).toMatchObject({
        type: 'read',
        messageIds: ['m-1', 'm-2', 'm-3'],
        userId: 'u-1',
      });
    });

    it('publishes typing start/stop events', async () => {
      client.emit('typing:start', { chatId: 'c-1' });
      client.emit('typing:stop', { chatId: 'c-1' });
      await new Promise((r) => setTimeout(r, 50));
      const typingCalls = pubPublish.mock.calls.filter(([ch]) => ch === 'chat:typing');
      expect(typingCalls).toHaveLength(2);
      expect(JSON.parse(typingCalls[0][1]).type).toBe('start');
      expect(JSON.parse(typingCalls[1][1]).type).toBe('stop');
    });
  });

  describe('room management', () => {
    it('client joins chat:<id> room and receives room-scoped broadcasts', async () => {
      const client = await connect(port, signToken({ id: 'u-1', username: 'alice' }));
      const received = new Promise((resolve) =>
        client.on('test:broadcast', resolve)
      );
      client.emit('chat:join', { chatId: 'room-42' });
      // Wait for server-side join to settle, then emit to the room
      await new Promise((r) => setTimeout(r, 50));
      io.to('chat:room-42').emit('test:broadcast', { ok: true });
      await expect(received).resolves.toEqual({ ok: true });
      client.disconnect();
    });
  });
});
