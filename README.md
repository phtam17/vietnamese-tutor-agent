# Vietnamese Tutor Agent (Cloudflare Agents SDK)

A starter implementation for an AI-powered Vietnamese tutoring chat app built on Cloudflare.

This project is designed to map directly to Cloudflare assignment requirements:

- **LLM**: Workers AI model via `workers-ai-provider`
- **Workflow/coordination**: Agent turn loop with command-based teaching flows
- **User input**: chat UI (`/start`, `/lesson`, `/quiz`, `/correct`)
- **Memory/state**: Durable Object-backed agent state (`profile`, vocab, mistake patterns)

## Quick start

```bash
npm install
npm run types
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Commands

- `/start` — collect learner profile (level + learning goal)
- `/lesson <topic>` — teach one focused mini-lesson
- `/quiz` — generate a 3-question quiz
- `/correct <sentence>` — return structured correction feedback

## Project structure

```txt
src/
  server.ts   # AIChatAgent + memory schema + command-aware system prompt + tools
  app.tsx     # lightweight chat UI with quick command buttons
  client.tsx  # React entrypoint
  styles.css  # Tailwind + base styles
```

## State model

`src/server.ts` stores:

- `profile` (`level`, `goal`)
- `known_vocab` (recent unique vocabulary)
- `mistake_patterns` (recurring learner weaknesses)
- `last_lesson_topic`
- `updated_at`

## Deploy

```bash
npm run deploy
```

## Notes

- This is intentionally a clean **starter skeleton** for fast iteration.
- You can extend it with richer grading logic, scheduled review reminders, or voice.
