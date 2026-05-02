const API_BASE = '/api';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIStreamChunk {
  content: string;
  reasoning: string;
  done: boolean;
}

// Call the backend proxy and stream the response
export async function* streamAIChat(
  messages: AIMessage[],
  systemPrompt: string
): AsyncGenerator<AIStreamChunk> {
  const response = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      // Handle explicit SSE error events from our proxy
      if (line.startsWith('event: error')) {
        // The next line should be the data payload
        continue;
      }

      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        yield { content: '', reasoning: '', done: true };
        return;
      }

      try {
        const parsed = JSON.parse(data);

        // Detect upstream error payloads that OpenRouter may embed mid-stream
        if (parsed.error) {
          throw new Error(
            typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error.message || 'Upstream AI error'
          );
        }

        const content = parsed.choices?.[0]?.delta?.content ?? '';
        const reasoning = parsed.choices?.[0]?.delta?.reasoning ?? '';
        if (content || reasoning) {
          yield { content, reasoning, done: false };
        }
      } catch (err) {
        // Re-throw real upstream errors; skip JSON parse failures (e.g. partial chunks)
        if (err instanceof SyntaxError) {
          continue; // skip malformed JSON line and keep processing the stream
        }
        throw err;
      }
    }
  }

  // Flush any leftover content in the buffer (last chunk might be partial)
  if (buffer.trim()) {
    const line = buffer.trim();
    if (line.startsWith('data: ') && line.slice(6).trim() !== '[DONE]') {
      try {
        const parsed = JSON.parse(line.slice(6).trim());
        if (parsed.error) {
          throw new Error(
            typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error.message || 'Upstream AI error'
          );
        }
        const content = parsed.choices?.[0]?.delta?.content ?? '';
        const reasoning = parsed.choices?.[0]?.delta?.reasoning ?? '';
        if (content || reasoning) yield { content, reasoning, done: false };
      } catch (err) {
        if (err instanceof SyntaxError) {
          // skip malformed JSON in final flush — stream is done anyway
        } else {
          throw err;
        }
      }
    }
  }

  yield { content: '', reasoning: '', done: true };
}

// Check if the AI backend is configured and reachable
export async function checkAIHealth(): Promise<{ ok: boolean; hasApiKey: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return { ok: true, hasApiKey: data.hasApiKey };
  } catch (err) {
    return { ok: false, hasApiKey: false, error: String(err) };
  }
}