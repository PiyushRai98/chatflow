import { useState, useEffect } from 'react';
import { X, Search, Users } from 'lucide-react';
import api from '../../services/api';
import useStore from '../../hooks/useStore';
import Avatar from '../shared/Avatar';

export default function NewChatModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
  const [creating, setCreating] = useState(false);
  const { addChat, setActiveChat, user } = useStore();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const data = await api.searchUsers(query);
        setResults((data.users || []).filter((u) => u.id !== user?.id));
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, user?.id]);

  function toggleUser(u) {
    if (mode === 'direct') {
      setSelected([u]);
    } else {
      setSelected((prev) =>
        prev.some((p) => p.id === u.id)
          ? prev.filter((p) => p.id !== u.id)
          : [...prev, u]
      );
    }
  }

  async function handleCreate() {
    if (selected.length === 0) return;
    setCreating(true);

    try {
      const data = await api.createChat({
        type: mode,
        name: mode === 'group' ? groupName : undefined,
        participants: selected.map((u) => ({
          userId: u.id,
          username: u.username,
          displayName: u.display_name,
        })),
      });

      addChat(data.chat);
      setActiveChat(data.chat);
      onClose();
    } catch (err) {
      console.error('Failed to create chat:', err);
    } finally {
      setCreating(false);
    }
  }

  // Close on escape — small delight detail
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fade-in_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-bg-surface rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'fade-in 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">New Chat</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => { setMode('direct'); setSelected([]); }}
            className={`flex-1 py-2 px-4 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
              mode === 'direct'
                ? 'bg-accent text-bg-base'
                : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            Direct
          </button>
          <button
            onClick={() => { setMode('group'); setSelected([]); }}
            className={`flex-1 py-2 px-4 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
              mode === 'group'
                ? 'bg-accent text-bg-base'
                : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            <Users size={14} className="inline mr-1" />
            Group
          </button>
        </div>

        {/* Group name */}
        {mode === 'group' && (
          <div className="px-6 pt-4">
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full bg-bg-elevated text-text-primary px-4 py-2.5 rounded-lg border border-border focus:border-accent focus:outline-none transition-colors text-sm"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by username"
              className="w-full bg-bg-elevated text-text-primary text-sm pl-10 pr-4 py-2.5 rounded-full border border-border focus:border-accent focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Selected pills */}
        {selected.length > 0 && (
          <div className="px-6 pt-3 flex flex-wrap gap-2">
            {selected.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleUser(u)}
                className="flex items-center gap-1.5 bg-accent/20 text-accent text-xs font-semibold px-3 py-1 rounded-full hover:bg-accent/30 transition-colors"
              >
                {u.username}
                <X size={12} />
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2 mt-2">
          {results.length === 0 && query && (
            <p className="text-center text-text-muted text-sm py-8">No users found</p>
          )}
          {results.map((u) => {
            const isSelected = selected.some((s) => s.id === u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleUser(u)}
                className={`w-full p-3 flex items-center gap-3 rounded-lg hover:bg-bg-hover transition-colors text-left ${
                  isSelected ? 'bg-bg-hover' : ''
                }`}
              >
                <Avatar name={u.username} src={u.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-text-primary">{u.display_name || u.username}</p>
                  <p className="text-xs text-text-secondary">@{u.username}</p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <svg className="w-3 h-3 text-bg-base" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border">
          <button
            onClick={handleCreate}
            disabled={selected.length === 0 || creating || (mode === 'group' && !groupName.trim())}
            className="w-full bg-accent hover:bg-accent-hover text-bg-base font-bold py-3 px-6 rounded-full uppercase tracking-wider text-xs transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {creating ? 'Creating...' : 'Start Chat'}
          </button>
        </div>
      </div>
    </div>
  );
}
