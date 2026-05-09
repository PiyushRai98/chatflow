import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import { sendMessage, startTyping, stopTyping } from '../../services/socket';
import api from '../../services/api';
import useStore from '../../hooks/useStore';

export default function MessageInput({ chatId }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const { addMessage, user } = useStore();

  useEffect(() => {
    inputRef.current?.focus();
    // Clean up typing on chat change
    return () => {
      if (isTypingRef.current) {
        stopTyping(chatId);
        isTypingRef.current = false;
      }
    };
  }, [chatId]);

  function handleChange(e) {
    setText(e.target.value);

    // Typing indicator with debounce
    if (!isTypingRef.current) {
      startTyping(chatId);
      isTypingRef.current = true;
    }

    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      stopTyping(chatId);
      isTypingRef.current = false;
    }, 2000);
  }

  async function handleSend() {
    const content = text.trim();
    if (!content) return;

    setText('');
    clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      stopTyping(chatId);
      isTypingRef.current = false;
    }

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      chatId,
      senderId: user.id,
      senderUsername: user.username,
      content,
      type: 'text',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    addMessage(chatId, optimisticMessage);

    try {
      await sendMessage({ chatId, content, type: 'text' });
    } catch (err) {
      console.error('Send failed:', err);
      // TODO: Mark message as failed in store
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Get presigned URL
      const { uploadUrl, key } = await api.getUploadUrl(
        chatId,
        file.name,
        file.type,
        file.size
      );

      // Upload directly to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Send message with media reference
      const isImage = file.type.startsWith('image/');
      await sendMessage({
        chatId,
        content: file.name,
        type: isImage ? 'image' : 'file',
        media: {
          key,
          url: uploadUrl.split('?')[0], // Strip query params for permanent URL
          mimeType: file.type,
          size: file.size,
          fileName: file.name,
        },
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="p-4 bg-bg-surface border-t border-border">
      <div className="flex items-end gap-2 bg-bg-elevated rounded-2xl p-2 border border-border focus-within:border-accent transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.zip"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 rounded-full hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? 'Uploading...' : 'Type a message'}
          rows={1}
          disabled={uploading}
          className="flex-1 bg-transparent text-text-primary text-sm py-2 px-2 resize-none outline-none max-h-32 disabled:opacity-50"
          style={{
            minHeight: '24px',
            overflow: 'auto',
          }}
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || uploading}
          className="p-2.5 rounded-full bg-accent hover:bg-accent-hover text-bg-base transition-all disabled:opacity-30 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
          title="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
