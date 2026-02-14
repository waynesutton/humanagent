/**
 * Auth client singleton.
 * Wraps the Convex client with @robelest/convex-auth for token management.
 */
import { client as createAuthClient } from "@robelest/convex-auth/client";
import type { ConvexReactClient } from "convex/react";

let authClient: ReturnType<typeof createAuthClient> | null = null;

export function initAuth(convex: ConvexReactClient) {
  if (authClient) return authClient;
  authClient = createAuthClient({ convex });
  return authClient;
}

export function getAuth() {
  if (!authClient) throw new Error("Auth not initialized. Call initAuth first.");
  return authClient;
}
