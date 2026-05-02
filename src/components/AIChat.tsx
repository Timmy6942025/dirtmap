import { useState, useRef, useEffect } from 'react';
import { useAIChat } from '../hooks/useAIChat';
import { useNetwork } from '../store/NetworkContext';

export default function AIChat() {
  const { state, dispatch } = useNetwork();
  const { messages, isLoading, sendMessage, clearMessages, abort } = useAIChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (state.aiChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state.aiChatOpen]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <>
      {/* AI status dot */}
      <div className={`ai-status-dot ${state.aiChatOpen ? 'active' : ''}`} title={`AI Chat ${isLoading ? '(thinking...)' : ''}`} />

      <button
        className={`ai-float-btn ${state.aiChatOpen ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'TOGGLE_AI_CHAT' })}
        title={isLoading ? 'AI is thinking...' : 'AI Connection Builder'}
      >
        {isLoading ? (
          <svg className={`ai-spinner`} width={`20`} height={`20`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
            <circle cx={`12`} cy={`12`} r={`10`} strokeOpacity={`0.25`} />
            <path d={`M12 2a10 10 0 0 1 10 10`} strokeLinecap={`round`} />
          </svg>
        ) : (
          <svg width={`20`} height={`20`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
            <polygon points={`12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2`} />
          </svg>
        )}
      </button>

      {state.aiChatOpen && (
        <div className={`ai-chat-panel`}>
          <div className={`ai-chat-header`}>
            <div className={`ai-chat-title`}>
              <svg width={`14`} height={`14`} viewBox={`0 0 24 24`} fill={`none`} stroke={`#22d3ee`} strokeWidth={`2`}>
                <polygon points={`12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2`} />
              </svg>
              AI Connection Builder
            </div>
            <div className={`ai-chat-header-actions`}>
              {messages.length > 0 && (
                <button
                  className={`ai-chat-clear`}
                  onClick={clearMessages}
                  title={`Clear conversation`}
                >
                  <svg width={`12`} height={`12`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
                    <polyline points={`3 6 5 6 21 6`} />
                    <path d={`M19 6l-1 14H6L5 6`} />
                    <path d={`M10 11v6`} />
                    <path d={`M14 11v6`} />
                    <path d={`M9 6V4h6v2`} />
                  </svg>
                </button>
              )}
              {isLoading ? (
                <button className={`ai-chat-stop`} onClick={abort} title={`Stop`}>
                  <svg width={`12`} height={`12`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
                    <rect x={`6`} y={`6`} width={`12`} height={`12`} />
                  </svg>
                </button>
              ) : null}
              <button className={`ai-chat-close`} onClick={() => dispatch({ type: 'TOGGLE_AI_CHAT' })}>
                <svg width={`14`} height={`14`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
                  <line x1={`18`} y1={`6`} x2={`6`} y2={`18`} />
                  <line x1={`6`} y1={`6`} x2={`18`} y2={`18`} />
                </svg>
              </button>
            </div>
          </div>

          <div className={`ai-chat-messages`}>
            {messages.length === 0 && (
              <div className={`ai-chat-placeholder`}>
                <p>Chat with the AI to explore relationships and add connections.</p>
                <p className={`ai-example`}>
                  e.g., &ldquo;Who has the most leverage on Morgan?&rdquo; or &ldquo;Alex has embarrassing photos on Morgan from the office party&rdquo;
                </p>
                <div className={`ai-hint-grid`}>
                  <div className={`ai-hint`} onClick={() => sendMessage(`Who are the most dangerous people in this network?`)}>
                    <span className={`ai-hint-icon`}>⚔️</span>
                    <span>Who are the most dangerous?</span>
                  </div>
                  <div className={`ai-hint`} onClick={() => sendMessage(`Show me everyone who has leverage on Morgan`)}>
                    <span className={`ai-hint-icon`}>🎯</span>
                    <span>Leverage on Morgan</span>
                  </div>
                  <div className={`ai-hint`} onClick={() => sendMessage(`Add a connection using natural language`)}>
                    <span className={`ai-hint-icon`}>➕</span>
                    <span>Add a connection</span>
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`ai-message ${msg.role}`}>
                {msg.reasoning && (
                  <div className="ai-reasoning">
                    <span className="ai-reasoning-label">Thinking</span>
                    <span className="ai-reasoning-text">{msg.reasoning}</span>
                  </div>
                )}
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className={`ai-chat-input`}>
            <input
              ref={inputRef}
              type={`text`}
              placeholder={`Ask about the network or add connections...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isLoading}
            />
            <button
              className={`ai-send-btn`}
              onClick={handleSubmit}
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <svg className={`ai-spinner`} width={`16`} height={`16`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
                  <circle cx={`12`} cy={`12`} r={`10`} strokeOpacity={`0.25`} />
                  <path d={`M12 2a10 10 0 0 1 10 10`} strokeLinecap={`round`} />
                </svg>
              ) : (
                <svg width={`16`} height={`16`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
                  <line x1={`22`} y1={`2`} x2={`11`} y2={`13`} />
                  <polygon points={`22 2 15 22 11 13 2 9 22 2`} />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}