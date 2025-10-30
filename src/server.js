import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check simples
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Providers configuration
const providers = [
  {
    name: 'DeepInfra',
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    enabled: true,
    priority: 1,
    async handler(messages, model = 'meta-llama/Meta-Llama-3.1-70B-Instruct') {
      const res = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      });
      if (!res.ok) throw new Error(`DeepInfra: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response';
    }
  },
  {
    name: 'Together',
    models: ['mistralai/Mixtral-8x7B-Instruct-v0.1', 'meta-llama/Llama-2-70b-chat-hf'],
    enabled: true,
    priority: 2,
    async handler(messages, model = 'mistralai/Mixtral-8x7B-Instruct-v0.1') {
      const res = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 4096 }),
      });
      if (!res.ok) throw new Error(`Together: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response';
    }
  },
  {
    name: 'HuggingFace',
    models: ['mistralai/Mixtral-8x7B-Instruct-v0.1'],
    enabled: true,
    priority: 3,
    async handler(messages) {
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
      const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 2048 } }),
      });
      if (!res.ok) throw new Error(`HuggingFace: ${res.status}`);
      const data = await res.json();
      return data[0]?.generated_text || data.generated_text || 'No response';
    }
  },
  {
    name: 'Groq',
    models: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    enabled: true,
    priority: 4,
    async handler(messages, model = 'llama-3.1-70b-versatile') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 4096 }),
      });
      if (!res.ok) throw new Error(`Groq: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response';
    }
  },
  {
    name: 'Phind',
    models: ['Phind-70B'],
    enabled: true,
    priority: 5,
    async handler(messages) {
      const res = await fetch('https://https.extension.phind.com/agent/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://phind.com' },
        body: JSON.stringify({
          message_history: messages,
          requested_model: 'Phind-70B',
          user_input: messages[messages.length - 1].content,
        }),
      });
      if (!res.ok) throw new Error(`Phind: ${res.status}`);
      return await res.text();
    }
  },
  {
    name: 'Blackbox',
    models: ['blackbox'],
    enabled: true,
    priority: 6,
    async handler(messages) {
      const res = await fetch('https://www.blackbox.ai/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, codeModelMode: true }),
      });
      if (!res.ok) throw new Error(`Blackbox: ${res.status}`);
      return await res.text();
    }
  },
  {
    name: 'Cohere',
    models: ['command'],
    enabled: true,
    priority: 7,
    async handler(messages) {
      const prompt = messages.map(m => m.content).join('\n');
      const res = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, max_tokens: 2048, model: 'command' }),
      });
      if (!res.ok) throw new Error(`Cohere: ${res.status}`);
      const data = await res.json();
      return data.generations?.[0]?.text || 'No response';
    }
  },
];

// Try providers with fallback
async function tryProviders(messages, model) {
  const enabled = providers.filter(p => p.enabled).sort((a, b) => a.priority - b.priority);
  
  for (const provider of enabled) {
    try {
      console.log(`Trying ${provider.name}...`);
      const result = await Promise.race([
        provider.handler(messages, model),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 25000))
      ]);
      
      if (result && result.trim().length > 0) {
        console.log(`✅ Success: ${provider.name}`);
        return result;
      }
    } catch (err) {
      console.error(`❌ ${provider.name}: ${err.message}`);
    }
  }
  
  throw new Error('All providers failed');
}

// API Routes
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, stream } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: 'messages required' } });
    }
    
    const content = await tryProviders(messages, model);
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({
        id: 'chatcmpl-' + Date.now(),
        choices: [{ index: 0, delta: { content }, finish_reason: null }]
      })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: 'chatcmpl-' + Date.now(),
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-3.5-turbo',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      });
    }
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/v1/completions', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: { message: 'prompt required' } });
    
    const content = await tryProviders([{ role: 'user', content: prompt }], model);
    res.json({
      id: 'cmpl-' + Date.now(),
      object: 'text_completion',
      choices: [{ text: content, index: 0, finish_reason: 'stop' }]
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/v1/models', (req, res) => {
  const models = providers
    .filter(p => p.enabled)
    .flatMap(p => p.models.map(m => ({ id: m, object: 'model', owned_by: p.name.toLowerCase() })));
  
  res.json({ object: 'list', data: Array.from(new Map(models.map(m => [m.id, m])).values()) });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    providers: providers.filter(p => p.enabled).length,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Free AI Proxy',
    version: '1.0.0',
    providers: providers.filter(p => p.enabled).map(p => p.name),
    endpoints: {
      chat: 'POST /v1/chat/completions',
      completions: 'POST /v1/completions',
      models: 'GET /v1/models',
      health: 'GET /health'
    }
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 Free AI Proxy Running           ║
╚═══════════════════════════════════════╝
Port: ${PORT}
Providers: ${providers.filter(p => p.enabled).length}
URL: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'http://localhost:' + PORT}
  `);
});