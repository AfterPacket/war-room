'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/useSettingsStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
}

interface ChatInterfaceProps {
  newsContext?: string;
}

export function ChatInterface({ newsContext }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { activeAiProvider, claudeModel, openaiModel, geminiModel } = useSettingsStore();

  const getModel = () => {
    if (activeAiProvider === 'claude') return claudeModel;
    if (activeAiProvider === 'openai') return openaiModel;
    return geminiModel;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg = input.trim();
    setInput('');

    const userMessage: Message = {
      role: 'user',
      content: userMsg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      provider: activeAiProvider,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          provider: activeAiProvider,
          model: getModel(),
          context: newsContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { ...assistantMessage, content: err.error || 'Request failed' },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullText += data.text;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { ...assistantMessage, content: fullText },
              ]);
            }
          } catch {}
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { ...assistantMessage, content: 'Connection error. Check your API key in Settings.' },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 space-y-3 px-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40 select-none">
            <span style={{ fontSize: '28px' }}>🎯</span>
            <span className="font-data uppercase text-center" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              Ask WARROOM AI about current events
            </span>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-[85%] px-3 py-2 text-sm leading-relaxed"
              style={{
                backgroundColor: msg.role === 'user' ? 'var(--bg-elevated)' : 'var(--bg-base)',
                border: `1px solid ${msg.role === 'user' ? 'var(--border-active)' : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.role === 'assistant' && msg.provider && (
                <div className="font-data uppercase mb-1" style={{ color: 'var(--text-accent)', fontSize: '9px' }}>
                  {msg.provider.toUpperCase()} AI
                </div>
              )}
              {msg.content || (isStreaming && msg.role === 'assistant' && (
                <span className="acquiring" style={{ color: 'var(--text-tertiary)' }}>▌</span>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 flex gap-2 p-3"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about current events..."
          disabled={isStreaming}
          className="flex-1 px-3 py-2 font-data"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isStreaming}
          className="px-3 py-2 transition-opacity disabled:opacity-30"
          style={{ backgroundColor: 'var(--text-accent)', color: 'var(--bg-base)' }}
        >
          {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
