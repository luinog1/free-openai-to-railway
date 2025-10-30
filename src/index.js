import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// PROVIDERS (7 COMPLETOS)
// ============================================

const providers = [
  {
    name: 'DeepInfra',
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    enabled: true,
    priority: 1,
    handler: async (messages, model = 'meta-llama/Meta-Llama-3.1-70B-Instruct') => {
      const response = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'No response';
    },
  },
  {
    name: 'Together',
    models: ['mistralai/Mixtral-8x7B-Instruct-v0.1', 'meta-llama/Llama-2-70b-chat-hf'],
    enabled: true,
    priority: 2,
    handler: async (messages, model = 'mistralai/Mixtral-8x7B-Instruct-v0.1') => {
      const response = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 4096 }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'No response';
    },
  },
  {
    name: 'HuggingFace',
    models: ['mistralai/Mixtral-8x7B-Instruct-v0.1', 'meta-llama/Llama-2-70b-chat-hf'],
    enabled: true,
    priority: 3,
    handler: async (messages) => {
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
      const response = await fetch('https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 2048 } }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data[0]?.generated_text || data.generated_text || 'No response';
    },
  },
  {
    name: 'Groq',
    models: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma-7b-it'],
    enabled: true,
    priority: 4,
    handler: async (messages, model = 'llama-3.1-70b-versatile') => {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'No response';
    },
  },
  {
    name: 'Phind',
    models: ['Phind-70B', 'gpt-4'],
    enabled: true,
    priority: 5,
    handler: async (messages) => {
      const response = await fetch('https://https.extension.phind.com/agent/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://phind.com',
        },
        body: JSON.stringify({
          message_history: messages,
          requested_model: 'Phind-70B',
          user_input: messages[messages.length - 1].content,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    },
  },
  {
    name: 'Blackbox',
    models: ['blackbox', 'gpt-4o'],
    enabled: true,
    priority: 6,
    handler: async (messages) => {
      const response = await fetch('https://www.blackbox.ai/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, codeModelMode: true }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    },
  },
  {
    name: 'Cohere',
    models: ['command', 'command-light'],
    enabled: true,
    priority: 7,
    handler: async (messages) => {
      const prompt = messages.map(m => m.content).join('\n');
      const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, max_tokens: 2048, model: 'command' }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.generations?.[0]?.text || 'No response';
    },
  },
];

// ============================================
// ROUTING COM FALLBACK
// ============================================

async function tryProviders(messages, model) {
  const enabled = providers.filter(p => p.enabled).sort((a, b) => a.priority - b.priority);
  const errors = [];

  for (const provider of enabled) {
    try {
      console.log(`[${new Date().toISOString()}] Tentando ${provider.name}...`);
      
      const result = await Promise.race([
        provider.handler(messages, model),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
      ]);

      if (result && result.trim().length > 0) {
        console.log(`[${new Date().toISOString()}] ✅ Sucesso com ${provider.name}`);
        return result;
      }
    } catch (error) {
      const msg = `${provider.name}: ${error.message}`;
      console.error(`[${new Date().toISOString()}] ❌ ${msg}`);
      errors.push(msg);
    }
  }

  throw new Error(`Todos os ${errors.length} providers falharam:\n${errors.join('\n')}`);
}

// ============================================
// ENDPOINTS DA API
// ============================================

// POST /v1/chat/completions
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, stream = false } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: { message: 'messages array required', type: 'invalid_request_error' }
      });
    }

    console.log(`[${new Date().toISOString()}] Nova requisição: ${messages.length} mensagens`);

    const content = await tryProviders(messages, model);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }]
      })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: Math.ceil(JSON.stringify(messages).length / 4),
          completion_tokens: Math.ceil(content.length / 4),
          total_tokens: Math.ceil((JSON.stringify(messages).length + content.length) / 4)
        }
      });
    }
  } catch (error) {
    console.error(`Erro: ${error.message}`);
    res.status(500).json({
      error: { message: error.message, type: 'api_error' }
    });
  }
});

// POST /v1/completions
app.post('/v1/completions', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: { message: 'prompt required' } });
    }

    const messages = [{ role: 'user', content: prompt }];
    const content = await tryProviders(messages, model);

    res.json({
      id: `cmpl-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'gpt-3.5-turbo',
      choices: [{ text: content, index: 0, finish_reason: 'stop' }]
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

// GET /v1/models
app.get('/v1/models', (req, res) => {
  const allModels = providers
    .filter(p => p.enabled)
    .flatMap(p => p.models.map(m => ({
      id: m,
      object: 'model',
      created: 1686935002,
      owned_by: p.name.toLowerCase()
    })));

  const unique = Array.from(new Map(allModels.map(m => [m.id, m])).values());
  res.json({ object: 'list', data: unique });
});

// GET /v1/models/:model
app.get('/v1/models/:model', (req, res) => {
  const { model } = req.params;
  const provider = providers.find(p => p.enabled && p.models.includes(model));

  if (!provider) {
    return res.status(404).json({
      error: { message: `Model ${model} not found`, type: 'invalid_request_error' }
    });
  }

  res.json({
    id: model,
    object: 'model',
    created: 1686935002,
    owned_by: provider.name.toLowerCase()
  });
});

// GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: providers.filter(p => p.enabled).map(p => ({
      name: p.name,
      priority: p.priority,
      models: p.models.length
    })),
    totalProviders: providers.filter(p => p.enabled).length,
    totalModels: providers.filter(p => p.enabled).reduce((sum, p) => sum + p.models.length, 0)
  });
});

// GET /
app.get('/', (req, res) => {
  res.json({
    name: 'Free AI Proxy',
    version: '1.0.0',
    description: 'OpenAI-compatible API com 7 providers gratuitos',
    endpoints: {
      chat: 'POST /v1/chat/completions',
      completions: 'POST /v1/completions',
      models: 'GET /v1/models',
      model: 'GET /v1/models/:model',
      health: 'GET /health'
    },
    providers: providers.filter(p => p.enabled).map(p => p.name),
    github: 'https://github.com/luinog1/free-openai-to-railway'
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.path} not found` }
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = parseInt(process.env.PORT || '3000');
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║      🚀 FREE AI PROXY - VERSÃO COMPLETA       ║
╚════════════════════════════════════════════════╝

📡 Servidor: ${HOST}:${PORT}
🔗 API Base: http://${HOST}:${PORT}/v1
🌐 Railway: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'Não deployado'}

📊 Providers: ${providers.filter(p => p.enabled).length}
${providers.filter(p => p.enabled).map((p, i) => `   ${i + 1}. ${p.name} (${p.models.length} modelos)`).join('\n')}

📝 Total: ${providers.filter(p => p.enabled).reduce((s, p) => s + p.models.length, 0)} modelos

✅ Servidor pronto!
  `);
});