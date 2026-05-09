import { useEffect, useState } from 'react';
import { Search, Plus, LogOut, MessageCircle } from 'lucide-react';
import api from '../../services/api';
import useStore from '../../hooks/useStore';
import Avatar from '../shared/Avatar';
import { formatDate, cn } from '../../utils/cn';
import NewChatModal from './NewChatModal';

export default function Sidebar() {
  const {
    chats,
    setChats,
    activeChat,
    setActiveChat,
    user,
    clearUser,
    onlineUsers,
    unreadCounts,
    showNewChat,
    setShowNewChat,
  } = useStore();

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChats() {
      try {
        const data = await api.getChats();
        setChats(data.chats || []);
      } catch (err) {
        console.error('Failed to load chats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadChats();
  }, [setChats]);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {}
    api.clearTokens();
    clearUser();
  }

  const filteredChats = chats.filter((chat) => {
    if (!search) return true;
    const name = chat.type === 'direct'
      ? chat.participants.find((p) => p.userId !== user?.id)?.username || ''
      : chat.name || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  function getChatDisplayName(chat) {
    if (chat.type === 'group') return chat.name || 'Unnamed Group';
    const other = chat.participants.find((p) => p.userId !== user?.id);
    return other?.displayName || other?.username || 'Unknown';
  }

  function isChatOnline(chat) {
    if (chat.type === 'group') return false;
    const other = chat.participants.find((p) => p.userId !== user?.id);
    return other ? onlineUsers.has(other.userId) : false;
  }

  return (
    <>
      <aside className="w-80 bg-bg-surface border-r border-border flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={user?.username} size="md" online />
            <div>
              <p className="font-semibold text-sm text-text-primary">{user?.username}</p>
              <p className="text-xs text-text-secondary">Active now</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Search & New Chat */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              className="w-full bg-bg-elevated text-text-primary text-sm pl-10 pr-4 py-2.5 rounded-full border border-border focus:border-accent focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-bg-base font-bold py-2.5 px-4 rounded-full uppercase tracking-wider text-xs transition-all transform hover:scale-[1.02]"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-text-secondary text-sm">
              Loading chats...
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center text-text-secondary text-sm">
              <MessageCircle className="mx-auto mb-3 opacity-30" size={48} />
              <p>No conversations yet</p>
              <p className="text-xs mt-1 text-text-muted">Start a new chat to begin</p>
            </div>
          ) : (
            filteredChats.map((chat) => {
              const name = getChatDisplayName(chat);
              const online = isChatOnline(chat);
              const unread = unreadCounts[chat.chatId] || 0;
              const isActive = activeChat?.chatId === chat.chatId;

              return (
                <button
                  key={chat.chatId}
                  onClick={() => setActiveChat(chat)}
                  className={cn(
                    'w-full p-3 flex items-center gap-3 hover:bg-bg-hover transition-colors text-left',
                    isActive && 'bg-bg-hover'
                  )}
                >
                  <Avatar name={name} src={chat.avatarUrl} online={chat.type === 'direct' ? online : undefined} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-sm text-text-primary truncate">{name}</h3>
                      {chat.lastMessage?.timestamp && (
                        <span className="text-xs text-text-muted shrink-0">
                          {formatDate(chat.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-text-secondary truncate">
                        {chat.lastMessage?.content || 'No messages yet'}
                      </p>
                      {unread > 0 && (
                        <span className="bg-accent text-bg-base text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </>
  );
}
