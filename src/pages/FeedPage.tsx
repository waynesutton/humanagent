import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { Id } from "../../convex/_generated/dataModel";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { FeedTimelineItem, type FeedTimelineItemData } from "../components/feed/FeedTimelineItem";
import { notify } from "../lib/notify";
import { platformApi } from "../lib/platformApi";

type FeedItem = FeedTimelineItemData & { 
  isPublic: boolean;
  type: string;
  isHidden?: boolean;
  isArchived?: boolean;
};

export function FeedPage() {
  const feedItems = useQuery(platformApi.convex.feed.getMyFeed, { limit: 50 });
  const viewer = useQuery(platformApi.convex.auth.viewer);
  
  // Mutations
  const createPost = useMutation(platformApi.convex.feed.createPost);
  const updatePost = useMutation(platformApi.convex.feed.updatePost);
  const hidePost = useMutation(platformApi.convex.feed.hidePost);
  const archivePost = useMutation(platformApi.convex.feed.archivePost);
  const deletePost = useMutation(platformApi.convex.feed.deletePost);

  // New post form state
  const [showNewPost, setShowNewPost] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [posting, setPosting] = useState(false);

  // Edit modal state
  const [editingItem, setEditingItem] = useState<FeedItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Delete confirmation state
  const [deletingItemId, setDeletingItemId] = useState<Id<"feedItems"> | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      notify.success("Post created");
    } catch (error) {
      notify.error("Could not create post", error);
    } finally {
      setPosting(false);
    }
  }

  // Open edit modal
  function openEdit(item: FeedItem) {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditContent(item.content || "");
    setEditIsPublic(item.isPublic);
  }

  // Save edit
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem || !editTitle.trim()) return;

    setUpdating(true);
    try {
      await updatePost({
        feedItemId: editingItem._id as Id<"feedItems">,
        title: editTitle.trim(),
        content: editContent.trim() || undefined,
        isPublic: editIsPublic,
      });
      setEditingItem(null);
      notify.success("Post updated");
    } catch (error) {
      notify.error("Could not update post", error);
    } finally {
      setUpdating(false);
    }
  }

  // Hide post
  async function handleHide(itemId: Id<"feedItems">) {
    try {
      await hidePost({ feedItemId: itemId });
      notify.success("Post hidden");
    } catch (error) {
      notify.error("Could not hide post", error);
    }
  }

  // Archive post
  async function handleArchive(itemId: Id<"feedItems">) {
    try {
      await archivePost({ feedItemId: itemId });
      notify.success("Post archived");
    } catch (error) {
      notify.error("Could not archive post", error);
    }
  }

  // Delete post
  async function handleDelete() {
    if (!deletingItemId) return;

    setDeleting(true);
    try {
      await deletePost({ feedItemId: deletingItemId });
      setDeletingItemId(null);
      notify.success("Post deleted");
    } catch (error) {
      notify.error("Could not delete post", error);
    } finally {
      setDeleting(false);
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
                placeholder="Content (optional, Markdown and MDX supported)"
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
                  trailing={
                    <FeedItemActions
                      item={item}
                      onEdit={() => openEdit(item)}
                      onHide={() => handleHide(item._id as Id<"feedItems">)}
                      onArchive={() => handleArchive(item._id as Id<"feedItems">)}
                      onDelete={() => setDeletingItemId(item._id as Id<"feedItems">)}
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-lg animate-fade-in card">
              <h2 className="font-medium text-ink-0">Edit post</h2>
              <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title"
                  className="input"
                  autoFocus
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Content (optional, Markdown and MDX supported)"
                  className="input resize-none"
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-ink-1">
                    <input
                      type="checkbox"
                      checked={editIsPublic}
                      onChange={(e) => setEditIsPublic(e.target.checked)}
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
                      onClick={() => setEditingItem(null)}
                      className="btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updating || !editTitle.trim()}
                      className="btn-accent text-sm"
                    >
                      {updating ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingItemId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm animate-fade-in card">
              <h2 className="font-medium text-ink-0">Delete post?</h2>
              <p className="mt-2 text-sm text-ink-1">
                This action cannot be undone. The post will be permanently deleted.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingItemId(null)}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-accent bg-red-600 text-sm hover:bg-red-700"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Action menu component for feed items
function FeedItemActions({
  item,
  onEdit,
  onHide,
  onArchive,
  onDelete,
}: {
  item: FeedItem;
  onEdit: () => void;
  onHide: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const canEdit = item.type === "manual_post";

  return (
    <div className="relative ml-auto" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1 text-ink-2 transition-colors hover:text-ink-0"
        aria-label="Post actions"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-10 min-w-[140px] border border-surface-3 bg-surface-0 py-1 shadow-lg">
          {canEdit && (
            <button
              type="button"
              onClick={() => { onEdit(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-1 hover:bg-surface-1"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => { onHide(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-1 hover:bg-surface-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
            Hide
          </button>
          <button
            type="button"
            onClick={() => { onArchive(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-1 hover:bg-surface-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            Archive
          </button>
          <button
            type="button"
            onClick={() => { onDelete(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-500 hover:bg-surface-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

