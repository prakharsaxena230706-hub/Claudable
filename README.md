# Claudable

A cloud-native SaaS that runs AI-assisted code generation inside Docker containers. Users describe what they want to build in natural language — the AI generates files directly inside an isolated workspace container, with real-time streaming output and a live preview.

## Stack

- **Frontend:** React + Vite, hosted on Vercel
- **Backend:** Node.js + Express + WebSockets, hosted on Railway
- **Database & Auth:** Supabase
- **AI:** OpenRouter (GPT-4o-mini)
- **Containers:** Docker (Dockerode)

## Setup

### Backend
```bash
cd backend
cp .env.example .env   # fill in your keys
npm install
npm run dev
```

### Frontend
```bash
cd frontend
cp .env.example .env.local   # fill in your keys
npm install
npm run dev
```

### Docker workspace image
```bash
docker build -t claudable-workspace:latest ./workspace
```

## Environment Variables

See `backend/.env.example` and `frontend/.env.example`.
