import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY_MS = 30_000;

export const enqueueAgentmailRetry = internalMutation({
  args: {
    payload: v.string(),
    lastError: v.string(),
  },
  returns: v.id("webhookRetries"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("webhookRetries", {
      provider: "agentmail",
      payload: args.payload,
      attempts: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      nextAttemptAt: Date.now() + INITIAL_RETRY_DELAY_MS,
      status: "pending",
      lastError: args.lastError,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listDueAgentmailRetries = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const now = Date.now();
    const records = await ctx.db
      .query("webhookRetries")
      .withIndex("by_provider_status_nextAttemptAt", (q) =>
        q
          .eq("provider", "agentmail")
          .eq("status", "pending")
          .lte("nextAttemptAt", now)
      )
      .take(100);
    return records;
  },
});

export const markRetrySucceeded = internalMutation({
  args: { retryId: v.id("webhookRetries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.retryId, {
      status: "completed",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markRetryFailed = internalMutation({
  args: {
    retryId: v.id("webhookRetries"),
    attempts: v.number(),
    maxAttempts: v.number(),
    lastError: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const shouldRetry = args.attempts < args.maxAttempts;
    const backoffMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, args.attempts);
    await ctx.db.patch(args.retryId, {
      attempts: args.attempts,
      status: shouldRetry ? "pending" : "failed",
      nextAttemptAt: shouldRetry ? Date.now() + backoffMs : undefined,
      lastError: args.lastError,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const retryAgentmailWebhooks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const retries = (await ctx.runQuery(
      internal.functions.webhooks.listDueAgentmailRetries
    )) as Array<{
      _id: Id<"webhookRetries">;
      payload: string;
      attempts: number;
      maxAttempts: number;
    }>;

    for (const retry of retries) {
      try {
        await processAgentmailEventPayload(ctx, retry.payload);
        await ctx.runMutation(internal.functions.webhooks.markRetrySucceeded, {
          retryId: retry._id,
        });
      } catch (error) {
        await ctx.runMutation(internal.functions.webhooks.markRetryFailed, {
          retryId: retry._id,
          attempts: retry.attempts + 1,
          maxAttempts: retry.maxAttempts,
          lastError:
            error instanceof Error ? error.message : "AgentMail retry failed.",
        });
      }
    }

    return null;
  },
});

async function processAgentmailEventPayload(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "runAction">,
  payload: string
) {
  const event = JSON.parse(payload) as {
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
      throw new Error("Invalid recipient");
    }

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
      if (!toUsername) throw new Error("Invalid recipient username");
      const user = await ctx.runQuery(api.functions.users.getByUsername, {
        username: toUsername,
      });
      if (!user) throw new Error("Agent not found");
      userId = user._id;
    }

    const from = (
      event.message?.from?.[0]?.email ??
      event.from ??
      ""
    ).trim();
    const subject = (event.message?.subject ?? event.subject ?? "").trim();
    const inboundText = (event.message?.text ?? event.text ?? "").trim();
    const inboundBody =
      inboundText || (event.message?.html ?? event.html ?? "").trim();
    if (!from || !inboundBody) throw new Error("Invalid payload");

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
    const inboundMessage = `Email from ${from}\nSubject: ${
      subject || "(no subject)"
    }\n\n${inboundBody}`;

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
      const agentmailReply = internal.functions.agentmail.replyToMessage;
      const sendResult = await ctx.runAction(agentmailReply, {
        userId,
        inboxAddress: recipientEmail,
        messageId: inboundMessageId,
        text: result.response,
      });
      outboundSent = sendResult.sent;
      outboundError = sendResult.error;

      await ctx.runMutation(
        internal.functions.conversations.updateEmailChannelMetadata,
        {
          conversationId,
          inboxAddress: recipientEmail,
          inboxId: inboundInboxId,
          from,
          subject: subject || undefined,
          threadId: sendResult.threadId ?? inboundThreadId,
          lastMessageId: sendResult.messageId ?? inboundMessageId,
          deliveryStatus: sendResult.sent ? "sent" : "received",
          lastEventType: sendResult.sent ? "message.sent" : "message.received",
          lastEventAt: Date.now(),
        }
      );
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
    return;
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
    if (!threadId) return;

    const conversation = await ctx.runQuery(
      internal.functions.conversations.getByChannelAndExternalId,
      {
        channel: "email",
        externalId: threadId,
      }
    );
    if (!conversation) return;

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
      content: recipients.length > 0 ? `Recipients: ${recipients.join(", ")}` : undefined,
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
  }
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
