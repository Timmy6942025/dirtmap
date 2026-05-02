import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenRouter, HTTPClient } from '@openrouter/sdk';

dotenv.config({ override: true });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '500kb' }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_URL = process.env.VITE_SITE_URL || 'http://localhost:5173';
const AI_MODEL = 'openrouter/owl-alpha';

// Custom HTTP client that injects include_reasoning into chat completion requests
// (the SDK's typed ChatRequest schema does not yet expose this OpenRouter extension)
const httpClient = new HTTPClient({
  fetcher: async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    let bodyText: string | undefined;
    if (init?.body && typeof init.body === 'string') {
      bodyText = init.body;
    } else if (input instanceof Request) {
      try {
        bodyText = await input.text();
      } catch {
        // ignore
      }
    }

    if (url.includes('/chat/completions') && bodyText) {
      try {
        const body = JSON.parse(bodyText);
        body.include_reasoning = true;
        const newBody = JSON.stringify(body);
        if (input instanceof Request) {
          return fetch(new Request(input, { ...init, body: newBody }));
        }
        return fetch(input, { ...init, body: newBody });
      } catch {
        // If body isn't valid JSON, pass through unchanged
      }
    }

    return fetch(input, init);
  },
});

const openRouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY ?? '',
  httpReferer: SITE_URL,
  appTitle: 'Dirtmap',
  httpClient,
});

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

  if (!messages.every((m: unknown) => {
    const msg = m as Record<string, unknown>;
    return typeof msg === 'object' && msg !== null &&
      typeof msg.role === 'string' && typeof msg.content === 'string';
  })) {
    res.status(400).json({ error: 'Each message must have role and content strings' });
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
    const stream = await openRouter.chat.send(
      {
        chatRequest: {
          model: AI_MODEL,
          messages: fullMessages,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096,
        },
      },
      {
        timeoutMs: 60_000,
      }
    );

    // Set up SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of stream) {
      if (chunk.error) {
        console.error('OpenRouter stream error:', chunk.error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`);
        break;
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('OpenRouter error:', err);
    const sc =
      err && typeof err === 'object' && 'statusCode' in err
        ? (err as Record<string, unknown>).statusCode
        : undefined;
    const statusCode =
      typeof sc === 'number' && sc >= 400 && sc < 600 ? sc : 500;
    res
      .status(statusCode)
      .json({ error: err instanceof Error ? err.message : 'Internal server error' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// Validate the API key and model availability on startup
async function validateSetup() {
  if (!OPENROUTER_API_KEY) {
    console.warn('\n  ⚠️  OPENROUTER_API_KEY is missing. AI chat will return errors.');
    console.warn('     Add it to your .env file to enable AI features.\n');
    return;
  }

  try {
    // The SDK's getCurrentKeyMetadata() hits /key which currently returns
    // "User not found" for valid keys — it's a known SDK issue. We validate
    // by making a minimal chat request instead.
    const test = await openRouter.chat.send(
      {
        chatRequest: {
          model: AI_MODEL,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: true,
        },
      },
      { timeoutMs: 10_000 }
    );
    // Drain the tiny test stream
    for await (const chunk of test) { void chunk; }
    console.log(`\n  ✓ OpenRouter key valid — model ${AI_MODEL} reachable`);
    console.log(`  ✓ Server: http://localhost:${PORT}\n`);
  } catch (err) {
    console.warn('\n  ⚠️  Could not reach OpenRouter or the API key is invalid.');
    console.warn(`     Error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

app.listen(PORT, () => {
  void validateSetup();
});
