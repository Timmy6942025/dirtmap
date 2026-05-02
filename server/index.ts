import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = process.env.VITE_SITE_URL || 'http://localhost:5173';

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: !!OPENROUTER_API_KEY });
});

// Chat completions — proxy to OpenRouter with streaming
app.post('/api/ai/chat', async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    res.status(500).json({ error: 'OpenRouter API key not configured. Add OPENROUTER_API_KEY to your .env file.' });
    return;
  }

  const { messages, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages is required and must be an array' });
    return;
  }

  // Build the full message list with our system prompt
  const fullMessages = [
    {
      role: 'system',
      content: systemPrompt || 'You are a helpful assistant.',
    },
    ...messages,
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': SITE_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'google/gemini-2.0-flash-001',
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', response.status, errorText);
      res.status(response.status).json({ error: `OpenRouter API error: ${errorText}` });
      return;
    }

    // Pipe the SSE stream directly to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe OpenRouter's streaming response to our HTTP response
    response.body?.pipe(res);

    response.body?.on('error', (err: Error) => {
      console.error('Upstream stream error:', err);
      if (!res.writableEnded) res.end();
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Dirtmap AI server running on http://localhost:${PORT}`);
  console.log(`  OpenRouter API: ${OPENROUTER_API_KEY ? '✓ configured' : '✗ missing — add OPENROUTER_API_KEY to .env'}\n`);
});