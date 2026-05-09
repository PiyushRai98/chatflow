import Avatar from '../shared/Avatar';

export default function TypingIndicator({ users }) {
  if (!users || users.length === 0) return null;

  const names = Object.values(users);
  const text = names.length === 1
    ? `${names[0]} is typing`
    : names.length === 2
    ? `${names[0]} and ${names[1]} are typing`
    : `${names.length} people are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-2 animate-[fade-in_0.2s_ease-out]">
      <Avatar name={names[0]} size="sm" />
      <div className="bg-[var(--color-msg-incoming)] rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-text-secondary" style={{ animation: 'pulse-dot 1.4s infinite ease-in-out 0s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-text-secondary" style={{ animation: 'pulse-dot 1.4s infinite ease-in-out 0.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-text-secondary" style={{ animation: 'pulse-dot 1.4s infinite ease-in-out 0.4s' }} />
      </div>
      <span className="text-xs text-text-muted">{text}</span>
    </div>
  );
}
