import { io } from 'socket.io-client';

let socket = null;

const SOCKET_EVENTS = {
  SEND_MESSAGE: 'message:send',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_ACK: 'message:ack',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_TYPING: 'user:typing',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  JOIN_CHAT: 'chat:join',
  LEAVE_CHAT: 'chat:leave',
  AUTHENTICATED: 'authenticated',
  AUTH_ERROR: 'auth_error',
};

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

export function sendMessage(data) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      return reject(new Error('Not connected'));
    }

    socket.emit(SOCKET_EVENTS.SEND_MESSAGE, data, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

export function joinChat(chatId) {
  socket?.emit(SOCKET_EVENTS.JOIN_CHAT, { chatId });
}

export function leaveChat(chatId) {
  socket?.emit(SOCKET_EVENTS.LEAVE_CHAT, { chatId });
}

export function startTyping(chatId) {
  socket?.emit(SOCKET_EVENTS.TYPING_START, { chatId });
}

export function stopTyping(chatId) {
  socket?.emit(SOCKET_EVENTS.TYPING_STOP, { chatId });
}

export function markDelivered(messageId, chatId) {
  socket?.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, { messageId, chatId });
}

export function markRead(messageIds, chatId) {
  socket?.emit(SOCKET_EVENTS.MESSAGE_READ, { messageIds, chatId });
}

export { SOCKET_EVENTS };
