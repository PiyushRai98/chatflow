import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket, SOCKET_EVENTS } from '../services/socket';
import useStore from './useStore';

export function useSocket(token) {
  const socketRef = useRef(null);
  const {
    addMessage,
    updateMessageStatus,
    setTyping,
    setUserOnline,
    setUserOffline,
    incrementUnread,
    activeChat,
    user,
  } = useStore();

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);
    socketRef.current = socket;

    // Incoming message
    socket.on(SOCKET_EVENTS.MESSAGE_RECEIVED, ({ chatId, message }) => {
      addMessage(chatId, message);

      // If not in this chat, increment unread
      if (activeChat?.chatId !== chatId) {
        incrementUnread(chatId);
      }
    });

    // Delivery receipt
    socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, ({ messageId, chatId }) => {
      updateMessageStatus(chatId, messageId, 'delivered');
    });

    // Read receipt
    socket.on(SOCKET_EVENTS.MESSAGE_READ, ({ messageIds, chatId }) => {
      messageIds?.forEach((id) => {
        updateMessageStatus(chatId, id, 'read');
      });
    });

    // Typing
    socket.on(SOCKET_EVENTS.USER_TYPING, ({ chatId, userId, username, isTyping }) => {
      if (userId !== user?.id) {
        setTyping(chatId, userId, username, isTyping);
      }
    });

    // Presence
    socket.on(SOCKET_EVENTS.USER_ONLINE, ({ userId }) => {
      setUserOnline(userId);
    });

    socket.on(SOCKET_EVENTS.USER_OFFLINE, ({ userId }) => {
      setUserOffline(userId);
    });

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_RECEIVED);
      socket.off(SOCKET_EVENTS.MESSAGE_DELIVERED);
      socket.off(SOCKET_EVENTS.MESSAGE_READ);
      socket.off(SOCKET_EVENTS.USER_TYPING);
      socket.off(SOCKET_EVENTS.USER_ONLINE);
      socket.off(SOCKET_EVENTS.USER_OFFLINE);
      disconnectSocket();
    };
  }, [token]);

  return socketRef;
}
