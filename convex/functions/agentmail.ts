"use node";

import { AgentMailClient } from "agentmail";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

type DecryptedCredential = {
  apiKey?: string;
};

function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
}

export const replyToMessage = internalAction({
  args: {
    userId: v.id("users"),
    inboxAddress: v.string(),
    messageId: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
  },
  returns: v.object({
    sent: v.boolean(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const userCredential = (await ctx.runQuery(
      internal.functions.credentials.getDecryptedApiKey,
      { userId: args.userId, service: "agentmail" }
    )) as DecryptedCredential | null;

    const apiKey = userCredential?.apiKey ?? process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      return {
        sent: false,
        error:
          "AgentMail API key missing. Configure agentmail in Settings or AGENTMAIL_API_KEY in env.",
      };
    }

    const inboxAddress = args.inboxAddress.trim().toLowerCase();
    if (!inboxAddress) {
      return { sent: false, error: "Inbox address is required for AgentMail reply." };
    }

    try {
      const client = new AgentMailClient({ apiKey });
      const response = await client.inboxes.messages.reply(
        inboxAddress,
        args.messageId,
        {
          text: args.text,
          html: args.html ?? toHtml(args.text),
        }
      );

      if (userCredential?.apiKey) {
        await ctx.runMutation(internal.functions.credentials.markUsed, {
          userId: args.userId,
          service: "agentmail",
        });
      }

      return {
        sent: true,
        messageId: response.messageId,
        threadId: response.threadId,
      };
    } catch (error) {
      return {
        sent: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send AgentMail reply.",
      };
    }
  },
});
