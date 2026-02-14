import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { FeedTimelineItem, type FeedTimelineItemData } from "../components/feed/FeedTimelineItem";

type FeedItem = FeedTimelineItemData & { isPublic: boolean };

export function FeedPage() {
  const feedItems = useQuery(api.functions.feed.getMyFeed, { limit: 50 });
  const viewer = useQuery(api.functions.users.viewer);
  const createPost = useMutation(api.functions.feed.createPost);

  const [showNewPost, setShowNewPost] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [posting, setPosting] = useState(false);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setPosting(true);
    try {
      await createPost({
        title: title.trim(),
        content: content.trim() || undefined,
        isPublic,
      });
      setTitle("");
      setContent("");
      setShowNewPost(false);
    } finally {
      setPosting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Activity Feed</h1>
            <p className="mt-1 text-ink-1">
              Your agent's activity and public updates.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {viewer?.username && (
              <a
                href={`/${viewer.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Public feed
              </a>
            )}
            <button
              onClick={() => setShowNewPost(!showNewPost)}
              className="btn-accent"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New post
            </button>
          </div>
        </div>

        {/* New post form */}
        {showNewPost && (
          <form onSubmit={handlePost} className="mt-6 card">
            <h2 className="font-medium text-ink-0">Create a post</h2>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="input"
                autoFocus
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Content (optional)"
                className="input resize-none"
                rows={3}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-1" title="If checked, visible on your public profile">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="h-4 w-4 rounded border-surface-3 accent-accent"
                  />
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Visible on profile
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewPost(false)}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={posting || !title.trim()}
                    className="btn-accent text-sm"
                  >
                    {posting ? "Posting..." : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Feed */}
        <div className="mt-6">
          {feedItems === undefined ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : feedItems.length === 0 ? (
            <div className="card py-12 text-center">
              <svg className="mx-auto h-10 w-10 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-3 text-sm text-ink-1">No activity yet</p>
              <p className="mt-1 text-xs text-ink-2">
                Activity from your agent will appear here
              </p>
            </div>
          ) : (
            <div className="border border-surface-3 bg-surface-0">
              {feedItems.map((item: FeedItem) => (
                <FeedTimelineItem
                  key={item._id}
                  item={item}
                  actorName={viewer?.name ?? viewer?.username ?? "You"}
                  actorUsername={viewer?.username ?? "you"}
                  actorImage={viewer?.image}
                  visibility={item.isPublic ? "public" : "private"}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

