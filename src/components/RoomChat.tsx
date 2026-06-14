import { memo, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/backend";

interface RoomChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  currentUserId: string;
  onTypingChange?: (isTyping: boolean) => void;
}

/** Inline chat panel for the bottom bar (right side). */
function RoomChat({
  messages,
  onSend,
  currentUserId,
  onTypingChange,
}: RoomChatProps) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingActiveRef = useRef(false);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, expanded]);

  function setTypingActive(active: boolean) {
    if (typingActiveRef.current === active) return;
    typingActiveRef.current = active;
    onTypingChange?.(active);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    setTypingActive(false);
    onSend(text);
    setText("");
    setExpanded(true);
  }

  function handleInputChange(value: string) {
    setText(value);
    const hasText = value.trim().length > 0;
    if (!hasText) {
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      setTypingActive(false);
      return;
    }
    setTypingActive(true);
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = setTimeout(() => setTypingActive(false), 1800);
  }

  return (
    <div className="panel flex w-full max-w-sm flex-col gap-2 px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between text-left"
      >
        <span className="text-sm font-extrabold text-brown">💬 Chat</span>
        <span className="text-xs font-bold text-peach">
          {expanded ? "Hide" : `${messages.length} msgs`}
        </span>
      </button>

      {expanded && (
        <div className="max-h-28 space-y-1.5 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-xs text-brown/60">Say hi to your study buddies!</p>
          )}
          {messages.slice(-20).map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-2.5 py-1.5 text-xs ${
                m.userId === currentUserId
                  ? "bg-peach/25 text-brown"
                  : "bg-wood/20 text-brown"
              }`}
            >
              <span className="font-bold text-brown/70">{m.displayName}: </span>
              {m.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          className="input-cozy !py-2 text-sm"
          placeholder="Message…"
          value={text}
          onChange={(e) => handleInputChange(e.target.value)}
          maxLength={200}
          onFocus={() => {
            setExpanded(true);
            if (text.trim()) setTypingActive(true);
          }}
          onBlur={() => {
            if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
            setTypingActive(false);
          }}
        />
        <button type="submit" className="btn-primary !px-3 !py-2 text-sm">
          Send
        </button>
      </form>
    </div>
  );
}

export default memo(RoomChat);
