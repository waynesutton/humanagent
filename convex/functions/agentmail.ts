"use node";

import { AgentMailClient } from "agentmail";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

type DecryptedCredential = {
  apiKey?: string;
};

// Convert inline markdown to HTML (bold, italic, code, links)
function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

// Convert plain text + basic markdown to HTML for email clients
function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const parts: string[] = [];
  let inList = false;

  for (const line of lines) {
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    const li = line.match(/^[-*] (.+)/);
    const hr = /^---+$/.test(line.trim());

    if (h1 || h2 || h3) {
      if (inList) { parts.push("</ul>"); inList = false; }
      const tag = h1 ? "h1" : h2 ? "h2" : "h3";
      const content = (h1?.[1] ?? h2?.[1] ?? h3?.[1])!;
      parts.push(`<${tag}>${inlineMarkdown(content)}</${tag}>`);
    } else if (li) {
      if (!inList) { parts.push("<ul>"); inList = true; }
      parts.push(`<li>${inlineMarkdown(li[1] ?? "")}</li>`);
    } else if (hr) {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push("<hr/>");
    } else if (line.trim() === "") {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push("");
    } else {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  if (inList) parts.push("</ul>");
  return parts.join("\n");
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

export const sendMessage = internalAction({
  args: {
    userId: v.id("users"),
    inboxAddress: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
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
      if (args.taskId) {
        await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
          taskId: args.taskId,
          status: "failed",
          error:
            "AgentMail API key missing. Configure agentmail in Settings or AGENTMAIL_API_KEY in env.",
        });
      }
      return {
        sent: false,
        error:
          "AgentMail API key missing. Configure agentmail in Settings or AGENTMAIL_API_KEY in env.",
      };
    }

    const inboxAddress = args.inboxAddress.trim().toLowerCase();
    const to = args.to.trim().toLowerCase();
    if (!inboxAddress) {
      if (args.taskId) {
        await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
          taskId: args.taskId,
          status: "failed",
          error: "Inbox address is required for AgentMail send.",
        });
      }
      return { sent: false, error: "Inbox address is required for AgentMail send." };
    }
    if (!to) {
      if (args.taskId) {
        await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
          taskId: args.taskId,
          status: "failed",
          error: "Recipient email is required for AgentMail send.",
        });
      }
      return { sent: false, error: "Recipient email is required for AgentMail send." };
    }

    try {
      const client = new AgentMailClient({ apiKey });
      const response = await client.inboxes.messages.send(inboxAddress, {
        to: [to],
        subject: args.subject,
        text: args.text,
        html: args.html ?? toHtml(args.text),
      });

      if (userCredential?.apiKey) {
        await ctx.runMutation(internal.functions.credentials.markUsed, {
          userId: args.userId,
          service: "agentmail",
        });
      }
      if (args.taskId) {
        await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
          taskId: args.taskId,
          status: "sent",
        });
      }

      return {
        sent: true,
        messageId: response.messageId,
        threadId: response.threadId,
      };
    } catch (error) {
      if (args.taskId) {
        await ctx.runMutation(internal.functions.board.setOutcomeEmailDelivery, {
          taskId: args.taskId,
          status: "failed",
          error:
            error instanceof Error ? error.message : "Failed to send AgentMail message.",
        });
      }
      return {
        sent: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send AgentMail message.",
      };
    }
  },
});
