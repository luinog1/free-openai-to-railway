import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================
// INTERFACES Y TIPOS
// ============================================

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  messages: Message[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

interface Provider {
  name: string;
  models: string[];
  enabled: boolean;
  priority: number;
  handler: (messages: Message[], model?: string) => Promise<string>;
}

// ============================================
// UTILIDADES
// ============================================

function log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================
// PROVIDERS (7 COMPLETOS)
// ============================================

// Provider 1: DeepInfra - Más confiable
const deepInfraProvider: Provider = {
  name: 'DeepInfra',
  models: [
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'meta-llama/Meta-Llama-3.1-8B-Instruct',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'mistralai/Mistral-7B-Instruct-v0.3',
  ],
  enabled: true,
  priority: 1,
  handler: async (messages: Message[], model = 'meta-llama/Meta-Llama-3.1-70B-Instruct'): Promise<string> => {
    const response = await fetchWithTimeout(
      'https://api.deepinfra.com/v1/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
  },
};

// Provider 2: Together AI
const togetherProvider: Provider = {
  name: 'Together',
  models: [
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'meta-llama/Llama-2-70b-chat-hf',
    'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',
  ],
  enabled: true,
  priority: 2,
  handler: async (messages: Message[], model = 'mistralai/Mixtral-8x7B-Instruct-v0.1'): Promise<string> => {
    const response = await fetchWithTimeout(
      'https://api.together.xyz/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 4096,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
  },
};

// Provider 3: HuggingFace
const huggingFaceProvider: Provider = {
  name: 'HuggingFace',
  models: [
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'meta-llama/Llama-2-70b-chat-hf',
    'microsoft/phi-2',
  ],
  enabled: true,
  priority: 3,
  handler: async (messages: Message[]): Promise<string> => {
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';

    const response = await fetchWithTimeout(
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
      throw new Error(`HTTP ${response.status}`);
    }

    const data: any = await response.json();
    return data[0]?.generated_text || data.generated_text || 'No response';
  },
};

// Provider 4: Groq - Muy rápido
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
  handler: async (messages: Message[], model = 'llama-3.1-70b-versatile'): Promise<string> => {
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
  },
};

// Provider 5: Phind - Especializado en código
const phindProvider: Provider = {
  name: 'Phind',
  models: ['Phind-70B', 'gpt-4', 'gpt-3.5-turbo'],
  enabled: true,
  priority: 5,
  handler: async (messages: Message[]): Promise<string> => {
    const response = await fetchWithTimeout(
      'https://https.extension.phind.com/agent/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  },
};

// Provider 6: Blackbox AI
const blackboxProvider: Provider = {
  name: 'Blackbox',
  models: ['blackbox', 'gpt-4o', 'claude-3.5-sonnet'],
  enabled: true,
  priority: 6,
  handler: async (messages: Message[]): Promise<string> => {
    const response = await fetchWithTimeout(
      'https://www.blackbox.ai/api/chat',
      {
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
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  },
};

// Provider 7: Cohere (Trial gratuito)
const cohereProvider: Provider = {
  name: 'Cohere',
  models: ['command', 'command-light', 'command-nightly'],
  enabled: true,
  priority: 7,
  handler: async (messages: Message[]): Promise<string> => {
    const prompt = messages.map(m => m.content).join('\n');

    const response = await fetchWithTimeout(
      'https://api.cohere.ai/v1/generate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          max_tokens: 2048,
          temperature: 0.7,
          model: 'command',
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: any = await response.json();
    return data.generations?.[0]?.text || 'No response';
  },
};

// Registro de todos los providers
const providers: Provider[] = [
  deepInfraProvider,
  togetherProvider,
  huggingFaceProvider,
  groqProvider,
  phindProvider,
  blackboxProvider,
  cohereProvider,
];

// ============================================
// LÓGICA DE ROUTING CON FALLBACK
// ============================================

async function tryProviders(messages: Message[], requestedModel?: string): Promise<string> {
  const enabledProviders = providers
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  const errors: string[] = [];

  for (const provider of enabledProviders) {
    try {
      log(`Trying ${provider.name}...`, 'info');
      
      const result = await provider.handler(messages, requestedModel);

      if (result && result.trim().length > 0) {
        log(`Success with ${provider.name}`, 'info');
        return result;
      }
    } catch (error: any) {
      const errorMsg = `${provider.name}: ${error.message}`;
      log(errorMsg, 'error');
      errors.push(errorMsg);
    }
  }

  throw new Error(`All ${errors.length} providers failed:\n${errors.join('\n')}`);
}

// ============================================
// ENDPOINTS DE LA API
// ============================================

// POST /v1/chat/completions - Endpoint principal
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, stream = false }: ChatCompletionRequest = req.body;

    // Validación
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages array is required and cannot be empty',
          type: 'invalid_request_error',
        },
      });
    }

    log(`New chat request: ${messages.length} messages, model: ${model || 'auto'}`);

    // Obtener respuesta
    const content = await tryProviders(messages, model);

    // Respuesta con streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          delta: { role: 'assistant', content },
          finish_reason: null,
        }],
      })}\n\n`);

      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
      })}\n\n`);

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Respuesta estándar
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: Math.ceil(JSON.stringify(messages).length / 4),
          completion_tokens: Math.ceil(content.length / 4),
          total_tokens: Math.ceil((JSON.stringify(messages).length + content.length) / 4),
        },
      });
    }
  } catch (error: any) {
    log(`Error: ${error.message}`, 'error');
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'api_error',
      },
    });
  }
});

// POST /v1/completions - Endpoint legacy
app.post('/v1/completions', async (req, res) => {
  try {
    const { prompt, model } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: { message: 'prompt is required', type: 'invalid_request_error' },
      });
    }

    const messages: Message[] = [{ role: 'user', content: prompt }];
    const content = await tryProviders(messages, model);

    res.json({
      id: `cmpl-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'gpt-3.5-turbo',
      choices: [{
        text: content,
        index: 0,
        logprobs: null,
        finish_reason: 'stop',
      }],
    });
  } catch (error: any) {
    res.status(500).json({
      error: { message: error.message, type: 'api_error' },
    });
  }
});

// GET /v1/models - Listar modelos
app.get('/v1/models', (req, res) => {
  const allModels = providers
    .filter(p => p.enabled)
    .flatMap(p => p.models.map(model => ({
      id: model,
      object: 'model',
      created: 1686935002,
      owned_by: p.name.toLowerCase(),
    })));

  const uniqueModels = Array.from(new Map(allModels.map(m => [m.id, m])).values());

  res.json({
    object: 'list',
    data: uniqueModels,
  });
});

// GET /v1/models/:model - Info de modelo específico
app.get('/v1/models/:model', (req, res) => {
  const { model } = req.params;
  const provider = providers.find(p => p.enabled && p.models.includes(model));

  if (!provider) {
    return res.status(404).json({
      error: { message: `Model ${model} not found`, type: 'invalid_request_error' },
    });
  }

  res.json({
    id: model,
    object: 'model',
    created: 1686935002,
    owned_by: provider.name.toLowerCase(),
  });
});

// GET /health - Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: providers.filter(p => p.enabled).map(p => ({
      name: p.name,
      priority: p.priority,
      models: p.models.length,
    })),
    totalProviders: providers.filter(p => p.enabled).length,
    totalModels: providers.filter(p => p.enabled).reduce((sum, p) => sum + p.models.length, 0),
  });
});

// GET / - Root
app.get('/', (req, res) => {
  res.json({
    name: 'Free AI Proxy',
    version: '1.0.0',
    description: 'OpenAI-compatible API with 7 free providers',
    endpoints: {
      chat: 'POST /v1/chat/completions',
      completions: 'POST /v1/completions',
      models: 'GET /v1/models',
      model: 'GET /v1/models/:model',
      health: 'GET /health',
    },
    providers: providers.filter(p => p.enabled).map(p => p.name),
    github: 'https://github.com/luinog1/free-openai-to-railway',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      type: 'invalid_request_error',
    },
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║       🚀 FREE AI PROXY - VERSIÓN COMPLETA         ║
╚════════════════════════════════════════════════════╝

📡 Servidor: ${HOST}:${PORT}
🔗 API Base: http://${HOST}:${PORT}/v1
🌐 Entorno: ${process.env.NODE_ENV || 'production'}
🚂 Railway: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'No desplegado aún'}

📊 Providers Activos: ${providers.filter(p => p.enabled).length}
${providers.filter(p => p.enabled).map((p, i) => `   ${i + 1}. ${p.name} (${p.models.length} modelos)`).join('\n')}

📝 Total de Modelos: ${providers.filter(p => p.enabled).reduce((sum, p) => sum + p.models.length, 0)}

✅ Servidor listo para recibir peticiones!
  `);
});