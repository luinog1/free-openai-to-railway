import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// TYPES
// ============================================

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
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

interface Provider {
  name: string;
  models: string[];
  enabled: boolean;
  priority: number;
  handler: (messages: Message[], model?: string) => Promise<string>;
}

// ============================================
// PROVIDER IMPLEMENTATIONS
// ============================================

// Provider 1: DeepInfra (Most reliable, free tier)
const deepInfraProvider: Provider = {
  name: 'DeepInfra',
  models: [
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'meta-llama/Meta-Llama-3.1-8B-Instruct',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'mistralai/Mistral-7B-Instruct-v0.3'
  ],
  enabled: true,
  priority: 1,
  handler: async (messages: Message[], model = 'meta-llama/Meta-Llama-3.1-70B-Instruct') => {
    const response = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepInfra error: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  },
};

// Provider 2: HuggingFace Inference API
const huggingFaceProvider: Provider = {
  name: 'HuggingFace',
  models: [
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'meta-llama/Llama-2-70b-chat-hf',
    'microsoft/phi-2',
  ],
  enabled: true,
  priority: 2,
  handler: async (messages: Message[]) => {
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    const response = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 2048,
            temperature: 0.7,
            top_p: 0.95,
            return_full_text: false,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HuggingFace error: ${response.status}`);
    }

    const data: any = await response.json();
    return data[0]?.generated_text || data.generated_text || 'No response';
  },
};

// Provider 3: Together AI (Free tier)
const togetherProvider: Provider = {
  name: 'Together',
  models: [
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'meta-llama/Llama-2-70b-chat-hf',
    'togethercomputer/RedPajama-INCITE-7B-Chat',
  ],
  enabled: true,
  priority: 3,
  handler: async (messages: Message[], model = 'mistralai/Mixtral-8x7B-Instruct-v0.1') => {
    const response = await fetch('https://api.together.xyz/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Together error: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || data.output?.choices?.[0]?.text || 'No response';
  },
};

// Provider 4: Groq (Very fast, generous free tier)
const groqProvider: Provider = {
  name: 'Groq',
  models: [
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma-7b-it',
  ],
  enabled: true,
  priority: 4,
  handler: async (messages: Message[], model = 'llama-3.1-70b-versatile') => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq error: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  },
};

// Provider 5: Phind (Code-focused, no auth)
const phindProvider: Provider = {
  name: 'Phind',
  models: ['Phind-70B', 'gpt-4', 'gpt-3.5-turbo'],
  enabled: true,
  priority: 5,
  handler: async (messages: Message[]) => {
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
      throw new Error(`Phind error: ${response.status}`);
    }

    return await response.text();
  },
};

// Provider 6: Blackbox AI (Code-specialized)
const blackboxProvider: Provider = {
  name: 'Blackbox',
  models: ['blackbox', 'gpt-4o', 'claude-3.5-sonnet'],
  enabled: true,
  priority: 6,
  handler: async (messages: Message[]) => {
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
      throw new Error(`Blackbox error: ${response.status}`);
    }

    return await response.text();
  },
};

// Provider 7: Airforce API (Multiple models aggregator)
const airforceProvider: Provider = {
  name: 'Airforce',
  models: ['gpt-4', 'gpt-3.5-turbo', 'llama-3-70b', 'claude-3-opus'],
  enabled: true,
  priority: 7,
  handler: async (messages: Message[], model = 'gpt-3.5-turbo') => {
    const response = await fetch('https://api.airforce/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Airforce error: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  },
};

// All providers registry
const providers: Provider[] = [
  deepInfraProvider,
  huggingFaceProvider,
  togetherProvider,
  groqProvider,
  phindProvider,
  blackboxProvider,
  airforceProvider,
];

// ============================================
// ROUTER LOGIC WITH SMART FALLBACK
// ============================================

async function tryProviders(messages: Message[], model?: string): Promise<string> {
  const enabledProviders = providers
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  const errors: string[] = [];
  let lastError: Error | null = null;

  for (const provider of enabledProviders) {
    try {
      console.log(`[${new Date().toISOString()}] Attempting: ${provider.name}`);
      
      const result = await Promise.race([
        provider.handler(messages, model),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
        ),
      ]);

      if (result && result.length > 0) {
        console.log(`[${new Date().toISOString()}] ✅ Success with ${provider.name}`);
        return result;
      }
    } catch (error: any) {
      lastError = error;
      const errorMsg = `${provider.name}: ${error.message}`;
      console.error(`[${new Date().toISOString()}] ❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  throw new Error(`All ${errors.length} providers failed:\n${errors.join('\n')}`);
}

// ============================================
// API ENDPOINTS (OpenAI Compatible)
// ============================================

// POST /v1/chat/completions - Main chat endpoint
app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const { messages, model, stream = false, temperature, max_tokens }: ChatRequest = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Invalid request: messages array is required and must not be empty',
          type: 'invalid_request_error',
          code: 'missing_required_parameter',
        },
      });
    }

    // Validate messages format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({
          error: {
            message: 'Invalid message format: role and content are required',
            type: 'invalid_request_error',
          },
        });
      }
    }

    console.log(`[${new Date().toISOString()}] New request: ${messages.length} messages, model: ${model || 'auto'}`);

    // Get response from providers
    const content = await tryProviders(messages, model);

    // Streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial chunk
      res.write(
        `data: ${JSON.stringify({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model || 'gpt-3.5-turbo',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );

      // Send final chunk
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
      // Standard response
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
          prompt_tokens: JSON.stringify(messages).length / 4,
          completion_tokens: content.length / 4,
          total_tokens: (JSON.stringify(messages).length + content.length) / 4,
        },
      });
    }
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error',
        code: 'provider_error',
      },
    });
  }
});

// GET /v1/models - List available models
app.get('/v1/models', (req: Request, res: Response) => {
  const allModels = providers
    .filter(p => p.enabled)
    .flatMap(p =>
      p.models.map(model => ({
        id: model,
        object: 'model',
        created: 1686935002,
        owned_by: p.name.toLowerCase(),
        permission: [],
        root: model,
        parent: null,
      }))
    );

  // Remove duplicates
  const uniqueModels = Array.from(
    new Map(allModels.map(m => [m.id, m])).values()
  );

  res.json({
    object: 'list',
    data: uniqueModels,
  });
});

// GET /v1/models/:model - Get specific model info
app.get('/v1/models/:model', (req: Request, res: Response) => {
  const { model } = req.params;

  const provider = providers.find(p => p.enabled && p.models.includes(model));

  if (!provider) {
    return res.status(404).json({
      error: {
        message: `Model '${model}' not found`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
  }

  res.json({
    id: model,
    object: 'model',
    created: 1686935002,
    owned_by: provider.name.toLowerCase(),
    permission: [],
    root: model,
    parent: null,
  });
});

// POST /v1/completions - Legacy completions endpoint
app.post('/v1/completions', async (req: Request, res: Response) => {
  try {
    const { prompt, model, max_tokens, temperature } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: {
          message: 'prompt is required',
          type: 'invalid_request_error',
        },
      });
    }

    // Convert to chat format
    const messages: Message[] = [{ role: 'user', content: prompt }];
    const content = await tryProviders(messages, model);

    res.json({
      id: `cmpl-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'gpt-3.5-turbo',
      choices: [
        {
          text: content,
          index: 0,
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: prompt.length / 4,
        completion_tokens: content.length / 4,
        total_tokens: (prompt.length + content.length) / 4,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: {
        message: error.message,
        type: 'api_error',
      },
    });
  }
});

// GET /health - Health check
app.get('/health', (req: Request, res: Response) => {
  const providerStatus = providers.map(p => ({
    name: p.name,
    enabled: p.enabled,
    priority: p.priority,
    models: p.models.length,
  }));

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: providerStatus,
    totalProviders: providers.filter(p => p.enabled).length,
    totalModels: providers
      .filter(p => p.enabled)
      .reduce((acc, p) => acc + p.models.length, 0),
  });
});

// GET / - Root endpoint with API info
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Free AI Proxy',
    version: '1.0.0',
    description: 'OpenAI-compatible API proxy for free AI providers',
    endpoints: {
      chat: 'POST /v1/chat/completions',
      completions: 'POST /v1/completions',
      models: 'GET /v1/models',
      model: 'GET /v1/models/:model',
      health: 'GET /health',
    },
    providers: providers
      .filter(p => p.enabled)
      .map(p => ({
        name: p.name,
        models: p.models,
        priority: p.priority,
      })),
    documentation: 'https://platform.openai.com/docs/api-reference',
    github: 'https://github.com/luinog1/free-openai-to-railway',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      type: 'invalid_request_error',
      code: 'route_not_found',
    },
  });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'api_error',
    },
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║        🚀 Free AI Proxy Server Running            ║
╚════════════════════════════════════════════════════╝

📡 Host: ${HOST}:${PORT}
🔗 API Base: http://${HOST}:${PORT}/v1
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🚂 Railway Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'Not deployed'}

📊 Active Providers: ${providers.filter(p => p.enabled).length}
${providers
  .filter(p => p.enabled)
  .map(p => `   ${p.priority}. ${p.name} (${p.models.length} models)`)
  .join('\n')}

📝 Total Models Available: ${providers.filter(p => p.enabled).reduce((acc, p) => acc + p.models.length, 0)}

✅ Server ready to accept requests!
  `);
});