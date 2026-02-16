import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { auth } from "./auth";
import { corsRouter } from "convex-helpers/server/cors";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

// Auth routes (OAuth callbacks, JWKS, portal) on raw router
auth.addHttpRoutes(http);

// CORS-enabled router for public API routes
const cors = corsRouter(http, {
  allowedOrigins: ["*"],
  allowedHeaders: ["Content-Type", "Authorization"],
  allowCredentials: false,
});

// Basic service health check endpoint for external monitoring.
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "humanagent",
        timestamp: Date.now(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }),
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
        return apiError(400, "invalid_request", "Username required");
      }

      // Validate API key (fail closed)
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return apiError(401, "auth_required", "Bearer token required");
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

      // Reject invalid or expired keys
      if (!apiKey) {
        return apiError(401, "invalid_token", "API key is invalid, revoked, or expired");
      }

      // Look up user
      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username,
      });
      if (!user) {
        return apiError(404, "not_found", "Agent not found");
      }

      const defaultPublicAgent = await ctx.runQuery(
        api.functions.agents.getPublicDefaultByUsername,
        { username }
      );
      if (!defaultPublicAgent) {
        return apiError(404, "not_found", "No public agent configured for this user");
      }

      // Parse body
      const body = (await request.json()) as { content?: string };
      if (!body.content) {
        return apiError(400, "invalid_request", "content field required");
      }

      // Process message
      const result = await ctx.runAction(
        internal.agent.runtime.processMessage,
        {
          userId: user._id,
          agentId: defaultPublicAgent._id,
          message: body.content,
          channel: "api",
          callerId: apiKey.keyPrefix,
        }
      );

      return new Response(JSON.stringify(result), {
        status: result.blocked ? 400 : 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return apiError(500, "internal_error", String(error));
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
        return apiError(400, "invalid_request", "Username and slug are required");
      }

      // Validate API key (fail closed)
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return apiError(401, "auth_required", "Bearer token required");
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

      // Reject invalid or expired keys
      if (!apiKey) {
        return apiError(401, "invalid_token", "API key is invalid, revoked, or expired");
      }

      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username,
      });
      if (!user) {
        return apiError(404, "not_found", "Agent not found");
      }

      const publicAgent = await ctx.runQuery(
        api.functions.agents.getPublicByUsernameAndSlug,
        { username, slug }
      );
      if (!publicAgent) {
        return apiError(404, "not_found", "Public agent not found for this slug");
      }

      const body = (await request.json()) as { content?: string };
      if (!body.content) {
        return apiError(400, "invalid_request", "content field required");
      }

      const result = await ctx.runAction(
        internal.agent.runtime.processMessage,
        {
          userId: user._id,
          agentId: publicAgent._id,
          message: body.content,
          channel: "api",
          callerId: apiKey.keyPrefix,
        }
      );

      return new Response(JSON.stringify(result), {
        status: result.blocked ? 400 : 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return apiError(500, "internal_error", String(error));
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
      return apiError(400, "invalid_request", "Username required");
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
      return apiError(404, "not_found", "Agent not found or not published");
    }

    // Content negotiation: markdown for agents, JSON for APIs
    const accept = request.headers.get("Accept") ?? "";
    if (accept.includes("text/markdown")) {
      const md = skillToMarkdown(skill, username);
      return new Response(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Vary": "Accept",
          "Cache-Control": "public, max-age=300",
          "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
        },
      });
    }

    return new Response(JSON.stringify(skill), {
      headers: {
        "Content-Type": "application/json",
        "Vary": "Accept",
        "Cache-Control": "public, max-age=300",
      },
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
      return apiError(400, "invalid_request", "Username and slug are required");
    }

    const skill = await ctx.runQuery(api.functions.skills.getPublicSkillByAgent, {
      username,
      slug,
    });

    if (!skill) {
      return apiError(404, "not_found", "Agent not found or not published");
    }

    // Content negotiation: markdown for agents, JSON for APIs
    const accept = request.headers.get("Accept") ?? "";
    if (accept.includes("text/markdown")) {
      const md = skillToMarkdown(skill, username);
      return new Response(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Vary": "Accept",
          "Cache-Control": "public, max-age=300",
          "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
        },
      });
    }

    return new Response(JSON.stringify(skill), {
      headers: {
        "Content-Type": "application/json",
        "Vary": "Accept",
        "Cache-Control": "public, max-age=300",
      },
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
    if (!signature || !(await verifyWebhookSignature(body, signature))) {
      // Skip audit log for invalid webhooks (no user context)
      console.log("AgentMail webhook rejected: invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    try {
      const event = JSON.parse(body) as {
        type?: string;
        event_type?: string;
        to?: string;
        from?: string;
        subject?: string;
        text?: string;
        html?: string;
        messageId?: string;
        threadId?: string;
        message?: {
          inbox_id?: string;
          thread_id?: string;
          message_id?: string;
          from?: Array<{ email?: string; name?: string }>;
          to?: Array<{ email?: string; name?: string }>;
          subject?: string;
          text?: string;
          html?: string;
          timestamp?: string;
        };
        send?: {
          inbox_id?: string;
          thread_id?: string;
          message_id?: string;
          timestamp?: string;
          recipients?: Array<string>;
        };
        delivery?: {
          inbox_id?: string;
          thread_id?: string;
          message_id?: string;
          timestamp?: string;
          recipients?: Array<string>;
        };
        bounce?: {
          inbox_id?: string;
          thread_id?: string;
          message_id?: string;
          timestamp?: string;
          type?: string;
          sub_type?: string;
          recipients?: Array<{ address?: string; status?: string }>;
        };
      };
      const eventType = (event.event_type ?? event.type ?? "").trim();

      if (eventType === "message.received") {
        const recipientEmail = normalizeEmailAddress(
          event.message?.to?.[0]?.email ?? event.to
        );
        if (!recipientEmail) {
          return new Response("Invalid recipient", { status: 400 });
        }

        // Resolve by agent email first, then fallback to username local-part.
        const agent = await ctx.runQuery(internal.functions.agents.getByEmail, {
          email: recipientEmail,
        });

        let userId: Id<"users">;
        let agentId: Id<"agents"> | undefined;
        if (agent) {
          userId = agent.userId;
          agentId = agent._id;
        } else {
          const toUsername = extractLocalPart(recipientEmail);
          if (!toUsername) {
            return new Response("Invalid recipient", { status: 400 });
          }
          const user = await ctx.runQuery(api.functions.users.getByUsername, {
            username: toUsername,
          });
          if (!user) {
            return new Response("Agent not found", { status: 404 });
          }
          userId = user._id;
        }

        const from = (
          event.message?.from?.[0]?.email ??
          event.from ??
          ""
        ).trim();
        const subject = (event.message?.subject ?? event.subject ?? "").trim();
        const inboundText = (event.message?.text ?? event.text ?? "").trim();
        const inboundBody = inboundText || (event.message?.html ?? event.html ?? "").trim();
        if (!from || !inboundBody) {
          return new Response("Invalid payload", { status: 400 });
        }

        const inboundThreadId = event.message?.thread_id ?? event.threadId;
        const inboundMessageId = event.message?.message_id ?? event.messageId;
        const inboundInboxId = event.message?.inbox_id;
        const externalId = inboundThreadId ?? inboundMessageId ?? from;
        const emailChannelMetadata = {
          email: {
            from,
            inboxAddress: recipientEmail,
            inboxId: inboundInboxId,
            subject: subject || undefined,
            threadId: inboundThreadId,
            lastMessageId: inboundMessageId,
            deliveryStatus: "received" as const,
            lastEventType: "message.received",
            lastEventAt: parseEventTimestampMs(event.message?.timestamp),
          },
        };
        const inboundMessage = `Email from ${from}\nSubject: ${subject || "(no subject)"}\n\n${inboundBody}`;

        const conversationId = await ctx.runMutation(
          internal.functions.conversations.create,
          {
            userId,
            channel: "email",
            externalId,
            initialMessage: inboundMessage,
            channelMetadata: emailChannelMetadata,
          }
        );

        // Process the email as an inbound message
        const result = await ctx.runAction(internal.agent.runtime.processMessage, {
          userId,
          agentId,
          message: inboundMessage,
          channel: "email",
          callerId: from,
        });

        await ctx.runMutation(internal.functions.conversations.addAgentResponse, {
          conversationId,
          content: result.response,
        });

        let outboundSent = false;
        let outboundError: string | undefined;
        if (inboundMessageId) {
          const agentmailReply = (internal as Record<string, any>)["functions/agentmail"]
            .replyToMessage;
          const sendResult = await ctx.runAction(
            agentmailReply,
            {
              userId,
              inboxAddress: recipientEmail,
              messageId: inboundMessageId,
              text: result.response,
            }
          );
          outboundSent = sendResult.sent;
          outboundError = sendResult.error;

          await ctx.runMutation(internal.functions.conversations.updateEmailChannelMetadata, {
            conversationId,
            inboxAddress: recipientEmail,
            inboxId: inboundInboxId,
            from,
            subject: subject || undefined,
            threadId: sendResult.threadId ?? inboundThreadId,
            lastMessageId: sendResult.messageId ?? inboundMessageId,
            deliveryStatus: sendResult.sent ? "sent" : "received",
            lastEventType: sendResult.sent
              ? "message.sent"
              : "message.received",
            lastEventAt: Date.now(),
          });
        } else {
          outboundError = "Inbound event missing messageId; outbound reply skipped.";
        }

        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId,
          type: "message_handled",
          title: "Email received",
          content: subject ? `From ${from}: ${subject}` : `From ${from}`,
          metadata: {
            channel: "email",
            blocked: result.blocked,
            externalId,
            outboundSent,
            outboundError,
          },
          isPublic: false,
        });

        return new Response("OK", { status: 200 });
      }

      if (
        eventType === "message.sent" ||
        eventType === "message.delivered" ||
        eventType === "message.bounced"
      ) {
        const details =
          eventType === "message.sent"
            ? event.send
            : eventType === "message.delivered"
              ? event.delivery
              : event.bounce;
        const threadId = details?.thread_id;
        const messageId = details?.message_id;
        if (!threadId) {
          return new Response("Ignored event without thread", { status: 200 });
        }

        const conversation = await ctx.runQuery(
          internal.functions.conversations.getByChannelAndExternalId,
          {
            channel: "email",
            externalId: threadId,
          }
        );
        if (!conversation) {
          return new Response("No matching conversation", { status: 200 });
        }

        const recipients = extractEventRecipients(eventType, event);
        const deliveryStatus =
          eventType === "message.bounced"
            ? "bounced"
            : eventType === "message.delivered"
              ? "delivered"
              : "sent";
        const status = eventType === "message.bounced" ? "escalated" : undefined;

        await ctx.runMutation(internal.functions.conversations.updateEmailChannelMetadata, {
          conversationId: conversation._id,
          inboxId: details?.inbox_id,
          threadId,
          lastMessageId: messageId,
          deliveryStatus,
          lastEventType: eventType,
          lastEventAt: parseEventTimestampMs(details?.timestamp),
          lastRecipients: recipients,
          lastBounceType: event.bounce?.type,
          lastBounceSubType: event.bounce?.sub_type,
          status,
        });

        await ctx.runMutation(internal.functions.feed.maybeCreateItem, {
          userId: conversation.userId,
          type: "integration_action",
          title:
            eventType === "message.sent"
              ? "Email sent"
              : eventType === "message.delivered"
                ? "Email delivered"
                : "Email bounced",
          content:
            recipients.length > 0
              ? `Recipients: ${recipients.join(", ")}`
              : undefined,
          metadata: {
            channel: "email",
            eventType,
            threadId,
            messageId,
            recipients,
            bounceType: event.bounce?.type,
            bounceSubType: event.bounce?.sub_type,
          },
          isPublic: false,
        });

        return new Response("OK", { status: 200 });
      }

      return new Response("Ignored event type", { status: 200 });
    } catch (error) {
      await ctx.runMutation(internal.functions.webhooks.enqueueAgentmailRetry, {
        payload: body,
        lastError:
          error instanceof Error ? error.message : "AgentMail webhook processing failed.",
      });
      return new Response("Queued for retry", { status: 202 });
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
// Agent Docs: sitemap.md, docs.md, tools.md, openapi.json
// ============================================================

cors.route({
  path: "/:username/sitemap.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[1];
    if (!username) {
      return apiError(400, "invalid_request", "Username required");
    }

    const payload = await ctx.runQuery(api.functions.agentDocs.getDocsPayload, { username });
    if (!payload) {
      return apiError(404, "not_found", "Agent not found or profile hidden");
    }

    const { renderSitemapMd } = await import("./functions/agentDocs");
    const md = renderSitemapMd(payload);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
      },
    });
  }),
});

cors.route({
  path: "/api/v1/agents/:username/docs.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[4];
    if (!username) {
      return apiError(400, "invalid_request", "Username required");
    }

    const payload = await ctx.runQuery(api.functions.agentDocs.getDocsPayload, { username });
    if (!payload) {
      return apiError(404, "not_found", "Agent not found or profile hidden");
    }

    const { renderDocsMd } = await import("./functions/agentDocs");
    const md = renderDocsMd(payload);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
      },
    });
  }),
});

cors.route({
  path: "/api/v1/agents/:username/tools.md",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[4];
    if (!username) {
      return apiError(400, "invalid_request", "Username required");
    }

    const payload = await ctx.runQuery(api.functions.agentDocs.getDocsPayload, { username });
    if (!payload) {
      return apiError(404, "not_found", "Agent not found or profile hidden");
    }

    const { renderToolsMd } = await import("./functions/agentDocs");
    const md = renderToolsMd(payload);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Markdown-Tokens": String(Math.ceil(md.length / 4)),
      },
    });
  }),
});

cors.route({
  path: "/api/v1/agents/:username/openapi.json",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const username = url.pathname.split("/")[4];
    if (!username) {
      return apiError(400, "invalid_request", "Username required");
    }

    const payload = await ctx.runQuery(api.functions.agentDocs.getDocsPayload, { username });
    if (!payload) {
      return apiError(404, "not_found", "Agent not found or profile hidden");
    }

    const { renderOpenApiJson } = await import("./functions/agentDocs");
    const spec = renderOpenApiJson(payload);
    return new Response(JSON.stringify(spec, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }),
});

// ============================================================
// Helpers
// ============================================================

// Stable API error envelope returned by all public endpoints
function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...extra } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return false;

  const normalized = signature.trim().replace(/^sha256=/i, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedHex = bytesToHex(new Uint8Array(digest));

  const providedHex = isHex(normalized)
    ? normalized.toLowerCase()
    : bytesToHex(decodeBase64(normalized));

  if (!providedHex) return false;
  return timingSafeEqualHex(expectedHex, providedHex);
}

function isHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0;
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function normalizeEmailAddress(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  return (bracketMatch?.[1] ?? trimmed).trim().toLowerCase();
}

function extractLocalPart(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "";
  return email.slice(0, atIndex).trim().toLowerCase();
}

function parseEventTimestampMs(value?: string): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function extractEventRecipients(
  eventType: string,
  event: {
    send?: { recipients?: Array<string> };
    delivery?: { recipients?: Array<string> };
    bounce?: { recipients?: Array<{ address?: string; status?: string }> };
  }
): Array<string> {
  if (eventType === "message.sent") {
    return (event.send?.recipients ?? []).filter(Boolean);
  }
  if (eventType === "message.delivered") {
    return (event.delivery?.recipients ?? []).filter(Boolean);
  }
  if (eventType === "message.bounced") {
    return (event.bounce?.recipients ?? [])
      .map((recipient) => recipient.address ?? "")
      .filter(Boolean);
  }
  return [];
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
