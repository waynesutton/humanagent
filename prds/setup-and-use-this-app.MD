# Setup and use this app

## Who this is for

You are the project owner and you want to run HumanAgent on your machine.

## What you need

- Node.js 18 or newer
- npm
- A Convex account
- GitHub and Google OAuth app credentials
- An OpenRouter API key

## First run

```bash
npm install
npx convex dev
```

Keep `npx convex dev` running in one terminal.

In a second terminal, run:

```bash
npm run dev
```

## Set up auth

Run:

```bash
npm run auth:setup
```

This command is an alias for:

```bash
npx @robelest/convex-auth --site-url http://localhost:5173
```

## Set environment variables in Convex

Go to Convex dashboard then open Settings and Environment Variables.

Set:

- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `OPENROUTER_API_KEY`
- `AGENTMAIL_API_KEY` when you enable email
- `AGENTMAIL_WEBHOOK_SECRET` when you enable email

Optional later:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `RESEND_API_KEY`

## Open the app

Open:

`http://localhost:5173`

Main pages:

- Landing page at `/`
- Login at `/login`
- Dashboard at `/dashboard`
- Public agent page at `/u/:username`

## Basic local workflow

1. Start backend with `npx convex dev`
2. Start frontend with `npm run dev`
3. Run type check with `npm run typecheck`
4. Run lint with `npm run lint`

## Common issues

### Auth buttons do not work

- Check `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`
- Check `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
- Confirm callback URLs in each OAuth provider include your local URL

### Convex errors on startup

- Re run `npx convex dev`
- Confirm you are logged into Convex

### App loads but API calls fail

- Confirm `VITE_CONVEX_URL` is present in `.env.local`
- Restart the frontend server after env changes
