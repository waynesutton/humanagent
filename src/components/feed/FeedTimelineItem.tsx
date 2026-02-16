import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

export type FeedTimelineItemData = {
  _id: string;
  type: string;
  title: string;
  content?: string;
  createdAt: number;
};

export function FeedTimelineItem({
  item,
  actorName,
  actorUsername,
  actorImage,
  visibility,
  truncate,
  trailing,
}: {
  item: FeedTimelineItemData;
  actorName: string;
  actorUsername: string;
  actorImage?: string;
  visibility?: "public" | "private";
  truncate?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="border-b border-surface-3 p-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <MiniAvatar image={actorImage} name={actorName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-ink-0">{actorName}</span>
            <span className="text-ink-2">@{actorUsername}</span>
            <span className="text-ink-2">·</span>
            <span className="text-ink-2">{formatRelativeTime(item.createdAt)}</span>
            <span className="border border-surface-3 px-1.5 py-0.5 text-[10px] text-ink-1">
              {formatFeedType(item.type)}
            </span>
            {visibility && (
              <span className={`border border-surface-3 px-1.5 py-0.5 text-[10px] ${visibility === "public" ? "text-ink-1" : "text-ink-2"}`}>
                {visibility}
              </span>
            )}
            {trailing}
          </div>
          <p className={`mt-2 text-sm text-ink-0 ${truncate ? "truncate" : ""}`}>{item.title}</p>
          {item.content && (
            truncate ? (
              <p className="mt-1 truncate text-sm text-ink-1">{toPreviewText(item.content)}</p>
            ) : (
              <div className="mt-1 text-sm text-ink-1">
                <SafeMarkdownContent content={item.content} />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function MiniAvatar({ image, name }: { image?: string; name: string }) {
  if (image) {
    return <img src={image} alt={name} className="h-8 w-8 border border-surface-3 object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center border border-surface-3 bg-surface-1 text-[11px] font-semibold text-ink-1">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatFeedType(type: string): string {
  const labels: Record<string, string> = {
    manual_post: "post",
    message_handled: "message",
    task_completed: "work",
    integration_action: "integration",
    status_update: "status",
  };
  return labels[type] ?? type;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return `${Math.floor(diff / day)}d`;
}

const safeMarkdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
  },
};

function toPreviewText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMdxToMarkdown(content: string): string {
  return content
    .replace(/^\s*(import|export)\s.+$/gm, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g, "`<$1 />`")
    .replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*>[\s\S]*?<\/\1>/g, (_match, componentName: string) => {
      return `\n\`\`\`mdx\n<${componentName}>...</${componentName}>\n\`\`\`\n`;
    });
}

function SafeMarkdownContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 whitespace-pre-wrap break-words [&_a]:text-ink-0 [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-surface-1 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-1 [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
      {/* Render markdown safely and degrade MDX JSX to inert text/code blocks. */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, safeMarkdownSchema]]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-0 underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {normalizeMdxToMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
