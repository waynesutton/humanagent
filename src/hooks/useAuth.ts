/**
 * React hook for @robelest/convex-auth state.
 * Replaces useConvexAuth() which requires ConvexProviderWithAuth.
 */
import { useSyncExternalStore } from "react";
import { getAuth } from "../lib/auth";
import type { AuthState } from "@robelest/convex-auth/client";

function subscribe(cb: () => void) {
  return getAuth().onChange(cb);
}

function getSnapshot(): AuthState {
  return getAuth().state;
}

export function useAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
