import { useState, useCallback, useRef, useEffect } from 'react';
import { streamAIChat, type AIMessage } from '../services/ai';
import { useNetwork } from '../store/NetworkContext';
import type { LeverageCategory } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export function useAIChat() {
  const { state, dispatch } = useNetwork();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep a ref to current messages so the callback always has the latest
  // without needing messages in the dependency array (avoids stale closure)
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Build a rich system prompt with current people and connections
  const buildSystemPrompt = useCallback(() => {
    const people = state.people;
    const categories = ['Crush', 'Past Experience', 'Photo', 'Quote', 'Secret', 'Financial', 'Relationship', 'Career', 'Reputation'];

    const peopleList = people
      .map((p) => `  - ${p.name} (id: ${p.id}) — ${p.hasOnOthers.length} leverage entries`)
      .join('\n');

    const connections = people
      .flatMap((p) =>
        p.hasOnOthers.map((e) => ({
          source: p.name,
          target: people.find((t) => t.id === e.targetId)?.name ?? e.targetId,
          severity: e.severity,
          categories: e.categories,
          notes: e.notes,
        }))
      )
      .map(
        (c) =>
          `  - ${c.source} → ${c.target} [Sev ${c.severity}]: ${c.categories.join(', ')} — ${c.notes}`
      )
      .join('\n');

    return `You are an AI assistant for a leverage/connection mapping tool called Dirtmap.

CURRENT PEOPLE IN THE SYSTEM:
${peopleList || '  (no people yet)'}

EXISTING CONNECTIONS:
${connections || '  (no connections yet)'}

AVAILABLE LEVERAGE CATEGORIES: ${categories.join(', ')}

HOW TO INTERPRET USER REQUESTS:
- When a user describes a person having leverage over another, that person is the SOURCE (they have the dirt).
- The target is whoever the leverage is directed at.
- Extract severity (1-5, default 3 if not mentioned) and categories from the description.

WHAT YOU SHOULD DO:
1. Parse natural language descriptions to extract leverage connections
2. When you understand a connection request, respond clearly confirming what you understood
3. Suggest adding connections if the user implies relationships
4. Answer questions about the network in context

IMPORTANT: Respond in a concise, helpful way. Format any connection you want to add as JSON on a single line: ACTION:ADD_CONNECTION:{json}

Example action: ACTION:ADD_CONNECTION:{"sourceName":"Alex","targetName":"Morgan","categories":["Photo","Secret"],"severity":4,"notes":"From the office party"}`;
  }, [state.people]);

  const sendMessage = useCallback(
    async (input: string) => {
      if (!input.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: input.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setError(null);

      // Build message history — always reads fresh from ref to avoid stale closures
      const historyMessages: AIMessage[] = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.text,
      }));
      historyMessages.push({ role: 'user', content: input.trim() });

      // Abort any in-progress request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      // Add a placeholder assistant message for streaming
      const assistantMsgId = crypto.randomUUID();
      let assistantText = '';

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          text: '',
          timestamp: new Date(),
        },
      ]);

      try {
        const stream = streamAIChat(historyMessages, buildSystemPrompt());

        for await (const chunk of stream) {
          if (chunk.done) break;

          assistantText += chunk.content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, text: assistantText } : m
            )
          );
        }

        // Check if the AI said to add a connection — look for ACTION: lines in the response
        const actionMatch = assistantText.match(/ACTION:ADD_CONNECTION:({.*})/);
        if (actionMatch) {
          try {
            const action = JSON.parse(actionMatch[1]);

            // Find source and target person IDs by name
            const sourcePerson = state.people.find(
              (p) => p.name.toLowerCase() === action.sourceName?.toLowerCase()
            );
            const targetPerson = state.people.find(
              (p) => p.name.toLowerCase() === action.targetName?.toLowerCase()
            );

            if (sourcePerson && targetPerson) {
              dispatch({
                type: 'ADD_CONNECTION',
                sourceId: sourcePerson.id,
                targetId: targetPerson.id,
                categories: (action.categories ?? ['Secret']) as LeverageCategory[],
                severity: action.severity ?? 3,
                notes: action.notes ?? input,
              });

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: `✓ Added: ${sourcePerson.name} → ${targetPerson.name} [Sev ${action.severity ?? 3}]: ${(action.categories ?? ['Secret']).join(', ')}\n\n${assistantText.replace(/ACTION:ADD_CONNECTION:.*/, '').trim()}`,
                      }
                    : m
                )
              );
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: `${assistantText}\n\n⚠️ Couldn't find the people in the system. ${!sourcePerson ? `I couldn't find "${action.sourceName}".` : ''} ${!targetPerson ? `I couldn't find "${action.targetName}".` : ''}`,
                      }
                    : m
                )
              );
            }
          } catch {
            // JSON parse failed — just show the response as-is
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const errorMsg = err instanceof Error ? err.message : 'Something went wrong. Make sure the AI backend is running.';
        setError(errorMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `❌ ${errorMsg}` }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, buildSystemPrompt, dispatch, state.people]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    abort,
  };
}