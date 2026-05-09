import { Check, CheckCheck, Clock } from 'lucide-react';
import { cn, formatTime } from '../../utils/cn';
import Avatar from '../shared/Avatar';

export default function MessageBubble({ message, isOwn, showAvatar, showSender }) {
  const status = message.status || 'sent';

  return (
    <div
      className={cn(
        'flex gap-2 group',
        isOwn ? 'justify-end' : 'justify-start',
        showAvatar ? 'mt-3' : 'mt-0.5'
      )}
      style={{ animation: 'fade-in 0.18s ease-out' }}
    >
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showAvatar && <Avatar name={message.senderUsername} size="sm" />}
        </div>
      )}

      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2 break-words',
          isOwn
            ? 'bg-[var(--color-msg-outgoing)] text-text-primary rounded-br-md'
            : 'bg-[var(--color-msg-incoming)] text-text-primary rounded-bl-md'
        )}
      >
        {showSender && !isOwn && (
          <div className="text-xs font-semibold text-accent mb-0.5">
            {message.senderUsername}
          </div>
        )}

        {message.type === 'image' && message.media?.url && (
          <img
            src={message.media.url}
            alt=""
            className="rounded-lg mb-1 max-w-full max-h-80 object-cover cursor-pointer"
            loading="lazy"
          />
        )}

        {message.type === 'file' && message.media?.url && (
          <a
            href={message.media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-bg-elevated rounded-lg mb-1 hover:bg-bg-hover transition-colors"
          >
            <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-text-primary">{message.media.fileName}</p>
              <p className="text-xs text-text-secondary">
                {(message.media.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </a>
        )}

        {message.content && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}

        <div className={cn(
          'flex items-center gap-1 mt-1 text-[10px]',
          isOwn ? 'justify-end text-text-secondary' : 'text-text-muted'
        )}>
          <span>{formatTime(message.createdAt)}</span>
          {isOwn && (
            <span className="ml-0.5">
              {status === 'sent' && <Check size={12} />}
              {status === 'delivered' && <CheckCheck size={12} />}
              {status === 'read' && <CheckCheck size={12} className="text-info" />}
              {status === 'pending' && <Clock size={12} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
