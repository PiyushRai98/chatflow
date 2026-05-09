import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Auth state
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  clearUser: () => set({ user: null, isAuthenticated: false }),

  // Chats
  chats: [],
  activeChat: null,
  setChats: (chats) => set({ chats }),
  setActiveChat: (chat) => set({ activeChat: chat }),
  updateChat: (chatId, updates) => set((state) => ({
    chats: state.chats.map((c) =>
      c.chatId === chatId ? { ...c, ...updates } : c
    ),
  })),
  addChat: (chat) => set((state) => ({
    chats: [chat, ...state.chats.filter((c) => c.chatId !== chat.chatId)],
  })),

  // Messages (keyed by chatId)
  messages: {},
  addMessage: (chatId, message) => set((state) => {
    const existing = state.messages[chatId] || [];
    // Prevent duplicates
    if (existing.some((m) => m.id === message.id || m.messageId === message.id)) {
      return state;
    }
    return {
      messages: {
        ...state.messages,
        [chatId]: [...existing, message],
      },
    };
  }),
  setMessages: (chatId, messages) => set((state) => ({
    messages: { ...state.messages, [chatId]: messages },
  })),
  prependMessages: (chatId, olderMessages) => set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...olderMessages, ...(state.messages[chatId] || [])],
    },
  })),
  updateMessageStatus: (chatId, messageId, status) => set((state) => {
    const msgs = state.messages[chatId];
    if (!msgs) return state;
    return {
      messages: {
        ...state.messages,
        [chatId]: msgs.map((m) =>
          (m.id === messageId || m.messageId === messageId) ? { ...m, status } : m
        ),
      },
    };
  }),

  // Typing indicators
  typingUsers: {}, // { chatId: { userId: username } }
  setTyping: (chatId, userId, username, isTyping) => set((state) => {
    const chatTyping = { ...(state.typingUsers[chatId] || {}) };
    if (isTyping) {
      chatTyping[userId] = username;
    } else {
      delete chatTyping[userId];
    }
    return { typingUsers: { ...state.typingUsers, [chatId]: chatTyping } };
  }),

  // Online users
  onlineUsers: new Set(),
  setUserOnline: (userId) => set((state) => {
    const next = new Set(state.onlineUsers);
    next.add(userId);
    return { onlineUsers: next };
  }),
  setUserOffline: (userId) => set((state) => {
    const next = new Set(state.onlineUsers);
    next.delete(userId);
    return { onlineUsers: next };
  }),

  // Unread counts
  unreadCounts: {},
  setUnreadCounts: (counts) => set({ unreadCounts: counts }),
  incrementUnread: (chatId) => set((state) => ({
    unreadCounts: {
      ...state.unreadCounts,
      [chatId]: (state.unreadCounts[chatId] || 0) + 1,
    },
  })),
  clearUnread: (chatId) => set((state) => {
    const next = { ...state.unreadCounts };
    delete next[chatId];
    return { unreadCounts: next };
  }),

  // UI state
  showSidebar: true,
  toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),
  showNewChat: false,
  setShowNewChat: (show) => set({ showNewChat: show }),
}));

export default useStore;
