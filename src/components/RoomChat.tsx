import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/mockBackend";

interface RoomChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  currentUserId: string;
  onTypingChange?: (isTyping: boolean) => void;
}

/** Inline chat panel for the bottom bar (right side). */
export default function RoomChat({
  messages,
  onSend,
  currentUserId,
  onTypingChange,
}: RoomChatProps) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, expanded]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onTypingChange?.(false);
    onSend(text);
    setText("");
    setExpanded(true);
  }

  function handleInputChange(value: string) {
    setText(value);
    onTypingChange?.(value.trim().length > 0);
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
            if (text.trim()) onTypingChange?.(true);
          }}
          onBlur={() => onTypingChange?.(false)}
        />
        <button type="submit" className="btn-primary !px-3 !py-2 text-sm">
          Send
        </button>
      </form>
    </div>
  );
}
