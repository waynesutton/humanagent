import type { ReactNode } from "react";

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
            <p className={`mt-1 whitespace-pre-wrap text-sm text-ink-1 ${truncate ? "truncate" : ""}`}>
              {item.content}
            </p>
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
