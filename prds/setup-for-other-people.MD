# Setup guide for other people

## Who this is for

This guide is for a teammate or contributor who wants to run HumanAgent locally.

## Quick setup

```bash
git clone <your-repo-url>
cd humanagent
npm install
npx convex dev
```

In a second terminal:

```bash
npm run dev
```

Open `http://localhost:5173`.

## What to ask the project owner for

- Convex project access
- OAuth app credentials for local development
- OpenRouter key if they want full agent responses
- Any optional provider keys if they need email or phone features

## Minimal env and service setup

1. Run `npx convex dev`
2. Run `npm run auth:setup`
3. Set required env vars in Convex dashboard:
   - `AUTH_GITHUB_ID`
   - `AUTH_GITHUB_SECRET`
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - `OPENROUTER_API_KEY`

## Daily commands

- Start frontend: `npm run dev`
- Start backend: `npm run dev:convex`
- Run both: `npm run dev:all`
- Type check: `npm run typecheck`
- Lint: `npm run lint`

## App areas to test

- Login flow at `/login`
- Onboarding flow at `/onboarding`
- Dashboard at `/dashboard`
- Public profile at `/u/:username`

## Troubleshooting

### They can open the site but cannot sign in

- Check OAuth callback URLs
- Check required auth env vars in Convex
- Re run `npm run auth:setup`

### They cannot call Convex functions

- Confirm `npx convex dev` is running
- Check that `VITE_CONVEX_URL` exists in `.env.local`
- Restart local dev server

### They changed schema and things fail

- Keep `npx convex dev` running so generated files stay in sync
- Re run type check after schema updates
