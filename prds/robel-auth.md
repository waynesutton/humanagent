# Robelest Convex Auth PRD

This document tracks how `@robelest/convex-auth` is used in this codebase and gives one place to plan auth changes.

Primary reference:
`https://github.com/robelest/convex-auth`

Secondary reference:
`https://deepwiki.com/robelest/convex-auth`

## Purpose and scope

This PRD is for the engineer working on authentication in HumanAgent.

Problem:
auth logic is spread across backend, frontend, and HTTP routes.

Cause:
the integration has multiple moving parts that are easy to miss during updates.

Difference:
this file maps the current implementation to specific files and captures tracked follow ups.

Action:
update this file whenever auth behavior or auth related schema changes.

## Current implementation snapshot

| Area | Current state | Source |
| --- | --- | --- |
| Auth component registration | `@robelest/convex-auth/convex.config` is registered with `defineApp()` | `convex/convex.config.ts` |
| Auth provider | GitHub OAuth provider via `@auth/core/providers/github` | `convex/auth.ts` |
| Auth callbacks | On first auth user creation, an app level `users` record is inserted | `convex/auth.ts` |
| Auth HTTP routes | `auth.addHttpRoutes(http)` is mounted on the raw router | `convex/http.ts` |
| Auth provider config | Provider domain uses `process.env.CONVEX_SITE_URL` with application ID `convex` | `convex/auth.config.ts` |
| App user mapping | Auth user ID is resolved to app user via `users.by_authUserId` | `convex/lib/authHelpers.ts`, `convex/schema.ts` |
| Frontend auth client | `client()` from `@robelest/convex-auth/client` is initialized once | `src/lib/auth.ts`, `src/main.tsx` |
| Frontend auth state | `useSyncExternalStore` subscribes to auth state | `src/hooks/useAuth.ts` |
| Login entry point | GitHub sign in uses `auth.signIn("github")` | `src/pages/LoginPage.tsx` |

## Auth flow in this codebase

1. Frontend bootstraps Convex client and calls `initAuth(convex)`.
2. User starts login from `LoginPage` with `auth.signIn("github")`.
3. Auth callbacks and portal routes are served through `auth.addHttpRoutes(http)`.
4. After first successful OAuth login, callback inserts an app level row in `users`.
5. Backend functions resolve session user with `auth.user.current(ctx)`.
6. Helper functions map auth user ID to app user ID through `users.by_authUserId`.
7. Protected mutations and queries can enforce auth with `requireUserId(ctx)`.

## Contract and dependencies

| Contract | Requirement |
| --- | --- |
| Users table index | `users` must keep `by_authUserId` index for identity mapping |
| Auth user linkage | `users.authUserId` must remain present and unique at app level |
| Environment variables | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `CONVEX_SITE_URL` |
| Router integration | `auth.addHttpRoutes(http)` must stay in `convex/http.ts` |
| Frontend bootstrap order | `initAuth` must run before auth state reads |

## Tracking checklist

Status legend: `todo`, `in_progress`, `done`

| Item | Status | Notes |
| --- | --- | --- |
| Verify `CONVEX_SITE_URL` value in each environment | todo | Must match deployment domain |
| Confirm auth callback is idempotent for repeated profile syncs | todo | Review `afterUserCreatedOrUpdated` behavior |
| Add explicit owner check for onboarding and settings write paths | todo | Use `requireUserId` consistently |
| Reconcile README provider list with code | todo | README mentions Google, code is GitHub only |
| Add auth regression test plan for login and first user creation | todo | Cover callback insert path |

## Change log for this PRD

| Date | Change | Author |
| --- | --- | --- |
| 2026-02-14 | Created initial auth tracking PRD from current codebase | Codex |
