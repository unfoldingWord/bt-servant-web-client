# BT Servant Web Client

A modern web client for BT Servant, providing a conversational interface to curated Bible translation resources. Built with Next.js 16, React 19, and the assistant-ui framework.

## Features

- **Chat Interface**: Clean, responsive chat UI with markdown rendering (GFM support)
- **Streaming Responses**: Token-by-token text streaming with a smooth typing animation
- **Voice Input/Output**: Record voice messages and hear AI responses, with a transcript toggle for audio replies
- **PDF Attachments**: Downloadable attachment chips for PDFs produced by backend tools
- **Inline Video**: Video URLs in responses render as inline `<video>` players (deduplicated when the same URL appears more than once)
- **Chat History**: Previous conversation turns are loaded on page load, including archived audio and attachments
- **Real-time Progress**: Live status updates during AI processing via SSE
- **Authentication**: Sign in with Google OAuth
- **Per-user Org Routing**: Each user's organization is resolved server-side from Cloudflare KV
- **Dark Mode**: Full dark mode support

## Architecture

```
Browser <---> Next.js BFF <---> bt-servant-worker
             (API routes)       (Cloudflare Worker)
```

The web client follows a "thin gateway" pattern:

- All AI logic lives in the bt-servant-worker (Cloudflare Worker backend)
- Next.js acts as a Backend-for-Frontend (BFF), proxying requests with authentication
- Chat uses the worker's SSE streaming transport (`POST /api/v1/chat/stream`), proxied through the BFF so the worker API key never reaches the browser
- Each user's org is resolved server-side from the `CHAT_ORG_KV` KV namespace (email → org); the client cannot choose its own org

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS 4, shadcn/ui components
- **Chat**: assistant-ui framework with a custom external-store runtime
- **Auth**: NextAuth.js v5 (Google OAuth, JWT sessions)
- **Icons**: Font Awesome Pro, Lucide React, Radix Icons
- **Validation**: Zod for API request schemas
- **Testing**: Vitest
- **Hosting**: Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`)

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page (Google sign-in)
│   ├── (protected)/chat/      # Main chat interface
│   └── api/
│       ├── audio/             # Authenticated proxy for engine TTS audio (SSRF-guarded)
│       ├── auth/[...nextauth]/ # NextAuth handlers
│       ├── chat/history/      # Chat history proxy
│       ├── chat/stream/       # SSE streaming proxy to backend
│       ├── preferences/       # User preferences proxy
│       └── test-stream/       # Dev utility: proxies the worker's finite test SSE stream
├── auth.ts                    # NextAuth configuration (JWT sessions, org auto-provisioning)
├── auth.config.ts             # Auth providers (Google)
├── middleware.ts              # Route protection (redirects to /login)
├── components/
│   ├── assistant-ui/          # Chat components (Thread, markdown, attachment chips)
│   ├── providers/             # React context providers
│   ├── ui/                    # shadcn/ui components
│   ├── user-menu.tsx          # Avatar dropdown (sign out)
│   └── voice/                 # Voice recorder and audio player
├── hooks/
│   ├── use-chat-runtime.ts    # assistant-ui external store runtime + SSE client
│   ├── use-voice-recorder.ts  # MediaRecorder API wrapper
│   └── use-audio-player.ts    # Audio playback hook
├── lib/
│   ├── engine-client.ts       # HTTP client for bt-servant-worker (preferences, history)
│   ├── org-resolver.ts        # CHAT_ORG_KV lookup + first-sign-in provisioning
│   └── remark-dedupe-video-links.ts # Marks first link per video URL for inline rendering
└── types/
    └── engine.ts              # API type definitions (matching bt-servant-worker contracts)
```

## Getting Started

### Prerequisites

- Node.js 20+
- A running instance of bt-servant-worker (Cloudflare Worker backend)
- Google OAuth credentials (for Google sign-in)
- A Font Awesome Pro npm token (the `@fortawesome/pro-*` packages are installed from the Font Awesome registry)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/unfoldingWord/bt-servant-web-client.git
   cd bt-servant-web-client
   ```

2. Configure the Font Awesome Pro registry (required before install):

   ```bash
   echo "@fortawesome:registry=https://npm.fontawesome.com/" >> .npmrc
   echo "//npm.fontawesome.com/:_authToken=<your-fontawesome-token>" >> .npmrc
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Generate Cloudflare env types (required for typecheck — `cloudflare-env.d.ts` is gitignored):

   ```bash
   npm run cf-typegen
   ```

5. Copy the environment example and configure:

   ```bash
   cp .env.example .env.local
   ```

6. Edit `.env.local` with your values:

   ```env
   # NextAuth
   NEXTAUTH_URL=http://localhost:3000
   AUTH_SECRET=<generate with: openssl rand -base64 32>

   # Google OAuth
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>

   # Backend (bt-servant-worker)
   ENGINE_BASE_URL=http://localhost:8787  # Local worker, or https://api.btservant.ai
   ENGINE_API_KEY=<your-worker-api-key>   # Must match worker's API key
   CLIENT_ID=web
   DEFAULT_ORG=unfoldingWord              # Org assigned to new users on first sign-in
   ```

7. Run the development server:

   ```bash
   npm run dev
   ```

8. Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command              | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Start development server                               |
| `npm run build`      | Build for production (Next.js)                         |
| `npm run start`      | Start production server                                |
| `npm run lint`       | Run ESLint (zero warnings allowed)                     |
| `npm run lint:fix`   | Run ESLint with auto-fix                               |
| `npm run format`     | Format code with Prettier                              |
| `npm run typecheck`  | Run TypeScript type checking                           |
| `npm test`           | Run tests (Vitest)                                     |
| `npm run test:watch` | Run tests in watch mode                                |
| `npm run cf-typegen` | Generate Cloudflare env types (`cloudflare-env.d.ts`)  |
| `npm run preview`    | Build with OpenNext and preview locally on workerd     |
| `npm run deploy`     | Build with OpenNext and deploy (CI is the normal path) |

## Authentication

Sign-in is via **Google OAuth** (NextAuth.js v5 with JWT sessions — no database). The user's email address is used as the user ID for all backend calls, giving personalized responses and conversation history.

On first sign-in, the user's email is auto-provisioned in `CHAT_ORG_KV` mapped to `DEFAULT_ORG`. Partner-specific users can be assigned a different org out-of-band (see [docs/maintenance.md](docs/maintenance.md)); the provisioning step is idempotent, so manual overrides survive later sign-ins.

`middleware.ts` protects `/chat` (and `/settings`), redirecting unauthenticated users to `/login`.

## API Routes

All routes require an authenticated session and proxy to bt-servant-worker with the server-side `ENGINE_API_KEY`. The user's org is resolved from `CHAT_ORG_KV` on every request.

### POST /api/chat/stream

Streams chat responses by proxying the worker's `POST /api/v1/chat/stream` SSE endpoint.

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
- `complete`: Final response with text, optional TTS audio, and optional attachments
- `error`: Error message if something went wrong
- `keepalive`: Connection keep-alive (no visible effect)
- `tool_use` / `tool_result`: Tool invocation events (logged, not displayed)

The client enforces a 5-minute hard timeout and a 2-minute inactivity timeout (extended to 5 minutes during TTS generation).

### GET /api/chat/history

Returns previous conversation turns (`limit`/`offset` query params) for hydrating the thread on page load.

### GET/PUT /api/preferences

Manage user preferences (currently `response_language`).

### GET /api/audio?url=...

Authenticated proxy for engine-hosted TTS audio. Validates that the URL targets the engine origin under `/api/v1/audio/` (SSRF prevention) and buffers the response so browsers can determine audio duration.

## Voice Features

- **Recording**: Uses MediaRecorder API with WebM/Opus (falls back to Ogg/Opus)
- **Playback**: HTML5 Audio with seek support, from base64 or an engine-hosted URL via `/api/audio`
- **Transcript**: Audio replies include a "Show transcript" toggle
- **Format**: Recorded audio is base64-encoded for transmission

## Development

### Pre-commit Hooks

The project uses Husky and lint-staged for pre-commit checks:

- ESLint with auto-fix
- Prettier formatting
- TypeScript type checking

### Code Style

- TypeScript strict mode
- ESLint with Next.js config
- Prettier with Tailwind CSS plugin
- Zero ESLint warnings policy

### Streaming Animation

The streaming text animation (`useAnimatedText` / `AnimatedText` in `thread.tsx`) has strict invariants that past refactors have accidentally broken. Read [docs/streaming-animation.md](docs/streaming-animation.md) before touching that code.

## Deployment

The app is deployed to **Cloudflare Workers** via OpenNext.

- **Production**: https://bt-servant-web-client.unfoldingword.workers.dev (points at `https://api.btservant.ai`)
- **Staging**: `bt-servant-web-client-staging` (points at `https://staging-api.btservant.ai`)
- **CI** (`ci.yml`): Prettier check, ESLint, typecheck, Vitest, and `npm audit` on every push and PR
- **CI/CD**: GitHub Actions deploys to staging after CI passes on `main`; production is manual (`workflow_dispatch`)

Secrets are managed via GitHub Secrets and injected into `wrangler.jsonc` at deploy time. Non-secret config (`ENGINE_BASE_URL`, `CLIENT_ID`, `DEFAULT_ORG`) and the `CHAT_ORG_KV` namespace bindings live in `wrangler.jsonc`.

Operational tasks (setting a user's org in `CHAT_ORG_KV`, etc.) are documented in [docs/maintenance.md](docs/maintenance.md).

## Related Projects

- [bt-servant-worker](https://github.com/unfoldingWord/bt-servant-worker) - AI backend (Cloudflare Worker) this client talks to
- [bt-servant-whatsapp-gateway](https://github.com/unfoldingWord/bt-servant-whatsapp-gateway) - WhatsApp integration
