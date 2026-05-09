import { useEffect, useRef } from 'react';
import { MessageCircle, Phone, Video, MoreVertical } from 'lucide-react';
import api from '../../services/api';
import useStore from '../../hooks/useStore';
import { joinChat, leaveChat, markRead } from '../../services/socket';
import Avatar from '../shared/Avatar';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';

export default function ChatWindow() {
  const {
    activeChat,
    messages,
    setMessages,
    user,
    onlineUsers,
    typingUsers,
    clearUnread,
  } = useStore();

  const scrollRef = useRef(null);
  const lastMarkedReadRef = useRef(null);

  // Load messages when active chat changes
  useEffect(() => {
    if (!activeChat) return;

    let cancelled = false;

    async function loadMessages() {
      try {
        const data = await api.getMessages(activeChat.chatId);
        if (cancelled) return;
        setMessages(activeChat.chatId, data.messages || []);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }

    loadMessages();
    joinChat(activeChat.chatId);
    clearUnread(activeChat.chatId);

    // Mark as read
    api.markAsRead(activeChat.chatId).catch(() => {});

    return () => {
      cancelled = true;
      leaveChat(activeChat.chatId);
    };
  }, [activeChat?.chatId, setMessages, clearUnread]);

  const chatMessages = activeChat ? messages[activeChat.chatId] || [] : [];
  const chatTyping = activeChat ? typingUsers[activeChat.chatId] : null;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, chatTyping]);

  // Mark unread messages as read
  useEffect(() => {
    if (!activeChat || chatMessages.length === 0) return;

    const unreadIds = chatMessages
      .filter((m) => m.senderId !== user?.id && m.status !== 'read')
      .map((m) => m.id || m.messageId);

    if (unreadIds.length === 0) return;

    const lastId = unreadIds[unreadIds.length - 1];
    if (lastMarkedReadRef.current === lastId) return;
    lastMarkedReadRef.current = lastId;

    markRead(unreadIds, activeChat.chatId);
  }, [chatMessages, activeChat, user?.id]);

  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-base">
        <div className="text-center">
          <MessageCircle className="mx-auto mb-4 text-text-muted opacity-30" size={80} />
          <h2 className="text-2xl font-bold text-text-primary mb-2">Welcome to ChatFlow</h2>
          <p className="text-text-secondary text-sm">
            Select a conversation or start a new chat to begin messaging
          </p>
        </div>
      </div>
    );
  }

  const chatName = activeChat.type === 'group'
    ? activeChat.name || 'Unnamed Group'
    : activeChat.participants.find((p) => p.userId !== user?.id)?.displayName ||
      activeChat.participants.find((p) => p.userId !== user?.id)?.username ||
      'Unknown';

  const otherUser = activeChat.type === 'direct'
    ? activeChat.participants.find((p) => p.userId !== user?.id)
    : null;

  const isOnline = otherUser ? onlineUsers.has(otherUser.userId) : false;

  return (
    <div className="flex-1 flex flex-col bg-bg-base">
      {/* Header */}
      <div className="p-4 bg-bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={chatName} src={activeChat.avatarUrl} online={otherUser ? isOnline : undefined} />
          <div>
            <h2 className="font-semibold text-text-primary text-base">{chatName}</h2>
            <p className="text-xs text-text-secondary">
              {activeChat.type === 'direct'
                ? isOnline ? 'Online' : 'Offline'
                : `${activeChat.participants.length} members`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-2.5 rounded-full hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors" title="Voice call">
            <Phone size={18} />
          </button>
          <button className="p-2.5 rounded-full hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors" title="Video call">
            <Video size={18} />
          </button>
          <button className="p-2.5 rounded-full hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors" title="More options">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {chatMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-text-muted text-sm">
              <p>No messages yet</p>
              <p className="text-xs mt-1">Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          chatMessages.map((msg, idx) => {
            const isOwn = msg.senderId === user?.id;
            const prevMsg = chatMessages[idx - 1];
            const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
            const showSender = activeChat.type === 'group' && showAvatar && !isOwn;

            return (
              <MessageBubble
                key={msg.id || msg.messageId || idx}
                message={msg}
                isOwn={isOwn}
                showAvatar={showAvatar}
                showSender={showSender}
              />
            );
          })
        )}
        {chatTyping && Object.keys(chatTyping).length > 0 && (
          <TypingIndicator users={chatTyping} />
        )}
      </div>

      {/* Input */}
      <MessageInput chatId={activeChat.chatId} />
    </div>
  );
}
