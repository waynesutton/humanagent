# Auth setup for owner

## Goal

Set up `@robelest/convex-auth` for local development and keep auth stable across the app.

## Current auth stack

- Auth library: `@robelest/convex-auth`
- Providers in use: GitHub and Google
- Auth config file: `convex/auth.ts`
- Auth HTTP routes: `convex/http.ts`

## One time setup

Install dependencies:

```bash
npm install
```

Start Convex:

```bash
npx convex dev
```

Generate auth config and keys:

```bash
npm run auth:setup
```

Upload and link auth portal when needed:

```bash
npm run auth:portal:upload
npm run auth:portal:link
```

## Required env vars in Convex

Set all values in Convex dashboard environment variables.

- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

Most setups created by `auth:setup` also include auth keys such as private key and JWKS values.

## OAuth provider setup checklist

### GitHub

1. Create OAuth app in GitHub
2. Set callback URL to your local auth callback URL from convex auth docs
3. Copy client ID and secret to Convex env vars

### Google

1. Create OAuth client in Google Cloud
2. Add authorized redirect URI for local callback
3. Copy client ID and secret to Convex env vars

## Verify auth locally

1. Run `npx convex dev`
2. Run `npm run dev`
3. Open `/login`
4. Test GitHub login
5. Test Google login
6. Confirm redirected authenticated routes load

## Common owner issues

### Login redirect loop

- Check `SITE_URL` and callback settings
- Check OAuth redirect URIs in provider dashboards
- Re run `npm run auth:setup`

### Provider button shows error

- Check provider ID and secret values in Convex
- Confirm no extra whitespace in env var values

### Auth routes missing

- Confirm `auth.addHttpRoutes(http)` exists in `convex/http.ts`
- Confirm auth component is registered in `convex/convex.config.ts`

## Security reminders

- Never commit secrets to source control
- Keep all auth secrets in Convex environment variables
- Rotate provider secrets if they were shared by mistake
