import { useState } from 'react';
import { useNetwork } from '../store/NetworkContext';
import type { LeverageCategory, Severity } from '../types';
import { parseCategories, parseSeverity } from '../utils/parseCategories';

function parseNaturalLanguage(input: string, people: { id: string; name: string }[]): {
  sourceId: string;
  targetId: string;
  categories: LeverageCategory[];
  severity: Severity;
  notes: string;
} | null {
  const lower = input.toLowerCase();

  // Try to find two people mentioned
  let sourceId = '';
  let targetId = '';
  let sourceName = '';
  let targetName = '';

  for (const p of people) {
    const nameLower = p.name.toLowerCase();
    const first = p.name.split(' ')[0].toLowerCase();
    if (lower.includes(nameLower) || lower.includes(first)) {
      if (!sourceId) {
        sourceId = p.id;
        sourceName = p.name;
      } else if (!targetId) {
        targetId = p.id;
        targetName = p.name;
      }
    }
  }

  if (!sourceId || !targetId) return null;

  // Determine "has on" direction - look for "has on" or similar patterns
  const sourceIdx = lower.indexOf(sourceName.toLowerCase());
  const targetIdx = lower.indexOf(targetName.toLowerCase());
  
  // If target appears before source, swap
  if (targetIdx < sourceIdx && targetIdx !== -1) {
    [sourceId, targetId] = [targetId, sourceId];
    [sourceName, targetName] = [targetName, sourceName];
  }

  const categories = parseCategories(input);
  const severity = parseSeverity(input);

  return {
    sourceId,
    targetId,
    categories,
    severity,
    notes: input,
  };
}

export default function AIChat() {
  const { state, dispatch } = useNetwork();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);

  const handleSubmit = () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);

    const result = parseNaturalLanguage(userMsg, state.people);

    if (result) {
      dispatch({
        type: 'ADD_CONNECTION',
        sourceId: result.sourceId,
        targetId: result.targetId,
        categories: result.categories,
        severity: result.severity,
        notes: result.notes,
      });
      const sourcePerson = state.people.find((p) => p.id === result.sourceId);
      const targetPerson = state.people.find((p) => p.id === result.targetId);
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `✓ Connection created: ${sourcePerson?.name} has leverage on ${targetPerson?.name} (${result.categories.join(', ')} — severity ${result.severity}/5)`,
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: "I couldn't identify two people in your description. Try: \"[Name] has [type] on [Name]\" — e.g., \"Alex has embarrassing photos from the party on Morgan\"",
        },
      ]);
    }

    setInput('');
  };

  return (
    <>
      <button
        className={`ai-float-btn ${state.aiChatOpen ? 'active' : ''}`}
        onClick={() => dispatch({ type: 'TOGGLE_AI_CHAT' })}
        title="AI Assistant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>

      {state.aiChatOpen && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <div className="ai-chat-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              AI Connection Builder
            </div>
            <button className="ai-chat-close" onClick={() => dispatch({ type: 'TOGGLE_AI_CHAT' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <div className="ai-chat-placeholder">
                <p>Describe a connection in natural language...</p>
                <p className="ai-example">
                  e.g., "Alex has embarrassing photos from the party last summer on Morgan"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-message ${msg.role}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="ai-chat-input">
            <input
              type="text"
              placeholder="Describe a connection in natural language..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <button className="ai-send-btn" onClick={handleSubmit}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
