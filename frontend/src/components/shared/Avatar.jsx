import { cn, getInitials } from '../../utils/cn';

const COLORS = [
  'bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'bg-orange-600',
  'bg-pink-600', 'bg-teal-600', 'bg-indigo-600', 'bg-rose-600',
];

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export default function Avatar({ src, name, size = 'md', online, className }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const colorClass = COLORS[hashCode(name || '') % COLORS.length];

  return (
    <div className={cn('relative shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn('rounded-full object-cover', sizes[size])}
        />
      ) : (
        <div
          className={cn(
            'rounded-full flex items-center justify-center font-semibold text-white',
            sizes[size],
            colorClass
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-bg-surface',
            online ? 'bg-accent' : 'bg-text-muted'
          )}
        />
      )}
    </div>
  );
}
