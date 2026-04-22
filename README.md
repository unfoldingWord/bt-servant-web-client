# BT Servant Web Client

A modern web client for BT Servant, providing a conversational interface to curated Bible translation resources. Built with Next.js 16, React 19, and the assistant-ui framework.

## Features

- **Chat Interface**: Clean, responsive chat UI with markdown rendering
- **Voice Input/Output**: Record voice messages and hear AI responses
- **Real-time Progress**: Live status updates during AI processing via SSE
- **Authentication**: Sign in with Google OAuth or email
- **Dark Mode**: Full dark mode support

## Architecture

```
Browser <---> Next.js BFF <---> bt-servant-worker
             (API routes)       (Cloudflare Worker)
```

The web client follows a "thin gateway" pattern:

- All AI logic lives in the bt-servant-worker (Cloudflare Worker backend)
- Next.js acts as a Backend-for-Frontend (BFF), proxying requests with authentication
- Real-time progress updates via direct Server-Sent Events (SSE) streaming

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS 4, shadcn/ui components
- **Chat**: assistant-ui framework with custom runtime
- **Auth**: NextAuth.js v5 (Google OAuth + Email credentials)
- **Icons**: Font Awesome Pro, Lucide React, Radix Icons
- **State**: Zustand for global state

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (protected)/chat/      # Main chat interface
│   └── api/
│       ├── auth/[...nextauth]/ # NextAuth handlers
│       ├── chat/stream/       # SSE streaming proxy to backend
│       └── preferences/       # User preferences
├── auth.ts                    # NextAuth configuration
├── auth.config.ts             # Auth providers (Google, Email)
├── components/
│   ├── assistant-ui/          # Chat components (Thread, Composer, Messages)
│   ├── providers/             # React context providers
│   ├── ui/                    # shadcn/ui components
│   └── voice/                 # Voice recorder and audio player
├── hooks/
│   ├── use-chat-runtime.ts    # assistant-ui external store runtime
│   ├── use-voice-recorder.ts  # MediaRecorder API wrapper
│   └── use-audio-player.ts    # Audio playback hook
├── lib/
│   └── engine-client.ts       # HTTP client for bt-servant-worker
└── types/
    └── engine.ts              # API type definitions
```

## Getting Started

### Prerequisites

- Node.js 20+
- A running instance of bt-servant-worker (Cloudflare Worker backend)
- Google OAuth credentials (for Google sign-in)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/unfoldingWord/bt-servant-web-client.git
   cd bt-servant-web-client
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment example and configure:

   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local` with your values:

   ```env
   # NextAuth
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

   # Google OAuth
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>

   # Backend (bt-servant-worker)
   ENGINE_BASE_URL=http://localhost:8787  # Local worker, or https://your-worker.workers.dev
   ENGINE_API_KEY=<your-worker-api-key>   # Must match worker's ENGINE_API_KEY
   CLIENT_ID=web

   # Feature flags (client-side; must be prefixed NEXT_PUBLIC_* to be inlined at build time)
   NEXT_PUBLIC_ENABLE_ORG_SWITCHER=false  # Set to "true" to show the org switcher in the user menu. Defaults to off.
   ```

5. Run the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start development server           |
| `npm run build`     | Build for production               |
| `npm run start`     | Start production server            |
| `npm run lint`      | Run ESLint (zero warnings allowed) |
| `npm run lint:fix`  | Run ESLint with auto-fix           |
| `npm run format`    | Format code with Prettier          |
| `npm run typecheck` | Run TypeScript type checking       |

## Authentication

The app supports two authentication methods:

1. **Google OAuth**: Sign in with your Google account
2. **Email**: Enter your email address to sign in (uses email as user ID)

User IDs are passed to the bt-servant-engine for personalized responses and conversation history.

## API Routes

### POST /api/chat/stream

Streams chat responses via Server-Sent Events (SSE).

**Request:**

```json
{
  "message": "Help me translate John 3:16",
  "message_type": "text",
  "audio_base64": null,
  "audio_format": null
}
```

**SSE Events:**

- `status`: Human-readable status updates (e.g. "Thinking...", "Generating audio...")
- `progress`: Incremental text chunks for real-time streaming
- `complete`: Final response with text and optional audio
- `error`: Error message if something went wrong
- `keepalive`: Connection keep-alive (no visible effect)
- `tool_use` / `tool_result`: Tool invocation events (logged, not displayed)

### GET/PUT /api/preferences

Manage user preferences (response language, agentic strength, etc.)

## Voice Features

- **Recording**: Uses MediaRecorder API with WebM/Opus codec
- **Playback**: HTML5 Audio with seek support
- **Format**: Audio is base64-encoded for transmission

## Development

### Pre-commit Hooks

The project uses Husky and lint-staged for pre-commit checks:

- ESLint with auto-fix
- Prettier formatting
- TypeScript type checking
- Production build verification

### Code Style

- TypeScript strict mode
- ESLint with Next.js config
- Prettier with Tailwind CSS plugin
- Zero ESLint warnings policy

## Deployment

The app is deployed to **Cloudflare Workers** via OpenNext.

- **Production**: https://bt-servant-web-client.unfoldingword.workers.dev
- **CI/CD**: GitHub Actions deploys to staging after CI passes on `main`; production is manual (`workflow_dispatch`)

Secrets are managed via GitHub Secrets and injected at deploy time.

## Related Projects

- [bt-servant-engine](https://github.com/unfoldingWord/bt-servant-engine) - AI backend
- [bt-servant-whatsapp-gateway](https://github.com/unfoldingWord/bt-servant-whatsapp-gateway) - WhatsApp integration
