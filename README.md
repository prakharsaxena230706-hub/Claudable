# Claudable

### From Natural Language to Functional Websites, Powered by AI.

Claudable is an AI-assisted code generation platform that transforms natural-language instructions into functional website projects and executes AI-generated code inside isolated, session-specific Docker workspaces.

Users describe what they want to build, and Claudable leverages LLMs to generate the required project files directly within a workspace container. With real-time execution streaming and an interactive browser-based preview, users can experience their generated applications without manually configuring a development environment.

**Generate. Execute. Preview. All in one place.**

---

## Key Features

- **AI-Powered Website Generation:** Transform natural-language prompts into website code using LLM integration.
- **Isolated Docker Workspaces:** Provision dedicated workspace containers for individual user sessions.
- **Real-Time Execution Streaming:** Stream container execution output to the frontend through WebSockets.
- **Live Browser Preview:** View the output of generated websites in an interactive browser environment.
- **Container Lifecycle Management:** Manage Docker images and container provisioning, execution, and teardown.
- **Authentication and Database:** Leverage Supabase for authentication and database functionality.

---

## System Architecture

Claudable connects an AI generation pipeline with a containerized code execution environment.

### Core Workflow

1. **User Input:** The user describes a website or application through a natural-language prompt.
2. **AI Generation:** The backend integrates with OpenRouter (GPT-4o-mini) to generate the required code.
3. **Workspace Execution:** Generated project files are placed directly inside the user's Docker workspace.
4. **Real-Time Streaming:** Execution output is streamed through WebSockets.
5. **Live Preview:** The generated website is rendered inside the browser-based preview environment.

### Architecture Overview

```text
             USER
               |
               v
       React + Vite Frontend
               |
               v
       Node.js + Express
               |
        +------+------+
        |             |
        v             v
     OpenRouter    Supabase
     GPT-4o-mini   Auth / DB
        |
        v
    Generated Files
        |
        v
    Dockerode
        |
        v
   Docker Workspace
        |
        v
   Code Execution
        |
        v
   WebSocket Stream
        |
        v
   Browser Live Preview
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express.js |
| Communication | WebSockets |
| Database & Authentication | Supabase |
| AI Integration | OpenRouter, GPT-4o-mini |
| Containerization | Docker |
| Docker Integration | Dockerode |
| Frontend Deployment | Vercel |
| Backend Deployment | Railway |

---

## Project Structure

```text
Claudable/
│
├── frontend/
│   ├── React application
│   ├── Vite configuration
│   └── Environment configuration
│
├── backend/
│   ├── Express server
│   ├── API routes
│   ├── WebSocket handling
│   ├── Docker integration
│   └── Environment configuration
│
├── workspace/
│   └── Dockerfile
│
└── README.md
```

*Refer to the repository for the complete implementation and directory structure.*

---

## Getting Started

### Prerequisites

- Node.js and npm
- Docker installed and running
- OpenRouter API key
- Supabase project and credentials

### 1. Clone the Repository

```bash
git clone <https://github.com/prakharsaxena230706-hub/Claudable.git>
cd claudable
```

### 2. Configure the Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Add the required credentials to your backend environment file.

### 3. Configure the Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Configure the required frontend environment variables.

### 4. Build the Docker Workspace Image

From the project root:

```bash
docker build -t claudable-workspace:latest ./workspace
```

Make sure the Docker daemon is running before starting workspace execution.

---

## Environment Variables

The project uses separate environment configuration files:

- `backend/.env.example`
- `frontend/.env.example`

Refer to these files for the complete list of required environment variables.

Never commit actual API keys, database credentials, or other secrets to the repository.

---

## Deployment

Claudable's application components are deployed using:

- **Frontend:** Vercel
- **Backend:** Railway
- **Database & Authentication:** Supabase
- **AI Provider:** OpenRouter
- **Execution Environment:** Docker workspace containers

Document the Docker Engine hosting arrangement and how the deployed backend connects to the workspace runtime here.

---

## Project Links

- **GitHub Repository:** https://github.com/prakharsaxena230706-hub/Claudable.git
- **Live Application:** https://claudable-pi.vercel.app/

---

## Future Scope

Potential areas for further development include:

- Multi-framework website generation.
- Improved AI-generated code validation and error recovery.
- Workspace resource monitoring and execution controls.
- Enhanced container security and resource isolation.
- Iterative website modification through conversational prompts.
- Automated testing and preview verification.

