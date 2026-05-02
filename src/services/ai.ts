const API_BASE = '/api';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIStreamChunk {
  content: string;
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
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        yield { content: '', done: true };
        return;
      }
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content ?? '';
        if (content) {
          yield { content, done: false };
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  // Flush any leftover content in the buffer (last chunk might be partial)
  if (buffer.trim()) {
    const line = buffer.trim();
    if (line.startsWith('data: ') && line.slice(6).trim() !== '[DONE]') {
      try {
        const parsed = JSON.parse(line.slice(6).trim());
        const content = parsed.choices?.[0]?.delta?.content ?? '';
        if (content) yield { content, done: false };
      } catch {
        // Skip malformed final chunk
      }
    }
  }

  yield { content: '', done: true };
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