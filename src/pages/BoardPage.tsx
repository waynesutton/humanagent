import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { notify } from "../lib/notify";
import { platformApi } from "../lib/platformApi";

// Type aliases for cleaner code
type BoardColumn = Doc<"boardColumns">;
type Agent = Doc<"agents">;

// Task type with optional agentId
interface Task {
  _id: Id<"tasks">;
  description: string;
  status: string;
  boardColumnId?: Id<"boardColumns">;
  agentId?: Id<"agents">;
  requester?: {
    userId?: Id<"users">;
    username?: string;
    name?: string;
    agentName?: string;
  };
  isArchived?: boolean;
  archivedAt?: number;
  createdAt: number;
}

interface TaskComment {
  _id: Id<"taskComments">;
  content: string;
  createdAt: number;
}

interface TaskAttachment {
  _id: Id<"taskAttachments">;
  fileName: string;
  contentType?: string;
  size?: number;
  createdAt: number;
  url: string | null;
}


export function BoardPage() {
  const columns = useQuery(platformApi.convex.board.getColumns);
  const tasks = useQuery(platformApi.convex.board.getTasks);
  const archivedTasks = useQuery(platformApi.convex.board.getArchivedTasks);
  const agents = useQuery(platformApi.convex.agents.list);
  const createTask = useMutation(platformApi.convex.board.createTask);
  const moveTask = useMutation(platformApi.convex.board.moveTask);
  const updateTask = useMutation(platformApi.convex.board.updateTask);
  const deleteTask = useMutation(platformApi.convex.board.deleteTask);
  const archiveTask = useMutation(platformApi.convex.board.archiveTask);
  const unarchiveTask = useMutation(platformApi.convex.board.unarchiveTask);
  const archiveCompletedTasks = useMutation(platformApi.convex.board.archiveCompletedTasks);
  const deleteArchivedTasks = useMutation(platformApi.convex.board.deleteArchivedTasks);
  const addTaskComment = useMutation(platformApi.convex.board.addTaskComment);
  const generateTaskAttachmentUploadUrl = useMutation(
    platformApi.convex.board.generateTaskAttachmentUploadUrl
  );
  const addTaskAttachment = useMutation(platformApi.convex.board.addTaskAttachment);
  const ensureDefaultColumns = useMutation(platformApi.convex.board.ensureDefaultColumns);

  // Create task form
  const [newTaskText, setNewTaskText] = useState("");
  const [selectedColumn, setSelectedColumn] = useState<Id<"boardColumns"> | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Id<"agents"> | "none">("none");
  
  // Edit task
  const [editingTask, setEditingTask] = useState<Id<"tasks"> | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAgent, setEditAgent] = useState<Id<"agents"> | "none">("none");
  
  // Drag state
  const [draggingTask, setDraggingTask] = useState<Id<"tasks"> | null>(null);
  
  // Filter by agent
  const [filterAgent, setFilterAgent] = useState<Id<"agents"> | "all">("all");
  
  // Archive section expanded
  const [showArchive, setShowArchive] = useState(false);
  const [detailsTaskId, setDetailsTaskId] = useState<Id<"tasks"> | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const taskComments = useQuery(
    platformApi.convex.board.getTaskComments,
    detailsTaskId ? { taskId: detailsTaskId } : "skip"
  ) as TaskComment[] | undefined;
  const taskAttachments = useQuery(
    platformApi.convex.board.getTaskAttachments,
    detailsTaskId ? { taskId: detailsTaskId } : "skip"
  ) as TaskAttachment[] | undefined;

  useEffect(() => {
    if (!columns) return;
    const hasTodo = columns.some((column: BoardColumn) => column.name === "Todo");
    if (!hasTodo) {
      void ensureDefaultColumns({});
    }
  }, [columns, ensureDefaultColumns]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskText.trim() || !selectedColumn) return;
    try {
      await createTask({
        description: newTaskText.trim(),
        boardColumnId: selectedColumn,
        agentId: selectedAgent !== "none" ? selectedAgent : undefined,
      });
      setNewTaskText("");
      setSelectedColumn(null);
      setSelectedAgent("none");
      notify.success("Task created");
    } catch (error) {
      notify.error("Could not create task", error);
    }
  }

  function startEditingTask(task: Task) {
    setEditingTask(task._id);
    setEditDescription(task.description);
    setEditAgent(task.agentId ?? "none");
  }

  async function handleUpdateTask() {
    if (!editingTask) return;
    try {
      await updateTask({
        taskId: editingTask,
        description: editDescription.trim() || undefined,
        agentId: editAgent !== "none" ? editAgent : null,
      });
      setEditingTask(null);
      notify.success("Task updated");
    } catch (error) {
      notify.error("Could not update task", error);
    }
  }

  async function handleDeleteTask(taskId: Id<"tasks">) {
    notify.confirmAction({
      title: "Delete this task?",
      description: "This will permanently remove the task.",
      buttonTitle: "Delete",
      onConfirm: async () => {
        try {
          await deleteTask({ taskId });
          notify.success("Task deleted");
        } catch (error) {
          notify.error("Could not delete task", error);
        }
      },
    });
  }

  async function handleArchiveTask(taskId: Id<"tasks">) {
    try {
      await archiveTask({ taskId });
      notify.success("Task archived");
    } catch (error) {
      notify.error("Could not archive task", error);
    }
  }

  async function handleUnarchiveTask(taskId: Id<"tasks">) {
    try {
      await unarchiveTask({ taskId });
      notify.success("Task restored");
    } catch (error) {
      notify.error("Could not restore task", error);
    }
  }

  async function handleArchiveCompleted() {
    try {
      const count = await archiveCompletedTasks({});
      if (count > 0) {
        setShowArchive(true);
        notify.success("Completed tasks archived", `${count} archived.`);
      } else {
        notify.info("No completed tasks to archive");
      }
    } catch (error) {
      notify.error("Could not archive completed tasks", error);
    }
  }

  async function handleDeleteAllArchived() {
    notify.confirmAction({
      title: "Delete all archived tasks?",
      description: "This cannot be undone.",
      buttonTitle: "Delete all",
      onConfirm: async () => {
        try {
          await deleteArchivedTasks({});
          notify.success("Archived tasks deleted");
        } catch (error) {
          notify.error("Could not delete archived tasks", error);
        }
      },
    });
  }

  async function handleAddComment() {
    if (!detailsTaskId || !newCommentText.trim()) return;
    try {
      await addTaskComment({
        taskId: detailsTaskId,
        content: newCommentText.trim(),
      });
      setNewCommentText("");
      notify.success("Comment added");
    } catch (error) {
      notify.error("Could not add comment", error);
    }
  }

  async function handleUploadAttachment(file: File | null, input: HTMLInputElement) {
    if (!detailsTaskId || !file) return;
    setUploadingAttachment(true);
    try {
      const uploadUrl = await generateTaskAttachmentUploadUrl({});
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResult.ok) {
        throw new Error("Upload failed");
      }
      const json = (await uploadResult.json()) as { storageId?: string };
      if (!json.storageId) {
        throw new Error("Missing storage id");
      }

      await addTaskAttachment({
        taskId: detailsTaskId,
        storageId: json.storageId as Id<"_storage">,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size || undefined,
      });
      notify.success("Attachment uploaded");
    } catch (error) {
      notify.error("Could not upload attachment", error);
    } finally {
      setUploadingAttachment(false);
      input.value = "";
    }
  }

  function handleDragStart(taskId: Id<"tasks">) {
    setDraggingTask(taskId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(columnId: Id<"boardColumns">) {
    if (!draggingTask) return;

    // Determine status based on column position
    const column = columns?.find((c: BoardColumn) => c._id === columnId);
    let status: "pending" | "in_progress" | "completed" | undefined;
    if (column) {
      if (column.order === 0) status = "pending";
      else if (column.order === columns!.length - 1) status = "completed";
      else status = "in_progress";
    }

    try {
      await moveTask({
        taskId: draggingTask,
        boardColumnId: columnId,
        status,
      });
    } catch (error) {
      notify.error("Could not move task", error);
    } finally {
      setDraggingTask(null);
    }
  }

  function getTasksForColumn(columnId: Id<"boardColumns">) {
    if (!tasks) return [];
    let filtered = tasks.filter((t: Task) => t.boardColumnId === columnId);
    // Apply agent filter
    if (filterAgent !== "all") {
      filtered = filtered.filter((t: Task) => t.agentId === filterAgent);
    }
    return filtered;
  }

  function getUnassignedTasks() {
    if (!tasks) return [];
    let filtered = tasks.filter((t: Task) => !t.boardColumnId);
    // Apply agent filter
    if (filterAgent !== "all") {
      filtered = filtered.filter((t: Task) => t.agentId === filterAgent);
    }
    return filtered;
  }

  // Get agent name by ID
  function getAgentName(agentId: Id<"agents"> | undefined): string | null {
    if (!agentId || !agents) return null;
    const agent = agents.find((a: Agent) => a._id === agentId);
    return agent?.name ?? null;
  }

  if (!columns || !tasks || !agents || archivedTasks === undefined) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
        </div>
      </DashboardLayout>
    );
  }

  // Count completed tasks for archive button
  const completedTasksCount = tasks.filter((t: Task) => t.status === "completed").length;

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
  const unassignedTasks = getUnassignedTasks();
  const detailTask =
    (tasks.find((task: Task) => task._id === detailsTaskId) as Task | undefined) ??
    (archivedTasks.find((task: Task) => task._id === detailsTaskId) as Task | undefined);

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Task Board</h1>
            <p className="mt-1 text-ink-1">
              Track tasks your agents are working on.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Agent filter */}
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value as Id<"agents"> | "all")}
              className="input"
            >
              <option value="all">All agents</option>
              {agents.map((agent: Agent) => (
                <option key={agent._id} value={agent._id}>{agent.name}</option>
              ))}
            </select>
            {completedTasksCount > 0 && (
              <button
                onClick={handleArchiveCompleted}
                className="btn-secondary flex items-center gap-2 whitespace-nowrap text-sm"
                title="Archive all completed tasks"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span>Archive completed ({completedTasksCount})</span>
              </button>
            )}
            <button
              onClick={() => setSelectedColumn(sortedColumns[0]?._id || null)}
              className="btn-accent flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add task</span>
            </button>
          </div>
        </div>

        {/* New task form */}
        {selectedColumn && (
          <form onSubmit={handleCreateTask} className="mt-6 card">
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder="What needs to be done?"
                className="input flex-1 min-w-[200px]"
                autoFocus
              />
              <select
                value={selectedColumn}
                onChange={(e) => setSelectedColumn(e.target.value as Id<"boardColumns">)}
                className="input w-36"
              >
                {sortedColumns.map((col) => (
                  <option key={col._id} value={col._id}>
                    {col.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value as Id<"agents"> | "none")}
                className="input w-40"
              >
                <option value="none">No agent</option>
                {agents.map((agent: Agent) => (
                  <option key={agent._id} value={agent._id}>{agent.name}</option>
                ))}
              </select>
              <button type="submit" className="btn-accent" disabled={!newTaskText.trim()}>
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedColumn(null);
                  setSelectedAgent("none");
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Edit task modal */}
        {editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card w-full max-w-md mx-4">
              <h2 className="font-semibold text-ink-0">Edit task</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-0">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="input mt-1.5 resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-0">Assigned agent</label>
                  <select
                    value={editAgent}
                    onChange={(e) => setEditAgent(e.target.value as Id<"agents"> | "none")}
                    className="input mt-1.5"
                  >
                    <option value="none">No agent</option>
                    {agents.map((agent: Agent) => (
                      <option key={agent._id} value={agent._id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setEditingTask(null)} className="btn-secondary">Cancel</button>
                <button onClick={handleUpdateTask} className="btn-accent">Save</button>
              </div>
            </div>
          </div>
        )}

        {detailsTaskId && detailTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card mx-4 w-full max-w-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink-0">Task details</h2>
                  <p className="mt-1 text-sm text-ink-1">{detailTask.description}</p>
                </div>
                <button
                  onClick={() => setDetailsTaskId(null)}
                  className="rounded p-1 text-ink-2 hover:bg-surface-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-ink-0">Comments</h3>
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-surface-3 bg-surface-1 p-3">
                    {taskComments === undefined ? (
                      <p className="text-sm text-ink-1">Loading comments...</p>
                    ) : taskComments.length === 0 ? (
                      <p className="text-sm text-ink-1">No comments yet.</p>
                    ) : (
                      taskComments.map((comment) => (
                        <div key={comment._id} className="rounded bg-surface-0 p-2">
                          <p className="text-sm text-ink-0">{comment.content}</p>
                          <p className="mt-1 text-xs text-ink-2">
                            {new Date(comment.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="input flex-1"
                      placeholder="Add a comment"
                    />
                    <button
                      onClick={handleAddComment}
                      className="btn-secondary text-sm"
                      disabled={!newCommentText.trim()}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-ink-0">Attachments</h3>
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-surface-3 bg-surface-1 p-3">
                    {taskAttachments === undefined ? (
                      <p className="text-sm text-ink-1">Loading attachments...</p>
                    ) : taskAttachments.length === 0 ? (
                      <p className="text-sm text-ink-1">No attachments yet.</p>
                    ) : (
                      taskAttachments.map((file) => (
                        <div key={file._id} className="flex items-center justify-between gap-2 rounded bg-surface-0 p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-ink-0">{file.fileName}</p>
                            <p className="text-xs text-ink-2">
                              {file.size ? `${Math.round(file.size / 1024)} KB` : "file"}
                            </p>
                          </div>
                          {file.url ? (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-ink-2-interactive hover:underline"
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-xs text-ink-2">Unavailable</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <label className="btn-secondary mt-2 inline-flex cursor-pointer text-sm">
                    {uploadingAttachment ? "Uploading..." : "Upload file"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) =>
                        void handleUploadAttachment(
                          e.target.files?.[0] ?? null,
                          e.currentTarget
                        )
                      }
                      disabled={uploadingAttachment}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Board */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {sortedColumns.map((column) => {
            const columnTasks = getTasksForColumn(column._id);
            return (
              <div
                key={column._id}
                className="rounded-xl border border-surface-3 bg-surface-1 p-4"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column._id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-ink-0">{column.name}</h2>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {columnTasks.length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed border-surface-3 py-8 text-center">
                      <p className="text-sm text-ink-2">No tasks</p>
                    </div>
                  ) : (
                    columnTasks.map((task: Task) => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        agentName={getAgentName(task.agentId)}
                        onDragStart={() => handleDragStart(task._id)}
                        onEdit={() => startEditingTask(task)}
                        onOpenDetails={() => setDetailsTaskId(task._id)}
                        onDelete={() => handleDeleteTask(task._id)}
                        onArchive={() => handleArchiveTask(task._id)}
                        isDragging={draggingTask === task._id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unassigned tasks */}
        {unassignedTasks.length > 0 && (
          <div className="mt-6">
            <h2 className="font-medium text-ink-0">Unassigned tasks</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unassignedTasks.map((task: Task) => (
                <TaskCard
                  key={task._id}
                  task={task}
                  agentName={getAgentName(task.agentId)}
                  onDragStart={() => handleDragStart(task._id)}
                  onEdit={() => startEditingTask(task)}
                  onOpenDetails={() => setDetailsTaskId(task._id)}
                  onDelete={() => handleDeleteTask(task._id)}
                  onArchive={() => handleArchiveTask(task._id)}
                  isDragging={draggingTask === task._id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Archived tasks section */}
        {archivedTasks.length > 0 && (
          <div className="mt-8 border-t border-surface-3 pt-6">
            <button
              onClick={() => setShowArchive(!showArchive)}
              className="flex items-center gap-2 text-ink-1 hover:text-ink-0 transition-colors"
            >
              <svg 
                className={`h-4 w-4 transition-transform ${showArchive ? "rotate-90" : ""}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span className="font-medium">Archived tasks</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                {archivedTasks.length}
              </span>
            </button>

            {showArchive && (
              <div className="mt-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-ink-2">
                    {archivedTasks.length} archived task{archivedTasks.length !== 1 ? "s" : ""}
                  </p>
                  <button
                    onClick={handleDeleteAllArchived}
                    className="text-sm text-red-600 hover:text-red-700 hover:underline"
                  >
                    Delete all archived
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedTasks.map((task: Task) => (
                    <ArchivedTaskCard
                      key={task._id}
                      task={task}
                      agentName={getAgentName(task.agentId)}
                      onOpenDetails={() => setDetailsTaskId(task._id)}
                      onRestore={() => handleUnarchiveTask(task._id)}
                      onDelete={() => handleDeleteTask(task._id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function TaskCard({
  task,
  agentName,
  onDragStart,
  onEdit,
  onOpenDetails,
  onDelete,
  onArchive,
  isDragging,
}: {
  task: Task;
  agentName: string | null;
  onDragStart: () => void;
  onEdit: () => void;
  onOpenDetails: () => void;
  onDelete: () => void;
  onArchive: () => void;
  isDragging: boolean;
}) {
  const requestedByLabel = task.requester
    ? `Requested by ${task.requester.name || (task.requester.username ? `@${task.requester.username}` : "user")}`
    : null;
  const requesterAgentLabel = task.requester?.agentName ? `via ${task.requester.agentName}` : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`group cursor-grab rounded-lg border border-surface-3 bg-surface-0 p-3 shadow-subtle transition-all active:cursor-grabbing ${
        isDragging ? "opacity-50 scale-95" : "hover:shadow-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-0 flex-1">{task.description}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
            className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
            title="Details"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
            title="Edit"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
            title="Archive"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-ink-2 hover:bg-red-100 hover:text-red-600"
            title="Delete"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={task.status} />
          {agentName && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
              {agentName}
            </span>
          )}
          {requestedByLabel && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1" title={requesterAgentLabel ?? undefined}>
              {requestedByLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-2">{formatDate(task.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// Archived task card with restore/delete options
function ArchivedTaskCard({
  task,
  agentName,
  onOpenDetails,
  onRestore,
  onDelete,
}: {
  task: Task;
  agentName: string | null;
  onOpenDetails: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const requestedByLabel = task.requester
    ? `Requested by ${task.requester.name || (task.requester.username ? `@${task.requester.username}` : "user")}`
    : null;
  const requesterAgentLabel = task.requester?.agentName ? `via ${task.requester.agentName}` : null;

  return (
    <div className="group rounded-lg border border-surface-3 bg-surface-1 p-3 opacity-75 hover:opacity-100 transition-opacity">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-1 flex-1 line-through">{task.description}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onOpenDetails}
            className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
            title="Details"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={onRestore}
            className="rounded p-1 text-ink-2 hover:bg-green-100 hover:text-green-600"
            title="Restore task"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-ink-2 hover:bg-red-100 hover:text-red-600"
            title="Delete permanently"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
            Archived
          </span>
          {agentName && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
              {agentName}
            </span>
          )}
          {requestedByLabel && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1" title={requesterAgentLabel ?? undefined}>
              {requestedByLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-ink-2">
          {task.archivedAt ? formatDate(task.archivedAt) : formatDate(task.createdAt)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    in_progress: "In Progress",
    completed: "Done",
    failed: "Failed",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
}

function formatDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
