/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_queries from "../agent/queries.js";
import type * as agent_runtime from "../agent/runtime.js";
import type * as agent_security from "../agent/security.js";
import type * as agent_securityUtils from "../agent/securityUtils.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as functions_a2a from "../functions/a2a.js";
import type * as functions_admin from "../functions/admin.js";
import type * as functions_agentDocs from "../functions/agentDocs.js";
import type * as functions_agentThinking from "../functions/agentThinking.js";
import type * as functions_agentmail from "../functions/agentmail.js";
import type * as functions_agents from "../functions/agents.js";
import type * as functions_apiKeys from "../functions/apiKeys.js";
import type * as functions_auditLog from "../functions/auditLog.js";
import type * as functions_board from "../functions/board.js";
import type * as functions_connectedApps from "../functions/connectedApps.js";
import type * as functions_conversations from "../functions/conversations.js";
import type * as functions_credentials from "../functions/credentials.js";
import type * as functions_feed from "../functions/feed.js";
import type * as functions_llmsTxt from "../functions/llmsTxt.js";
import type * as functions_mcpConnections from "../functions/mcpConnections.js";
import type * as functions_permissions from "../functions/permissions.js";
import type * as functions_rateLimits from "../functions/rateLimits.js";
import type * as functions_security from "../functions/security.js";
import type * as functions_skills from "../functions/skills.js";
import type * as functions_userSchedules from "../functions/userSchedules.js";
import type * as functions_users from "../functions/users.js";
import type * as functions_webhooks from "../functions/webhooks.js";
import type * as functions_xTwitter from "../functions/xTwitter.js";
import type * as http from "../http.js";
import type * as lib_authHelpers from "../lib/authHelpers.js";
import type * as lib_functions from "../lib/functions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/queries": typeof agent_queries;
  "agent/runtime": typeof agent_runtime;
  "agent/security": typeof agent_security;
  "agent/securityUtils": typeof agent_securityUtils;
  auth: typeof auth;
  crons: typeof crons;
  "functions/a2a": typeof functions_a2a;
  "functions/admin": typeof functions_admin;
  "functions/agentDocs": typeof functions_agentDocs;
  "functions/agentThinking": typeof functions_agentThinking;
  "functions/agentmail": typeof functions_agentmail;
  "functions/agents": typeof functions_agents;
  "functions/apiKeys": typeof functions_apiKeys;
  "functions/auditLog": typeof functions_auditLog;
  "functions/board": typeof functions_board;
  "functions/connectedApps": typeof functions_connectedApps;
  "functions/conversations": typeof functions_conversations;
  "functions/credentials": typeof functions_credentials;
  "functions/feed": typeof functions_feed;
  "functions/llmsTxt": typeof functions_llmsTxt;
  "functions/mcpConnections": typeof functions_mcpConnections;
  "functions/permissions": typeof functions_permissions;
  "functions/rateLimits": typeof functions_rateLimits;
  "functions/security": typeof functions_security;
  "functions/skills": typeof functions_skills;
  "functions/userSchedules": typeof functions_userSchedules;
  "functions/users": typeof functions_users;
  "functions/webhooks": typeof functions_webhooks;
  "functions/xTwitter": typeof functions_xTwitter;
  http: typeof http;
  "lib/authHelpers": typeof lib_authHelpers;
  "lib/functions": typeof lib_functions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: {
    portalBridge: {
      gcOldAssets: FunctionReference<
        "mutation",
        "internal",
        { currentDeploymentId: string },
        any
      >;
      getByPath: FunctionReference<"query", "internal", { path: string }, any>;
      getCurrentDeployment: FunctionReference<"query", "internal", {}, any>;
      listAssets: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any
      >;
      recordAsset: FunctionReference<
        "mutation",
        "internal",
        {
          blobId?: string;
          contentType: string;
          deploymentId: string;
          path: string;
          storageId?: string;
        },
        any
      >;
      setCurrentDeployment: FunctionReference<
        "mutation",
        "internal",
        { deploymentId: string },
        null
      >;
    };
    public: {
      accountDelete: FunctionReference<
        "mutation",
        "internal",
        { accountId: string },
        any
      >;
      accountGet: FunctionReference<
        "query",
        "internal",
        { provider: string; providerAccountId: string },
        any
      >;
      accountGetById: FunctionReference<
        "query",
        "internal",
        { accountId: string },
        any
      >;
      accountInsert: FunctionReference<
        "mutation",
        "internal",
        {
          provider: string;
          providerAccountId: string;
          secret?: string;
          userId: string;
        },
        any
      >;
      accountListByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      accountPatch: FunctionReference<
        "mutation",
        "internal",
        { accountId: string; data: any },
        any
      >;
      groupCreate: FunctionReference<
        "mutation",
        "internal",
        { extend?: any; name: string; parentGroupId?: string; slug?: string },
        any
      >;
      groupDelete: FunctionReference<
        "mutation",
        "internal",
        { groupId: string },
        any
      >;
      groupGet: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        any
      >;
      groupList: FunctionReference<
        "query",
        "internal",
        { parentGroupId?: string },
        any
      >;
      groupUpdate: FunctionReference<
        "mutation",
        "internal",
        { data: any; groupId: string },
        any
      >;
      inviteAccept: FunctionReference<
        "mutation",
        "internal",
        { acceptedByUserId?: string; inviteId: string },
        any
      >;
      inviteCreate: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          expiresTime?: number;
          extend?: any;
          groupId?: string;
          invitedByUserId?: string;
          role?: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          tokenHash: string;
        },
        any
      >;
      inviteGet: FunctionReference<
        "query",
        "internal",
        { inviteId: string },
        any
      >;
      inviteGetByTokenHash: FunctionReference<
        "query",
        "internal",
        { tokenHash: string },
        any
      >;
      inviteList: FunctionReference<
        "query",
        "internal",
        {
          groupId?: string;
          status?: "pending" | "accepted" | "revoked" | "expired";
        },
        any
      >;
      inviteRevoke: FunctionReference<
        "mutation",
        "internal",
        { inviteId: string },
        any
      >;
      memberAdd: FunctionReference<
        "mutation",
        "internal",
        {
          extend?: any;
          groupId: string;
          role?: string;
          status?: string;
          userId: string;
        },
        any
      >;
      memberGet: FunctionReference<
        "query",
        "internal",
        { memberId: string },
        any
      >;
      memberGetByGroupAndUser: FunctionReference<
        "query",
        "internal",
        { groupId: string; userId: string },
        any
      >;
      memberList: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        any
      >;
      memberListByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      memberRemove: FunctionReference<
        "mutation",
        "internal",
        { memberId: string },
        any
      >;
      memberUpdate: FunctionReference<
        "mutation",
        "internal",
        { data: any; memberId: string },
        any
      >;
      passkeyDelete: FunctionReference<
        "mutation",
        "internal",
        { passkeyId: string },
        any
      >;
      passkeyGetByCredentialId: FunctionReference<
        "query",
        "internal",
        { credentialId: string },
        any
      >;
      passkeyInsert: FunctionReference<
        "mutation",
        "internal",
        {
          algorithm: number;
          backedUp: boolean;
          counter: number;
          createdAt: number;
          credentialId: string;
          deviceType: string;
          name?: string;
          publicKey: ArrayBuffer;
          transports?: Array<string>;
          userId: string;
        },
        any
      >;
      passkeyListByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      passkeyUpdateCounter: FunctionReference<
        "mutation",
        "internal",
        { counter: number; lastUsedAt: number; passkeyId: string },
        any
      >;
      passkeyUpdateMeta: FunctionReference<
        "mutation",
        "internal",
        { data: any; passkeyId: string },
        any
      >;
      rateLimitCreate: FunctionReference<
        "mutation",
        "internal",
        { attemptsLeft: number; identifier: string; lastAttemptTime: number },
        any
      >;
      rateLimitDelete: FunctionReference<
        "mutation",
        "internal",
        { rateLimitId: string },
        any
      >;
      rateLimitGet: FunctionReference<
        "query",
        "internal",
        { identifier: string },
        any
      >;
      rateLimitPatch: FunctionReference<
        "mutation",
        "internal",
        { data: any; rateLimitId: string },
        any
      >;
      refreshTokenCreate: FunctionReference<
        "mutation",
        "internal",
        {
          expirationTime: number;
          parentRefreshTokenId?: string;
          sessionId: string;
        },
        any
      >;
      refreshTokenDeleteAll: FunctionReference<
        "mutation",
        "internal",
        { sessionId: string },
        any
      >;
      refreshTokenGetActive: FunctionReference<
        "query",
        "internal",
        { sessionId: string },
        any
      >;
      refreshTokenGetById: FunctionReference<
        "query",
        "internal",
        { refreshTokenId: string },
        any
      >;
      refreshTokenGetChildren: FunctionReference<
        "query",
        "internal",
        { parentRefreshTokenId: string; sessionId: string },
        any
      >;
      refreshTokenListBySession: FunctionReference<
        "query",
        "internal",
        { sessionId: string },
        any
      >;
      refreshTokenPatch: FunctionReference<
        "mutation",
        "internal",
        { data: any; refreshTokenId: string },
        any
      >;
      sessionCreate: FunctionReference<
        "mutation",
        "internal",
        { expirationTime: number; userId: string },
        any
      >;
      sessionDelete: FunctionReference<
        "mutation",
        "internal",
        { sessionId: string },
        any
      >;
      sessionGetById: FunctionReference<
        "query",
        "internal",
        { sessionId: string },
        any
      >;
      sessionList: FunctionReference<"query", "internal", {}, any>;
      sessionListByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      totpDelete: FunctionReference<
        "mutation",
        "internal",
        { totpId: string },
        any
      >;
      totpGetById: FunctionReference<
        "query",
        "internal",
        { totpId: string },
        any
      >;
      totpGetVerifiedByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      totpInsert: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt: number;
          digits: number;
          name?: string;
          period: number;
          secret: ArrayBuffer;
          userId: string;
          verified: boolean;
        },
        any
      >;
      totpListByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      totpMarkVerified: FunctionReference<
        "mutation",
        "internal",
        { lastUsedAt: number; totpId: string },
        any
      >;
      totpUpdateLastUsed: FunctionReference<
        "mutation",
        "internal",
        { lastUsedAt: number; totpId: string },
        any
      >;
      userFindByVerifiedEmail: FunctionReference<
        "query",
        "internal",
        { email: string },
        any
      >;
      userFindByVerifiedPhone: FunctionReference<
        "query",
        "internal",
        { phone: string },
        any
      >;
      userGetById: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      userInsert: FunctionReference<"mutation", "internal", { data: any }, any>;
      userList: FunctionReference<"query", "internal", {}, any>;
      userPatch: FunctionReference<
        "mutation",
        "internal",
        { data: any; userId: string },
        any
      >;
      userUpsert: FunctionReference<
        "mutation",
        "internal",
        { data: any; userId?: string },
        any
      >;
      verificationCodeCreate: FunctionReference<
        "mutation",
        "internal",
        {
          accountId: string;
          code: string;
          emailVerified?: string;
          expirationTime: number;
          phoneVerified?: string;
          provider: string;
          verifier?: string;
        },
        any
      >;
      verificationCodeDelete: FunctionReference<
        "mutation",
        "internal",
        { verificationCodeId: string },
        any
      >;
      verificationCodeGetByAccountId: FunctionReference<
        "query",
        "internal",
        { accountId: string },
        any
      >;
      verificationCodeGetByCode: FunctionReference<
        "query",
        "internal",
        { code: string },
        any
      >;
      verifierCreate: FunctionReference<
        "mutation",
        "internal",
        { sessionId?: string },
        any
      >;
      verifierDelete: FunctionReference<
        "mutation",
        "internal",
        { verifierId: string },
        any
      >;
      verifierGetById: FunctionReference<
        "query",
        "internal",
        { verifierId: string },
        any
      >;
      verifierGetBySignature: FunctionReference<
        "query",
        "internal",
        { signature: string },
        any
      >;
      verifierPatch: FunctionReference<
        "mutation",
        "internal",
        { data: any; verifierId: string },
        any
      >;
    };
  };
};
