# Free AI Proxy 🚀

Production-ready OpenAI-compatible API proxy with 7 free AI providers and automatic failover.

## Features

✅ 7 AI Providers (DeepInfra, HuggingFace, Together, Groq, Phind, Blackbox, Airforce)
✅ 30+ Models Available
✅ Automatic Failover & Load Balancing
✅ OpenAI-Compatible API
✅ Streaming Support
✅ Full Error Handling
✅ Production Ready

## Quick Deploy

Deploy to Railway in just a few seconds:

1. Click the button below and create a new Railway project.
2. When prompted for the repo, select this repository.
3. Railway detects the Node.js project automatically; no build step is needed.
4. Deploy the service – the default `start` script boots the Express server on port 3000.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

## Usage
```bash
curl https://your-app.up.railway.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Endpoints

- `POST /v1/chat/completions` - Chat completions
- `POST /v1/completions` - Legacy completions
- `GET /v1/models` - List models
- `GET /v1/models/:model` - Get model info
- `GET /health` - Health check

## License

MIT