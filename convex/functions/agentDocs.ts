import { v } from "convex/values";
import { query } from "../_generated/server";
import { api } from "../_generated/api";

// ============================================================
// Agent docs contract builder: single source for docs.md,
// tools.md, openapi.json, and sitemap.md content generation.
// Called from http.ts route handlers.
// ============================================================

// Shared agent shape returned by contract queries
type PublicAgentInfo = {
  name: string;
  slug: string;
  description?: string;
  agentEmail?: string;
  agentPhone?: string;
  publicConnect?: {
    showApi: boolean;
    showMcp: boolean;
    showEmail: boolean;
    showSkillFile: boolean;
  };
  capabilities: Array<{ name: string; description: string }>;
};

type DocsPayload = {
  username: string;
  displayName?: string;
  bio?: string;
  baseUrl: string;
  agents: Array<PublicAgentInfo>;
  userPrivacy?: { showEmail?: boolean; showEndpoints?: boolean };
};

// Default visibility when publicConnect is unset
const VIS_DEFAULT = {
  showApi: true,
  showMcp: true,
  showEmail: true,
  showSkillFile: true,
};

// ============================================================
// Public query: fetch docs payload for a username
// ============================================================

export const getDocsPayload = query({
  args: { username: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { username }): Promise<DocsPayload | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user || !user.username) return null;

    // Profile-level visibility master toggle
    if (user.privacySettings?.profileVisible === false) return null;

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const publicAgents = agents.filter((a) => a.isPublic);

    // Build per-agent info with skills collapsed to capabilities
    const agentInfos: Array<PublicAgentInfo> = await Promise.all(
      publicAgents.map(async (agent) => {
        const skills = await ctx.db
          .query("skills")
          .withIndex("by_agentId", (q) => q.eq("agentId", agent._id))
          .collect();

        const capabilities = skills.flatMap((s) =>
          s.capabilities.map((c: { name: string; description: string }) => ({
            name: c.name,
            description: c.description,
          }))
        );

        return {
          name: agent.name,
          slug: agent.slug,
          description: agent.description,
          agentEmail: agent.agentEmail,
          agentPhone: agent.agentPhone,
          publicConnect: agent.publicConnect as PublicAgentInfo["publicConnect"],
          capabilities,
        };
      })
    );

    const baseUrl = process.env.SITE_URL || "https://humana.gent";

    return {
      username: user.username,
      displayName: user.name,
      bio: user.bio,
      baseUrl,
      agents: agentInfos,
      userPrivacy: user.privacySettings as DocsPayload["userPrivacy"],
    };
  },
});

// Public query helpers for frontend routes that need docs content
// while running through the SPA router in local development.
export const getSitemapContent = query({
  args: { username: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { username }): Promise<string | null> => {
    const payload: DocsPayload | null = await ctx.runQuery(
      api.functions.agentDocs.getDocsPayload,
      { username }
    );
    if (!payload) return null;
    return renderSitemapMd(payload);
  },
});

export const getApiDocsContent = query({
  args: { username: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { username }): Promise<string | null> => {
    const payload: DocsPayload | null = await ctx.runQuery(
      api.functions.agentDocs.getDocsPayload,
      { username }
    );
    if (!payload) return null;
    return renderDocsMd(payload);
  },
});

export const getToolsDocsContent = query({
  args: { username: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { username }): Promise<string | null> => {
    const payload: DocsPayload | null = await ctx.runQuery(
      api.functions.agentDocs.getDocsPayload,
      { username }
    );
    if (!payload) return null;
    return renderToolsMd(payload);
  },
});

export const getOpenApiContent = query({
  args: { username: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { username }): Promise<string | null> => {
    const payload: DocsPayload | null = await ctx.runQuery(
      api.functions.agentDocs.getDocsPayload,
      { username }
    );
    if (!payload) return null;
    return JSON.stringify(renderOpenApiJson(payload), null, 2);
  },
});

// ============================================================
// Content renderers (pure functions, no DB access)
// ============================================================

// Profile-level sitemap listing all agent discovery endpoints
export function renderSitemapMd(data: DocsPayload): string {
  const { username, displayName, baseUrl, agents } = data;
  const lines: Array<string> = [];

  lines.push(`# ${displayName || username} sitemap`);
  lines.push("");
  lines.push("Machine-readable discovery index for agents and tools.");
  lines.push("");

  // Profile-level docs
  lines.push("## Profile");
  lines.push("");
  lines.push(`| Resource | URL |`);
  lines.push(`|----------|-----|`);
  lines.push(`| Profile | ${baseUrl}/${username} |`);
  lines.push(`| llms.txt | ${baseUrl}/${username}/llms.txt |`);
  lines.push(`| llms-full.md | ${baseUrl}/${username}/llms-full.md |`);
  lines.push(`| API Docs | ${baseUrl}/api/v1/agents/${username}/docs.md |`);
  lines.push(`| Tools Docs | ${baseUrl}/api/v1/agents/${username}/tools.md |`);
  lines.push(`| OpenAPI | ${baseUrl}/api/v1/agents/${username}/openapi.json |`);
  lines.push(`| Sitemap | ${baseUrl}/${username}/sitemap.md |`);
  lines.push("");

  if (agents.length > 0) {
    lines.push("## Agents");
    lines.push("");
    lines.push(`| Agent | Slug | API | MCP | Skill File |`);
    lines.push(`|-------|------|-----|-----|------------|`);

    for (const agent of agents) {
      const vis = agent.publicConnect ?? VIS_DEFAULT;
      const apiUrl = vis.showApi ? `\`POST ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages\`` : "";
      const mcpUrl = vis.showMcp ? `\`${baseUrl}/mcp/u/${username}/${agent.slug}\`` : "";
      const skillUrl = vis.showSkillFile ? `[SKILL.md](${baseUrl}/u/${username}/${agent.slug}/SKILL.md)` : "";
      lines.push(`| ${agent.name} | ${agent.slug} | ${apiUrl} | ${mcpUrl} | ${skillUrl} |`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`Generated: ${new Date().toISOString()}`);

  return lines.join("\n");
}

// Human and agent quickstart docs
export function renderDocsMd(data: DocsPayload): string {
  const { username, displayName, baseUrl, agents, userPrivacy } = data;
  const lines: Array<string> = [];

  lines.push(`# ${displayName || username} API Docs`);
  lines.push("");
  if (data.bio) {
    lines.push(data.bio);
    lines.push("");
  }

  lines.push("## Authentication");
  lines.push("");
  lines.push("All message endpoints require a Bearer token:");
  lines.push("");
  lines.push("```");
  lines.push("Authorization: Bearer YOUR_API_KEY");
  lines.push("```");
  lines.push("");
  lines.push("Required scopes:");
  lines.push("- API REST message routes require `api:call`");
  lines.push("- MCP JSON-RPC routes require `mcp:call`");
  lines.push("");
  lines.push("Route group restrictions:");
  lines.push("- Keys can optionally be limited by route groups (`api`, `mcp`, `docs`, `skills`)");
  lines.push("- Discovery docs and sitemap routes are public");
  lines.push("");

  lines.push("## Content negotiation");
  lines.push("");
  lines.push("GET endpoints support content negotiation via the `Accept` header.");
  lines.push("Agents should send `Accept: text/markdown` to receive token-efficient markdown.");
  lines.push("Default response format is JSON.");
  lines.push("");
  lines.push("```bash");
  lines.push(`curl ${baseUrl}/api/v1/agents/${username} -H "Accept: text/markdown"`);
  lines.push("```");
  lines.push("");

  lines.push("## Endpoints");
  lines.push("");

  // Default user endpoint
  if (userPrivacy?.showEndpoints !== false) {
    lines.push("### Send message (default agent)");
    lines.push("");
    lines.push(`\`POST ${baseUrl}/api/v1/agents/${username}/messages\``);
    lines.push("");
    lines.push("Scope: `api:call`");
    lines.push("");
    lines.push("**Request body:**");
    lines.push("```json");
    lines.push(`{ "content": "Your message here" }`);
    lines.push("```");
    lines.push("");
    lines.push("**Response (200):**");
    lines.push("```json");
    lines.push(`{ "response": "Agent reply text", "blocked": false }`);
    lines.push("```");
    lines.push("");
    lines.push("**Error response:**");
    lines.push("```json");
    lines.push(`{ "error": { "code": "auth_required", "message": "Bearer token required" } }`);
    lines.push("```");
    lines.push("");
  }

  // Per-agent endpoints
  for (const agent of agents) {
    const vis = agent.publicConnect ?? VIS_DEFAULT;

    if (!vis.showApi) continue;

    lines.push(`### ${agent.name} (/${agent.slug})`);
    lines.push("");
    if (agent.description) {
      lines.push(`> ${agent.description}`);
      lines.push("");
    }
    lines.push(`\`POST ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages\``);
    lines.push("");
    lines.push("Scope: `api:call`");
    lines.push("");
    lines.push("Same request/response shape as the default endpoint above.");
    lines.push("");

    if (vis.showMcp) {
      lines.push(`**MCP Server**: \`${baseUrl}/mcp/u/${username}/${agent.slug}\``);
      lines.push("**MCP scope**: `mcp:call`");
      lines.push("");
    }
    if (vis.showEmail && agent.agentEmail && userPrivacy?.showEmail !== false) {
      lines.push(`**Email**: ${agent.agentEmail}`);
      lines.push("");
    }
  }

  lines.push("## Error codes");
  lines.push("");
  lines.push("| HTTP | Code | Meaning |");
  lines.push("|------|------|---------|");
  lines.push("| 400 | invalid_request | Missing or malformed field |");
  lines.push("| 401 | auth_required | No Bearer token provided |");
  lines.push("| 401 | invalid_token | Token invalid, revoked, or expired |");
  lines.push("| 404 | not_found | User or agent does not exist |");
  lines.push("| 500 | internal_error | Server error |");
  lines.push("");

  lines.push("## Discovery");
  lines.push("");
  lines.push(`- [llms.txt](${baseUrl}/${username}/llms.txt) Plain text agent overview`);
  lines.push(`- [llms-full.md](${baseUrl}/${username}/llms-full.md) Detailed markdown`);
  lines.push(`- [sitemap.md](${baseUrl}/${username}/sitemap.md) All endpoints in one page`);
  lines.push(`- [openapi.json](${baseUrl}/api/v1/agents/${username}/openapi.json) Machine contract`);
  lines.push("");

  lines.push("---");
  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join("\n");
}

// Tool-calling semantics docs
export function renderToolsMd(data: DocsPayload): string {
  const { username, displayName, baseUrl, agents, userPrivacy } = data;
  const lines: Array<string> = [];

  lines.push(`# ${displayName || username} Tools`);
  lines.push("");
  lines.push("Describes available operations, input schemas, and error modes.");
  lines.push("");
  lines.push("Auth model:");
  lines.push("- API tool calls require `api:call`");
  lines.push("- MCP tool calls require `mcp:call`");
  lines.push("- Docs and sitemap routes remain public");
  lines.push("");

  // Built-in chat tool (always available if endpoints are visible)
  if (userPrivacy?.showEndpoints !== false) {
    lines.push("## chat");
    lines.push("");
    lines.push("Send a natural language message to the agent and receive a response.");
    lines.push("");
    lines.push("**Input schema:**");
    lines.push("```json");
    lines.push(JSON.stringify({
      type: "object",
      properties: { message: { type: "string", description: "The message to send" } },
      required: ["message"],
    }, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("**Output:**");
    lines.push("```json");
    lines.push(`{ "response": "string", "blocked": false }`);
    lines.push("```");
    lines.push("");
    lines.push("**Errors:** `auth_required`, `invalid_token`, `invalid_request`");
    lines.push("");
  }

  // Per-agent capabilities as tools
  for (const agent of agents) {
    const vis = agent.publicConnect ?? VIS_DEFAULT;
    if (agent.capabilities.length === 0) continue;

    lines.push(`## ${agent.name} capabilities`);
    lines.push("");

    for (const cap of agent.capabilities) {
      lines.push(`### ${cap.name}`);
      lines.push("");
      lines.push(cap.description);
      lines.push("");

      if (vis.showApi) {
        lines.push(`**Via API:** Include capability name in your message to \`POST ${baseUrl}/api/v1/agents/${username}/${agent.slug}/messages\``);
        lines.push("");
      }
      if (vis.showMcp) {
        lines.push(`**Via MCP:** Call \`tools/call\` with tool name \`${cap.name}\` at \`${baseUrl}/mcp/u/${username}/${agent.slug}\``);
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join("\n");
}

// OpenAPI 3.1 spec
export function renderOpenApiJson(data: DocsPayload): object {
  const { username, displayName, baseUrl, agents, userPrivacy } = data;

  const paths: Record<string, object> = {};

  // Default agent message endpoint
  if (userPrivacy?.showEndpoints !== false) {
    paths[`/api/v1/agents/${username}/messages`] = {
      post: {
        summary: `Send a message to ${displayName || username}'s default agent`,
        description:
          "Requires Bearer token with `api:call` scope and `api` route-group access.",
        operationId: "sendMessage",
        security: [{ bearerAuth: [] }],
        "x-requiredScopes": ["api:call"],
        "x-routeGroup": "api",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: { content: { type: "string", description: "Message text" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Agent response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    response: { type: "string" },
                    blocked: { type: "boolean" },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication failed" },
          "404": { description: "Agent not found" },
        },
      },
    };
  }

  // Per-agent message endpoints
  for (const agent of agents) {
    const vis = agent.publicConnect ?? VIS_DEFAULT;

    paths[`/api/v1/agents/${username}/${agent.slug}`] = {
      get: {
        summary: `Get ${agent.name} capabilities`,
        description:
          "Public endpoint. No API key required. Returns this agent persona capability contract.",
        operationId: `getCapabilities_${agent.slug}`,
        parameters: [
          {
            name: "Accept",
            in: "header",
            description: "Use text/markdown for token-efficient response",
            schema: { type: "string", default: "application/json" },
          },
        ],
        responses: {
          "200": {
            description: "Agent capabilities (JSON or markdown depending on Accept header)",
            content: {
              "application/json": { schema: { type: "object" } },
              "text/markdown": { schema: { type: "string" } },
            },
          },
          "404": { description: "Agent not found" },
        },
      },
    };

    if (!vis.showApi) continue;

    paths[`/api/v1/agents/${username}/${agent.slug}/messages`] = {
      post: {
        summary: `Send a message to ${agent.name}`,
        description:
          "Requires Bearer token with `api:call` scope and `api` route-group access.",
        operationId: `sendMessage_${agent.slug}`,
        security: [{ bearerAuth: [] }],
        "x-requiredScopes": ["api:call"],
        "x-routeGroup": "api",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: { content: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Agent response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    response: { type: "string" },
                    blocked: { type: "boolean" },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication failed" },
          "404": { description: "Agent not found" },
        },
      },
    };
  }

  // GET capabilities endpoint with content negotiation
  paths[`/api/v1/agents/${username}`] = {
    get: {
      summary: `Get ${displayName || username}'s agent capabilities`,
      description:
        "Public endpoint. No API key required. Use `Accept: text/markdown` for token-efficient responses.",
      operationId: "getCapabilities",
      parameters: [
        {
          name: "Accept",
          in: "header",
          description: "Use text/markdown for token-efficient response",
          schema: { type: "string", default: "application/json" },
        },
      ],
      responses: {
        "200": {
          description: "Agent capabilities (JSON or markdown depending on Accept header)",
          content: {
            "application/json": { schema: { type: "object" } },
            "text/markdown": { schema: { type: "string" } },
          },
        },
        "404": { description: "Agent not found" },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: `${displayName || username} Agent API`,
      description: data.bio || "HumanAgent personal API",
      version: "1.0.0",
      contact: { url: `${baseUrl}/${username}` },
    },
    servers: [{ url: baseUrl }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API key from HumanAgent dashboard. REST message routes require `api:call`. MCP routes (`/mcp/u/...`) require `mcp:call` and are documented in docs.md/tools.md.",
        },
      },
    },
  };
}
