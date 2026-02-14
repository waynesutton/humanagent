import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { auth } from "./auth";
import { corsRouter } from "convex-helpers/server/cors";

const http = httpRouter();

// Auth routes (OAuth callbacks, JWKS, portal) on raw router
auth.addHttpRoutes(http);

// CORS-enabled router for public API routes
const cors = corsRouter(http, {
  allowedOrigins: ["*"],
  allowedHeaders: ["Content-Type", "Authorization"],
  allowCredentials: false,
});

// ============================================================
// Public API: send message to an agent
// ============================================================

cors.route({
  path: "/api/v1/agents/:username/messages",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const username = url.pathname.split("/")[4];
      if (!username) {
        return new Response(
          JSON.stringify({ error: "Username required" }),
          { status: 400 }
        );
      }

      // Validate API key
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Bearer token required" }),
          { status: 401 }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(token)
      );
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const apiKey = await ctx.runQuery(
        internal.functions.apiKeys.validateToken,
        { tokenHash }
      );

      // Look up user
      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username,
      });
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Agent not found" }),
          { status: 404 }
        );
      }

      const defaultPublicAgent = await ctx.runQuery(
        api.functions.agents.getPublicDefaultByUsername,
        { username }
      );
      if (!defaultPublicAgent) {
        return new Response(
          JSON.stringify({ error: "No public agent configured for this user" }),
          { status: 404 }
        );
      }

      // Parse body
      const body = (await request.json()) as { content?: string };
      if (!body.content) {
        return new Response(
          JSON.stringify({ error: "content field required" }),
          { status: 400 }
        );
      }

      // Process message
      const result = await ctx.runAction(
        internal.agent.runtime.processMessage,
        {
          userId: user._id,
          agentId: defaultPublicAgent._id,
          message: body.content,
          channel: "api",
          callerId: apiKey?.keyPrefix ?? "anonymous",
        }
      );

      return new Response(JSON.stringify(result), {
        status: result.blocked ? 400 : 200,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500 }
      );
    }
  }),
});

// Public API: send message to a specific public agent by slug
cors.route({
  path: "/api/v1/agents/:username/:slug/messages",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const username = pathParts[4];
      const slug = pathParts[5];
      if (!username || !slug) {
        return new Response(
          JSON.stringify({ error: "Username and slug are required" }),
          { status: 400 }
        );
      }

      // Validate API key
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Bearer token required" }),
          { status: 401 }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(token)
      );
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const apiKey = await ctx.runQuery(
        internal.functions.apiKeys.validateToken,
        { tokenHash }
      );

      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username,
      });
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Agent not found" }),
          { status: 404 }
        );
      }

      const publicAgent = await ctx.runQuery(
        api.functions.agents.getPublicByUsernameAndSlug,
        { username, slug }
      );
      if (!publicAgent) {
        return new Response(
          JSON.stringify({ error: "Public agent not found for this slug" }),
          { status: 404 }
        );
      }

      const body = (await request.json()) as { content?: string };
      if (!body.content) {
        return new Response(
          JSON.stringify({ error: "content field required" }),
          { status: 400 }
        );
      }

      const result = await ctx.runAction(
        internal.agent.runtime.processMessage,
        {
          userId: user._id,
          agentId: publicAgent._id,
          message: body.content,
          channel: "api",
          callerId: apiKey?.keyPrefix ?? "anonymous",
        }
      );

      return new Response(JSON.stringify(result), {
        status: result.blocked ? 400 : 200,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500 }
      );
    }
  }),
});

// ============================================================
// Public API: get agent capabilities
// ============================================================

cors.route({
  path: "/api/v1/agents/:username",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[4];
    if (!username) {
      return new Response(
        JSON.stringify({ error: "Username required" }),
        { status: 400 }
      );
    }

    const defaultPublicAgent = await ctx.runQuery(
      api.functions.agents.getPublicDefaultByUsername,
      { username }
    );
    const skill = defaultPublicAgent
      ? await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
          username,
          slug: defaultPublicAgent.slug,
        })
      : await ctx.runQuery(api.functions.skills.getPublicSkill, {
          username,
        });

    if (!skill) {
      return new Response(
        JSON.stringify({ error: "Agent not found or not published" }),
        { status: 404 }
      );
    }

    // Content negotiation: markdown for agents, JSON for APIs
    const accept = request.headers.get("Accept") ?? "";
    if (accept.includes("text/markdown")) {
      const md = skillToMarkdown(skill, username);
      return new Response(md, {
        headers: {
          "Content-Type": "text/markdown",
          "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
        },
      });
    }

    return new Response(JSON.stringify(skill), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Public API: get capabilities for a specific public agent by slug
cors.route({
  path: "/api/v1/agents/:username/:slug",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const username = pathParts[4];
    const slug = pathParts[5];
    if (!username || !slug) {
      return new Response(
        JSON.stringify({ error: "Username and slug are required" }),
        { status: 400 }
      );
    }

    const skill = await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
      username,
      slug,
    });

    if (!skill) {
      return new Response(
        JSON.stringify({ error: "Agent not found or not published" }),
        { status: 404 }
      );
    }

    const accept = request.headers.get("Accept") ?? "";
    if (accept.includes("text/markdown")) {
      const md = skillToMarkdown(skill, username);
      return new Response(md, {
        headers: {
          "Content-Type": "text/markdown",
          "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
        },
      });
    }

    return new Response(JSON.stringify(skill), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ============================================================
// A2A Agent Card (.well-known/agent.json)
// ============================================================

cors.route({
  path: "/.well-known/agent.json",
  method: "GET",
  handler: httpAction(async () => {
    const card = {
      name: "HumanAgent Platform",
      description:
        "Every human gets an agent. Find agents at humanai.gent/{username}",
      url: "https://humanai.gent",
      version: "0.1.0",
      capabilities: {
        streaming: false,
        pushNotifications: false,
      },
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
    };

    return new Response(JSON.stringify(card), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ============================================================
// Webhook: AgentMail inbound email (no CORS, server-to-server)
// ============================================================

http.route({
  path: "/webhooks/agentmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-agentmail-signature");
    const body = await request.text();

    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(body, signature)) {
      // Skip audit log for invalid webhooks (no user context)
      console.log("AgentMail webhook rejected: invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    try {
      const event = JSON.parse(body) as {
        type: string;
        to: string;
        from: string;
        subject: string;
        text: string;
      };

      // Extract username from email address (user@humanai.gent)
      const toUsername = event.to.split("@")[0];
      if (!toUsername) {
        return new Response("Invalid recipient", { status: 400 });
      }

      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username: toUsername,
      });

      if (!user) {
        return new Response("Agent not found", { status: 404 });
      }

      // Process the email as an inbound message
      await ctx.runAction(internal.agent.runtime.processMessage, {
        userId: user._id,
        message: `Email from ${event.from}\nSubject: ${event.subject}\n\n${event.text}`,
        channel: "email",
        callerId: event.from,
      });

      return new Response("OK", { status: 200 });
    } catch {
      return new Response("Processing error", { status: 500 });
    }
  }),
});

// ============================================================
// Webhook: Twilio SMS/Voice inbound
// ============================================================

http.route({
  path: "/webhooks/twilio/sms",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const formData = await request.formData();
      const from = formData.get("From") as string;
      const to = formData.get("To") as string;
      const body = formData.get("Body") as string;

      if (!from || !to || !body) {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Invalid request</Message></Response>',
          { headers: { "Content-Type": "application/xml" } }
        );
      }

      // Find agent by phone number
      const agent = await ctx.runQuery(internal.functions.agents.getByPhone, {
        phoneNumber: to,
      });

      if (!agent) {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Agent not found</Message></Response>',
          { headers: { "Content-Type": "application/xml" } }
        );
      }

      // Process the SMS as an inbound message
      const result = await ctx.runAction(internal.agent.runtime.processMessage, {
        userId: agent.userId,
        agentId: agent._id,
        message: body,
        channel: "phone",
        callerId: from,
      });

      // Return TwiML response with agent's reply
      const responseText = result.blocked
        ? "I cannot process that request."
        : result.response;

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(responseText)}</Message></Response>`,
        { headers: { "Content-Type": "application/xml" } }
      );
    } catch (error) {
      console.error("Twilio SMS webhook error:", error);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error processing message</Message></Response>',
        { headers: { "Content-Type": "application/xml" } }
      );
    }
  }),
});

http.route({
  path: "/webhooks/twilio/voice",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const formData = await request.formData();
      const from = formData.get("From") as string;
      const to = formData.get("To") as string;
      const speechResult = formData.get("SpeechResult") as string | null;

      // Find agent by phone number
      const agent = await ctx.runQuery(internal.functions.agents.getByPhone, {
        phoneNumber: to,
      });

      if (!agent) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Say>I'm sorry, this agent is not available. Goodbye.</Say>
            <Hangup/>
          </Response>`,
          { headers: { "Content-Type": "application/xml" } }
        );
      }

      // If we have speech input, process it
      if (speechResult) {
        const result = await ctx.runAction(internal.agent.runtime.processMessage, {
          userId: agent.userId,
          agentId: agent._id,
          message: speechResult,
          channel: "phone",
          callerId: from,
        });

        const responseText = result.blocked
          ? "I cannot process that request."
          : result.response;

        // Get voice setting from agent config (ElevenLabs or OpenAI fallback)
        const voiceName = agent.voiceConfig?.openaiVoice ?? "nova";

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Say voice="Polly.${voiceName}">${escapeXml(responseText)}</Say>
            <Gather input="speech" timeout="5" speechTimeout="auto" action="/webhooks/twilio/voice">
              <Say voice="Polly.${voiceName}">Is there anything else I can help you with?</Say>
            </Gather>
            <Say voice="Polly.${voiceName}">Goodbye.</Say>
            <Hangup/>
          </Response>`,
          { headers: { "Content-Type": "application/xml" } }
        );
      }

      // Initial greeting
      const voiceName = agent.voiceConfig?.openaiVoice ?? "nova";

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Gather input="speech" timeout="5" speechTimeout="auto" action="/webhooks/twilio/voice">
            <Say voice="Polly.${voiceName}">Hello, this is ${escapeXml(agent.name)}. How can I help you today?</Say>
          </Gather>
          <Say voice="Polly.${voiceName}">I didn't hear anything. Goodbye.</Say>
          <Hangup/>
        </Response>`,
        { headers: { "Content-Type": "application/xml" } }
      );
    } catch (error) {
      console.error("Twilio voice webhook error:", error);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>An error occurred. Please try again later.</Say>
          <Hangup/>
        </Response>`,
        { headers: { "Content-Type": "application/xml" } }
      );
    }
  }),
});

// ============================================================
// MCP Server: Per-user MCP endpoint
// ============================================================

cors.route({
  path: "/mcp/u/:username",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const username = pathParts[3];

      if (!username) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: "Username required" }, id: null }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Look up user
      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username,
      });

      if (!user || user.profileHidden) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Agent not found" }, id: null }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const defaultPublicAgent = await ctx.runQuery(
        api.functions.agents.getPublicDefaultByUsername,
        { username }
      );
      if (!defaultPublicAgent) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "No public agent configured" }, id: null }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Parse JSON-RPC request
      const rpcRequest = (await request.json()) as {
        jsonrpc: string;
        method: string;
        params?: Record<string, unknown>;
        id: string | number | null;
      };

      // Handle MCP methods
      switch (rpcRequest.method) {
        case "initialize": {
          // Return server info and capabilities
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: { listChanged: false },
                  prompts: { listChanged: false },
                },
                serverInfo: {
                  name: `${user.name ?? username}'s Agent`,
                  version: "1.0.0",
                },
              },
              id: rpcRequest.id,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        case "tools/list": {
          // Get published skills for this user's default public agent
          const skill = await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
            username,
            slug: defaultPublicAgent.slug,
          });

          const tools = skill?.toolDeclarations?.map((tool: { name: string; description: string; inputSchema?: unknown }) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          })) ?? [];

          // Add default chat tool
          tools.push({
            name: "chat",
            description: `Send a message to ${user.name ?? username}'s agent`,
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "The message to send" },
              },
              required: ["message"],
            },
          });

          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result: { tools }, id: rpcRequest.id }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        case "tools/call": {
          const params = rpcRequest.params as {
            name: string;
            arguments?: Record<string, unknown>;
          };

          if (params.name === "chat") {
            const message = params.arguments?.message as string;
            if (!message) {
              return new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: { code: -32602, message: "message argument required" },
                  id: rpcRequest.id,
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }

            // Process the message through the agent runtime
            const result = await ctx.runAction(internal.agent.runtime.processMessage, {
              userId: user._id,
              agentId: defaultPublicAgent._id,
              message,
              channel: "mcp",
              callerId: "mcp-client",
            });

            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                result: {
                  content: [{ type: "text", text: result.response }],
                  isError: result.blocked,
                },
                id: rpcRequest.id,
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // Handle other tool calls by delegating to agent
          const result = await ctx.runAction(internal.agent.runtime.processMessage, {
            userId: user._id,
            agentId: defaultPublicAgent._id,
            message: `Execute tool: ${params.name} with arguments: ${JSON.stringify(params.arguments)}`,
            channel: "mcp",
            callerId: "mcp-client",
          });

          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: result.response }],
                isError: result.blocked,
              },
              id: rpcRequest.id,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        case "prompts/list": {
          // Return available prompts (based on capabilities)
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result: { prompts: [] }, id: rpcRequest.id }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        default:
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32601, message: `Method not found: ${rpcRequest.method}` },
              id: rpcRequest.id,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: String(error) },
          id: null,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// MCP Server: Specific public agent by slug
cors.route({
  path: "/mcp/u/:username/:slug",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const username = pathParts[3];
      const slug = pathParts[4];

      if (!username || !slug) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: "Username and slug are required" }, id: null }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username,
      });

      if (!user || user.profileHidden) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Agent not found" }, id: null }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const publicAgent = await ctx.runQuery(
        api.functions.agents.getPublicByUsernameAndSlug,
        { username, slug }
      );
      if (!publicAgent) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32601, message: "Public agent not found for this slug" }, id: null }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const rpcRequest = (await request.json()) as {
        jsonrpc: string;
        method: string;
        params?: Record<string, unknown>;
        id: string | number | null;
      };

      switch (rpcRequest.method) {
        case "initialize": {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: { listChanged: false },
                  prompts: { listChanged: false },
                },
                serverInfo: {
                  name: `${publicAgent.name}`,
                  version: "1.0.0",
                },
              },
              id: rpcRequest.id,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        case "tools/list": {
          const skill = await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
            username,
            slug,
          });

          const tools = skill?.toolDeclarations?.map((tool: { name: string; description: string; inputSchema?: unknown }) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          })) ?? [];

          tools.push({
            name: "chat",
            description: `Send a message to ${publicAgent.name}`,
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "The message to send" },
              },
              required: ["message"],
            },
          });

          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result: { tools }, id: rpcRequest.id }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        case "tools/call": {
          const params = rpcRequest.params as {
            name: string;
            arguments?: Record<string, unknown>;
          };

          if (params.name === "chat") {
            const message = params.arguments?.message as string;
            if (!message) {
              return new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: { code: -32602, message: "message argument required" },
                  id: rpcRequest.id,
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }

            const result = await ctx.runAction(internal.agent.runtime.processMessage, {
              userId: user._id,
              agentId: publicAgent._id,
              message,
              channel: "mcp",
              callerId: "mcp-client",
            });

            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                result: {
                  content: [{ type: "text", text: result.response }],
                  isError: result.blocked,
                },
                id: rpcRequest.id,
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          const result = await ctx.runAction(internal.agent.runtime.processMessage, {
            userId: user._id,
            agentId: publicAgent._id,
            message: `Execute tool: ${params.name} with arguments: ${JSON.stringify(params.arguments)}`,
            channel: "mcp",
            callerId: "mcp-client",
          });

          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: result.response }],
                isError: result.blocked,
              },
              id: rpcRequest.id,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        case "prompts/list": {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", result: { prompts: [] }, id: rpcRequest.id }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        default:
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32601, message: `Method not found: ${rpcRequest.method}` },
              id: rpcRequest.id,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: String(error) },
          id: null,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============================================================
// Skill File Endpoints
// ============================================================

cors.route({
  path: "/u/:username/skill.json",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[2];

    if (!username) {
      return new Response(JSON.stringify({ error: "Username required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const skill = await ctx.runQuery(api.functions.skills.getPublicSkill, {
      username,
    });

    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return skill in JSON format
    return new Response(JSON.stringify(skill, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

cors.route({
  path: "/u/:username/:slug/skill.json",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const username = pathParts[2];
    const slug = pathParts[3];

    if (!username || !slug) {
      return new Response(JSON.stringify({ error: "Username and slug are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const skill = await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
      username,
      slug,
    });

    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(skill, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

cors.route({
  path: "/u/:username/SKILL.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[2];

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const skill = await ctx.runQuery(api.functions.skills.getPublicSkill, {
      username,
    });

    if (!skill) {
      return new Response("Skill not found", { status: 404 });
    }

    const md = skillToMarkdown(skill, username);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown",
        "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
      },
    });
  }),
});

cors.route({
  path: "/u/:username/:slug/SKILL.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const username = pathParts[2];
    const slug = pathParts[3];

    if (!username || !slug) {
      return new Response("Username and slug are required", { status: 400 });
    }

    const skill = await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
      username,
      slug,
    });

    if (!skill) {
      return new Response("Skill not found", { status: 404 });
    }

    const md = skillToMarkdown(skill, username);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown",
        "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
      },
    });
  }),
});

// ============================================================
// llms.txt - AI discoverability file for user's agents
// ============================================================

// Serve llms.txt (plain text version)
cors.route({
  path: "/u/:username/llms.txt",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[2];

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const llmsTxt = await ctx.runQuery(api.functions.llmsTxt.getByUsername, {
      username,
    });

    if (!llmsTxt) {
      return new Response("# No agents found\n\nThis user has not set up any public agents yet.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(llmsTxt.txtContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "X-Generated-At": new Date(llmsTxt.generatedAt).toISOString(),
      },
    });
  }),
});

// Serve llms-full.md (markdown version with full details)
cors.route({
  path: "/u/:username/llms-full.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[2];

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const llmsTxt = await ctx.runQuery(api.functions.llmsTxt.getByUsername, {
      username,
    });

    if (!llmsTxt) {
      return new Response("# No agents found\n\nThis user has not set up any public agents yet.", {
        status: 404,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return new Response(llmsTxt.mdContent, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "X-Generated-At": new Date(llmsTxt.generatedAt).toISOString(),
        "X-Markdown-Tokens": String(Math.ceil(llmsTxt.mdContent.length / 4)),
      },
    });
  }),
});

// Canonical profile-style llms path: /:username/llms.txt
cors.route({
  path: "/:username/llms.txt",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[1];

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const llmsTxt = await ctx.runQuery(api.functions.llmsTxt.getByUsername, {
      username,
    });

    if (!llmsTxt) {
      return new Response("# No agents found\n\nThis user has not set up any public agents yet.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(llmsTxt.txtContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Generated-At": new Date(llmsTxt.generatedAt).toISOString(),
      },
    });
  }),
});

// Canonical profile-style llms path: /:username/llms-full.md
cors.route({
  path: "/:username/llms-full.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[1];

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const llmsTxt = await ctx.runQuery(api.functions.llmsTxt.getByUsername, {
      username,
    });

    if (!llmsTxt) {
      return new Response("# No agents found\n\nThis user has not set up any public agents yet.", {
        status: 404,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return new Response(llmsTxt.mdContent, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Generated-At": new Date(llmsTxt.generatedAt).toISOString(),
        "X-Markdown-Tokens": String(Math.ceil(llmsTxt.mdContent.length / 4)),
      },
    });
  }),
});

// Also serve at /@username/llms.txt for backwards compatibility
cors.route({
  path: "/@:username/llms.txt",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    // Extract username after @
    const pathPart = url.pathname.split("/")[1];
    const username = pathPart?.startsWith("@") ? pathPart.slice(1) : pathPart;

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const llmsTxt = await ctx.runQuery(api.functions.llmsTxt.getByUsername, {
      username,
    });

    if (!llmsTxt) {
      return new Response("# No agents found\n\nThis user has not set up any public agents yet.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(llmsTxt.txtContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Generated-At": new Date(llmsTxt.generatedAt).toISOString(),
      },
    });
  }),
});

// Also serve at /@username/llms-full.md for backwards compatibility
cors.route({
  path: "/@:username/llms-full.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pathPart = url.pathname.split("/")[1];
    const username = pathPart?.startsWith("@") ? pathPart.slice(1) : pathPart;

    if (!username) {
      return new Response("Username required", { status: 400 });
    }

    const llmsTxt = await ctx.runQuery(api.functions.llmsTxt.getByUsername, {
      username,
    });

    if (!llmsTxt) {
      return new Response("# No agents found\n\nThis user has not set up any public agents yet.", {
        status: 404,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    return new Response(llmsTxt.mdContent, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Generated-At": new Date(llmsTxt.generatedAt).toISOString(),
        "X-Markdown-Tokens": String(Math.ceil(llmsTxt.mdContent.length / 4)),
      },
    });
  }),
});

// ============================================================
// Helpers
// ============================================================

function verifyWebhookSignature(
  _body: string,
  signature: string
): boolean {
  // TODO: Implement HMAC-SHA256 verification with AGENTMAIL_WEBHOOK_SECRET
  // For now, check that signature exists (placeholder)
  return signature.length > 0;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface PublicSkill {
  identity: { name: string; bio: string };
  capabilities: Array<{ name: string; description: string }>;
  knowledgeDomains: string[];
  communicationPrefs: { tone: string; timezone: string; availability: string };
}

function skillToMarkdown(skill: PublicSkill, username: string): string {
  const caps = skill.capabilities
    .map((c) => `- **${c.name}**: ${c.description}`)
    .join("\n");

  return `# ${skill.identity.name}

${skill.identity.bio}

## Capabilities

${caps || "No capabilities listed yet."}

## Knowledge domains

${skill.knowledgeDomains.join(", ") || "None listed."}

## Communication

- Tone: ${skill.communicationPrefs.tone}
- Timezone: ${skill.communicationPrefs.timezone}
- Availability: ${skill.communicationPrefs.availability}

## Contact

- API: \`POST https://humanai.gent/api/v1/agents/${username}/messages\`
- Email: ${username}@humanai.gent
- Agent Page: https://humanai.gent/${username}
`;
}

export default http;
