import express, { Request, Response } from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Types
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: Message[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface Provider {
  name: string;
  models: string[];
  enabled: boolean;
  handler: (messages: Message[], model?: string) => Promise<string>;
}

// ============================================
// PROVIDERS
// ============================================

// Provider 1: Phind (Most reliable, no auth)
const phindProvider: Provider = {
  name: 'Phind',
  models: ['gpt-4', 'gpt-3.5-turbo', 'Phind-70B'],
  enabled: true,
  handler: async (messages: Message[]) => {
    try {
      const response = await fetch('https://https.extension.phind.com/agent/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Origin': 'https://phind.com',
        },
        body: JSON.stringify({
          additional_extension_context: '',
          allow_magic_buttons: true,
          is_vscode_extension: true,
          message_history: messages,
          requested_model: 'Phind-70B',
          user_input: messages[messages.length - 1].content,
        }),
      });

      if (!response.ok) {
        throw new Error(`Phind API error: ${response.status}`);
      }

      const text = await response.text();
      return text || 'No response from Phind';
    } catch (error: any) {
      throw new Error(`Phind failed: ${error.message}`);
    }
  },
};

// Provider 2: DeepInfra (Fast, free tier)
const deepInfraProvider: Provider = {
  name: 'DeepInfra',
  models: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  enabled: true,
  handler: async (messages: Message[], model = 'meta-llama/Meta-Llama-3.1-70B-Instruct') => {
    try {
      const response = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepInfra API error: ${response.status}`);
      }

      const data: any = await response.json();
      return data.choices[0].message.content;
    } catch (error: any) {
      throw new Error(`DeepInfra failed: ${error.message}`);
    }
  },
};

// Provider 3: DDG (DuckDuckGo AI Chat - no auth needed)
const ddgProvider: Provider = {
  name: 'DuckDuckGo',
  models: ['gpt-3.5-turbo', 'claude-3-haiku'],
  enabled: true,
  handler: async (messages: Message[]) => {
    try {
      // First get VQD token
      const statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
        headers: {
          'x-vqd-accept': '1',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const vqd = statusRes.headers.get('x-vqd-4');
      if (!vqd) throw new Error('Failed to get VQD token');

      // Send chat request
      const response = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vqd-4': vqd,
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo-0125',
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`DDG API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let result = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.message) {
                  result += parsed.message;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      return result || 'No response from DuckDuckGo';
    } catch (error: any) {
      throw new Error(`DDG failed: ${error.message}`);
    }
  },
};

// Provider 4: Blackbox AI (no auth needed)
const blackboxProvider: Provider = {
  name: 'Blackbox',
  models: ['blackbox', 'gpt-4o'],
  enabled: true,
  handler: async (messages: Message[]) => {
    try {
      const response = await fetch('https://www.blackbox.ai/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          messages,
          previewToken: null,
          userId: null,
          codeModelMode: true,
          agentMode: {},
          trendingAgentMode: {},
          isMicMode: false,
          isChromeExt: false,
          githubToken: null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Blackbox API error: ${response.status}`);
      }

      const text = await response.text();
      return text;
    } catch (error: any) {
      throw new Error(`Blackbox failed: ${error.message}`);
    }
  },
};

// All providers list
const providers: Provider[] = [
  phindProvider,
  deepInfraProvider,
  ddgProvider,
  blackboxProvider,
];

// ============================================
// ROUTER LOGIC
// ============================================

async function tryProviders(messages: Message[], model?: string): Promise<string> {
  const enabledProviders = providers.filter(p => p.enabled);

  // Shuffle providers for load balancing
  const shuffled = [...enabledProviders].sort(() => Math.random() - 0.5);

  const errors: string[] = [];

  for (const provider of shuffled) {
    try {
      console.log(`[${new Date().toISOString()}] Trying: ${provider.name}`);
      const result = await Promise.race([
        provider.handler(messages, model),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 30000)
        ),
      ]);

      console.log(`[${new Date().toISOString()}] ✓ Success: ${provider.name}`);
      return result;
    } catch (error: any) {
      const errorMsg = `${provider.name}: ${error.message}`;
      console.error(`[${new Date().toISOString()}] ✗ ${errorMsg}`);
      errors.push(errorMsg);
      continue;
    }
  }

  throw new Error(`All providers failed:\n${errors.join('\n')}`);
}

// ============================================
// API ROUTES
// ============================================

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const { messages, model, stream = false }: ChatRequest = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Invalid request: messages array is required',
          type: 'invalid_request_error',
        },
      });
    }

    // Get response from providers
    const content = await tryProviders(messages, model);

    // Return OpenAI-compatible response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(
        `data: ${JSON.stringify({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model || 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              delta: { content },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );

      res.write(
        `data: ${JSON.stringify({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model || 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        })}\n\n`
      );

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    }
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error',
      },
    });
  }
});

// List models endpoint
app.get('/v1/models', (req: Request, res: Response) => {
  const models = providers
    .filter(p => p.enabled)
    .flatMap(p => p.models.map(model => ({
      id: model,
      object: 'model',
      created: Date.now(),
      owned_by: p.name.toLowerCase(),
    })));

  res.json({
    object: 'list',
    data: models,
  });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: providers.map(p => ({
      name: p.name,
      enabled: p.enabled,
      models: p.models.length,
    })),
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Free AI Proxy - OpenAI Compatible API',
    endpoints: {
      chat: 'POST /v1/chat/completions',
      models: 'GET /v1/models',
      health: 'GET /health',
    },
    providers: providers.filter(p => p.enabled).map(p => p.name),
    documentation: 'https://platform.openai.com/docs/api-reference',
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🚀 Free AI Proxy Server Running        ║
╚═══════════════════════════════════════════╝

📡 Server: http://0.0.0.0:${PORT}
🔗 API Base: http://0.0.0.0:${PORT}/v1

Enabled Providers:
${providers.filter(p => p.enabled).map(p => `  ✓ ${p.name}`).join('\n')}

Environment: ${process.env.NODE_ENV || 'development'}
Railway Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'Not set'}
  `);
});