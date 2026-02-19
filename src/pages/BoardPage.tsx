import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import ReactMarkdown from "react-markdown";
import { CopySimple } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { DateTimePicker } from "../components/DateTimePicker";
import { WorkflowView } from "../components/WorkflowView";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { notify } from "../lib/notify";
import { platformApi } from "../lib/platformApi";

// Type aliases for cleaner code
type BoardColumn = Doc<"boardColumns">;
type Agent = Doc<"agents">;
type BoardProject = Doc<"boardProjects">;

// Task type with optional agentId
interface Task {
  _id: Id<"tasks">;
  description: string;
  status: string;
  boardColumnId?: Id<"boardColumns">;
  agentId?: Id<"agents">;
  projectId?: Id<"boardProjects">;
  requester?: {
    userId?: Id<"users">;
    username?: string;
    name?: string;
    agentName?: string;
  };
  isArchived?: boolean;
  archivedAt?: number;
  createdAt: number;
  targetCompletionAt?: number;
  doNowAt?: number;
  completedAt?: number;
  outcomeSummary?: string;
  outcomeLinks?: Array<string>;
  outcomeFileId?: string;
  outcomeAudioId?: string;
  outcomeImages?: Array<string>;
  outcomeVideoUrl?: string;
  parentTaskId?: Id<"tasks">;
  outcomeEmailStatus?: "queued" | "sent" | "failed";
  outcomeEmailLastAttemptAt?: number;
  outcomeEmailSentAt?: number;
  outcomeEmailError?: string;
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
  const projects = useQuery(platformApi.convex.board.getProjects);
  const tasks = useQuery(platformApi.convex.board.getTasks);
  const archivedTasks = useQuery(platformApi.convex.board.getArchivedTasks);
  const agents = useQuery(platformApi.convex.agents.list);
  const createProject = useMutation(platformApi.convex.board.createProject);
  const deleteProject = useMutation(platformApi.convex.board.deleteProject);
  const createTask = useMutation(platformApi.convex.board.createTask);
  const moveTask = useMutation(platformApi.convex.board.moveTask);
  const updateTask = useMutation(platformApi.convex.board.updateTask);
  const doTaskNow = useMutation(platformApi.convex.board.doNow);
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
  const speakTaskOutcome = useAction(api.functions.voice.speakTaskOutcome);

  // Create task form
  const [newTaskText, setNewTaskText] = useState("");
  const [selectedColumn, setSelectedColumn] = useState<Id<"boardColumns"> | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Id<"agents"> | "none">("none");
  const [selectedProject, setSelectedProject] = useState<Id<"boardProjects"> | "none">("none");
  const [newTaskIsPublic, setNewTaskIsPublic] = useState(false);
  const [newTaskTargetCompletionAt, setNewTaskTargetCompletionAt] = useState("");
  
  // Edit task
  const [editingTask, setEditingTask] = useState<Id<"tasks"> | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAgent, setEditAgent] = useState<Id<"agents"> | "none">("none");
  const [editProject, setEditProject] = useState<Id<"boardProjects"> | "none">("none");
  const [editTargetCompletionAt, setEditTargetCompletionAt] = useState("");
  
  // Drag state
  const [draggingTask, setDraggingTask] = useState<Id<"tasks"> | null>(null);
  
  // Filter by agent
  const [filterAgent, setFilterAgent] = useState<Id<"agents"> | "all">("all");
  const [filterProject, setFilterProject] = useState<Id<"boardProjects"> | "all" | "none">("all");
  const [boardView, setBoardView] = useState<"board" | "projects">("board");
  const [showProjectComposer, setShowProjectComposer] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  
  // Archive section expanded
  const [showArchive, setShowArchive] = useState(false);
  const [detailsTaskId, setDetailsTaskId] = useState<Id<"tasks"> | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [outcomeSummaryDraft, setOutcomeSummaryDraft] = useState("");
  const [outcomeLinksDraft, setOutcomeLinksDraft] = useState("");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [outcomeViewerTaskId, setOutcomeViewerTaskId] = useState<Id<"tasks"> | null>(null);

  const activeAudioTaskId = detailsTaskId ?? outcomeViewerTaskId;
  const getOutcomeAudioUrl = useQuery(
    platformApi.convex.board.getOutcomeAudioUrl,
    activeAudioTaskId ? { taskId: activeAudioTaskId } : "skip"
  );

  // Audio playback for task outcomes
  const [isGeneratingTaskAudio, setIsGeneratingTaskAudio] = useState(false);
  const [isPlayingTaskAudio, setIsPlayingTaskAudio] = useState(false);
  const taskAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopTaskAudio = useCallback(() => {
    if (taskAudioRef.current) {
      taskAudioRef.current.pause();
      taskAudioRef.current.src = "";
      taskAudioRef.current = null;
    }
    setIsPlayingTaskAudio(false);
  }, []);

  async function handleListenToOutcome(taskId: Id<"tasks">, agentId?: Id<"agents">) {
    if (isPlayingTaskAudio) {
      stopTaskAudio();
      return;
    }

    if (getOutcomeAudioUrl) {
      const audio = new Audio(getOutcomeAudioUrl);
      taskAudioRef.current = audio;
      setIsPlayingTaskAudio(true);
      audio.addEventListener("ended", () => {
        setIsPlayingTaskAudio(false);
        taskAudioRef.current = null;
      });
      audio.addEventListener("error", () => {
        notify.error("Audio playback failed");
        setIsPlayingTaskAudio(false);
        taskAudioRef.current = null;
      });
      await audio.play();
      return;
    }

    setIsGeneratingTaskAudio(true);
    try {
      const result = await speakTaskOutcome({ taskId, agentId });
      if (!result?.audioUrl) {
        notify.warning("Voice not available", "Configure a voice provider (ElevenLabs or OpenAI) in your agent settings.");
        return;
      }

      const audio = new Audio(result.audioUrl);
      taskAudioRef.current = audio;
      setIsPlayingTaskAudio(true);
      audio.addEventListener("ended", () => {
        setIsPlayingTaskAudio(false);
        taskAudioRef.current = null;
      });
      audio.addEventListener("error", () => {
        notify.error("Audio playback failed");
        setIsPlayingTaskAudio(false);
        taskAudioRef.current = null;
      });
      await audio.play();
    } catch (error) {
      notify.error("Could not generate audio", error);
    } finally {
      setIsGeneratingTaskAudio(false);
    }
  }

  useEffect(() => {
    return () => {
      if (taskAudioRef.current) {
        taskAudioRef.current.pause();
        taskAudioRef.current = null;
      }
    };
  }, [detailsTaskId]);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    buttonTitle: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const taskComments = useQuery(
    platformApi.convex.board.getTaskComments,
    detailsTaskId ? { taskId: detailsTaskId } : "skip"
  ) as TaskComment[] | undefined;
  const taskAttachments = useQuery(
    platformApi.convex.board.getTaskAttachments,
    detailsTaskId ? { taskId: detailsTaskId } : "skip"
  ) as TaskAttachment[] | undefined;
  const workflowSteps = useQuery(
    platformApi.convex.board.getWorkflowSteps,
    detailsTaskId ? { taskId: detailsTaskId } : "skip"
  );

  useEffect(() => {
    if (!columns) return;
    const hasTodo = columns.some((column: BoardColumn) => column.name === "Todo");
    if (!hasTodo) {
      void ensureDefaultColumns({});
    }
  }, [columns, ensureDefaultColumns]);

  // Auto-set the selected column to the first column when columns load
  useEffect(() => {
    if (!columns || columns.length === 0) return;
    const sorted = [...columns].sort((a: BoardColumn, b: BoardColumn) => a.order - b.order);
    setSelectedColumn((prev) => prev ?? sorted[0]?._id ?? null);
  }, [columns]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskText.trim() || (selectedAgent !== "none" && !selectedColumn)) return;
    const hasAssignedAgent = selectedAgent !== "none";
    try {
      if (!hasAssignedAgent) {
        notify.warning(
          "Assign an agent to place task on board",
          "Created as unassigned task."
        );
      }
      await createTask({
        description: newTaskText.trim(),
        boardColumnId: hasAssignedAgent && selectedColumn ? selectedColumn : undefined,
        agentId: hasAssignedAgent ? selectedAgent : undefined,
        projectId: selectedProject !== "none" ? selectedProject : undefined,
        isPublic: newTaskIsPublic,
        targetCompletionAt: newTaskTargetCompletionAt
          ? new Date(newTaskTargetCompletionAt).getTime()
          : undefined,
      });
      setNewTaskText("");
      setSelectedAgent("none");
      setSelectedProject("none");
      setNewTaskIsPublic(false);
      setNewTaskTargetCompletionAt("");
      notify.success("Task created");
    } catch (error) {
      notify.error("Could not create task", error);
    }
  }

  function handleTaskComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    if (!newTaskText.trim() || (selectedAgent !== "none" && !selectedColumn)) return;
    event.currentTarget.form?.requestSubmit();
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const projectId = await createProject({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      });
      setNewProjectName("");
      setNewProjectDescription("");
      setShowProjectComposer(false);
      setFilterProject(projectId);
      setSelectedProject(projectId);
      notify.success("Project created");
    } catch (error) {
      notify.error("Could not create project", error);
    }
  }

  async function handleDeleteProject(projectId: Id<"boardProjects">) {
    const projectName = projects?.find((project: BoardProject) => project._id === projectId)?.name ?? "project";
    setConfirmDialog({
      title: `Delete ${projectName}?`,
      description: "Tasks stay on the board and become ungrouped.",
      buttonTitle: "Delete project",
      onConfirm: async () => {
        try {
          await deleteProject({ projectId });
          if (filterProject === projectId) {
            setFilterProject("all");
          }
          if (selectedProject === projectId) {
            setSelectedProject("none");
          }
          if (editProject === projectId) {
            setEditProject("none");
          }
          notify.success("Project deleted");
        } catch (error) {
          notify.error("Could not delete project", error);
        }
      },
    });
  }

  function startEditingTask(task: Task) {
    setEditingTask(task._id);
    setEditDescription(task.description);
    setEditAgent(task.agentId ?? "none");
    setEditProject(task.projectId ?? "none");
    setEditTargetCompletionAt(
      task.targetCompletionAt
        ? new Date(task.targetCompletionAt).toISOString().slice(0, 16)
        : ""
    );
  }

  async function handleUpdateTask() {
    if (!editingTask) return;
    const currentTask = tasks?.find((task: Task) => task._id === editingTask);
    if (editAgent === "none" && currentTask?.boardColumnId) {
      notify.warning(
        "Cannot remove assignee while task is on board",
        "Move it to unassigned first or keep an assigned agent."
      );
      return;
    }
    try {
      await updateTask({
        taskId: editingTask,
        description: editDescription.trim() || undefined,
        agentId: editAgent !== "none" ? editAgent : null,
        projectId: editProject !== "none" ? editProject : undefined,
        targetCompletionAt: editTargetCompletionAt
          ? new Date(editTargetCompletionAt).getTime()
          : null,
      });
      setEditingTask(null);
      notify.success("Task updated");
    } catch (error) {
      notify.error("Could not update task", error);
    }
  }

  async function handleDeleteTask(taskId: Id<"tasks">) {
    setConfirmDialog({
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

  async function handleDoNow(taskId: Id<"tasks">) {
    try {
      await doTaskNow({ taskId });
      notify.success("Task moved to in progress");
    } catch (error) {
      notify.error("Could not start task now", error);
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
    setConfirmDialog({
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

  async function handleConfirmDialog() {
    if (!confirmDialog) return;
    setConfirming(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } finally {
      setConfirming(false);
    }
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
    const task = tasks?.find((t: Task) => t._id === draggingTask);
    if (task && !task.agentId) {
      notify.warning(
        "Unassigned tasks cannot be moved to board columns",
        "Assign an agent first."
      );
      setDraggingTask(null);
      return;
    }

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

  function matchesFilters(task: Task) {
    if (filterAgent !== "all" && task.agentId !== filterAgent) {
      return false;
    }
    if (filterProject === "none" && task.projectId) {
      return false;
    }
    if (filterProject !== "all" && filterProject !== "none" && task.projectId !== filterProject) {
      return false;
    }
    return true;
  }

  function getTasksForColumn(columnId: Id<"boardColumns">) {
    if (!tasks) return [];
    return tasks.filter((t: Task) => t.boardColumnId === columnId && matchesFilters(t));
  }

  function getUnassignedTasks() {
    if (!tasks) return [];
    return tasks.filter((t: Task) => !t.boardColumnId && matchesFilters(t));
  }

  // Get agent name by ID
  function getAgentName(agentId: Id<"agents"> | undefined): string | null {
    if (!agentId || !agents) return null;
    const agent = agents.find((a: Agent) => a._id === agentId);
    return agent?.name ?? null;
  }

  function getProjectName(projectId: Id<"boardProjects"> | undefined): string | null {
    if (!projectId || !projects) return null;
    const project = projects.find((p: BoardProject) => p._id === projectId);
    return project?.name ?? null;
  }

  function getSubtaskCount(taskId: Id<"tasks">): { total: number; completed: number } | undefined {
    if (!tasks) return undefined;
    const subtasks = (tasks as Array<Task>).filter((t) => t.parentTaskId === taskId);
    if (subtasks.length === 0) return undefined;
    return {
      total: subtasks.length,
      completed: subtasks.filter((t) => t.status === "completed").length,
    };
  }

  const filteredTasks = tasks?.filter((task: Task) => matchesFilters(task)) ?? [];
  const detailTask =
    (tasks?.find((task: Task) => task._id === detailsTaskId) as Task | undefined) ??
    (archivedTasks?.find((task: Task) => task._id === detailsTaskId) as Task | undefined);

  useEffect(() => {
    if (!detailsTaskId || !detailTask) {
      setOutcomeSummaryDraft("");
      setOutcomeLinksDraft("");
      setEditingOutcome(false);
      return;
    }
    setOutcomeSummaryDraft(detailTask.outcomeSummary ?? "");
    setOutcomeLinksDraft((detailTask.outcomeLinks ?? []).join("\n"));
    setEditingOutcome(false);
  }, [detailsTaskId, detailTask?._id, detailTask?.outcomeSummary, detailTask?.outcomeLinks]);

  // Resolve outcome viewer task
  const outcomeViewerTask =
    outcomeViewerTaskId
      ? (tasks?.find((t: Task) => t._id === outcomeViewerTaskId) as Task | undefined) ??
        (archivedTasks?.find((t: Task) => t._id === outcomeViewerTaskId) as Task | undefined)
      : undefined;

  // ESC key closes topmost modal (outcome viewer > details > edit > confirm)
  useEscapeKey(
    () => setOutcomeViewerTaskId(null),
    !!outcomeViewerTaskId
  );
  useEscapeKey(
    () => setDetailsTaskId(null),
    !!detailsTaskId && !outcomeViewerTaskId
  );
  useEscapeKey(
    () => setEditingTask(null),
    !!editingTask && !detailsTaskId && !outcomeViewerTaskId
  );
  useEscapeKey(
    () => setConfirmDialog(null),
    !!confirmDialog && !editingTask && !detailsTaskId && !outcomeViewerTaskId
  );

  async function handleSaveOutcome() {
    if (!detailsTaskId || !detailTask) return;
    setSavingOutcome(true);
    try {
      const parsedLinks = outcomeLinksDraft
        .split("\n")
        .map((link) => link.trim())
        .filter((link) => link.length > 0);
      await updateTask({
        taskId: detailsTaskId,
        outcomeSummary: outcomeSummaryDraft.trim() || null,
        outcomeLinks: parsedLinks.length > 0 ? parsedLinks : null,
      });
      notify.success("Outcome saved");
    } catch (error) {
      notify.error("Could not save outcome", error);
    } finally {
      setSavingOutcome(false);
    }
  }

  const projectSummaries = (() => {
    const byProjectId = new Map<
      string,
      {
        id: Id<"boardProjects"> | "none";
        name: string;
        description?: string;
        taskCount: number;
        completedCount: number;
        inProgressCount: number;
        pendingCount: number;
        failedCount: number;
        agentIds: Set<Id<"agents">>;
      }
    >();

    for (const project of (projects as BoardProject[] | undefined) ?? []) {
      byProjectId.set(project._id, {
        id: project._id,
        name: project.name,
        description: project.description,
        taskCount: 0,
        completedCount: 0,
        inProgressCount: 0,
        pendingCount: 0,
        failedCount: 0,
        agentIds: new Set<Id<"agents">>(),
      });
    }
    byProjectId.set("none", {
      id: "none",
      name: "No project",
      taskCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      pendingCount: 0,
      failedCount: 0,
      agentIds: new Set<Id<"agents">>(),
    });

    for (const task of filteredTasks) {
      const key = task.projectId ?? "none";
      const summary = byProjectId.get(key);
      if (!summary) continue;

      summary.taskCount += 1;
      if (task.status === "completed") summary.completedCount += 1;
      if (task.status === "in_progress") summary.inProgressCount += 1;
      if (task.status === "pending") summary.pendingCount += 1;
      if (task.status === "failed") summary.failedCount += 1;
      if (task.agentId) summary.agentIds.add(task.agentId);
    }

    return Array.from(byProjectId.values())
      .filter((summary) => summary.taskCount > 0 || summary.id !== "none")
      .sort((a, b) => b.taskCount - a.taskCount);
  })();

  if (!columns || !tasks || !projects || !agents || archivedTasks === undefined) {
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
  const filteredArchivedTasks = archivedTasks.filter((task: Task) => matchesFilters(task));
  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="flex items-start gap-6">

          {/* Left sidebar */}
          <aside className="w-44 shrink-0">
            <div className="sticky top-20 space-y-0.5">

              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-ink-2">View</p>
              <button
                type="button"
                onClick={() => setBoardView("board")}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  boardView === "board"
                    ? "bg-surface-1 font-medium text-ink-0"
                    : "text-ink-1 hover:bg-surface-2 hover:text-ink-0"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                Board
              </button>
              <button
                type="button"
                onClick={() => setBoardView("projects")}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  boardView === "projects"
                    ? "bg-surface-1 font-medium text-ink-0"
                    : "text-ink-1 hover:bg-surface-2 hover:text-ink-0"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                Projects
              </button>

              <div className="my-3 border-t border-surface-3" />

              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-ink-2">Filter</p>
              <div className="space-y-2 px-1">
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value as Id<"agents"> | "all")}
                  className="input w-full text-xs"
                >
                  <option value="all">All agents</option>
                  {agents.map((agent: Agent) => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
                </select>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value as Id<"boardProjects"> | "all" | "none")}
                  className="input w-full text-xs"
                >
                  <option value="all">All projects</option>
                  <option value="none">No project</option>
                  {projects.map((project: BoardProject) => (
                    <option key={project._id} value={project._id}>{project.name}</option>
                  ))}
                </select>
              </div>

              <div className="my-3 border-t border-surface-3" />

              <button
                type="button"
                onClick={() => setShowProjectComposer((v) => !v)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  showProjectComposer
                    ? "bg-surface-1 font-medium text-ink-0"
                    : "text-ink-1 hover:bg-surface-2 hover:text-ink-0"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                New project
              </button>

              {completedTasksCount > 0 && (
                <button
                  type="button"
                  onClick={handleArchiveCompleted}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-1 transition-colors hover:bg-surface-2 hover:text-ink-0"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  Archive ({completedTasksCount})
                </button>
              )}
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1">

            {/* New project form — collapsible via sidebar toggle */}
            {showProjectComposer && (
              <form onSubmit={handleCreateProject} className="mb-4 rounded-xl border border-surface-3 bg-surface-0 p-4">
                <p className="mb-3 text-sm font-medium text-ink-0">New project</p>
                <div className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    className="input min-w-[160px] flex-1"
                    maxLength={80}
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Optional description"
                    className="input min-w-[200px] flex-1"
                    maxLength={140}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-accent" disabled={!newProjectName.trim()}>
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProjectComposer(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ChatGPT-style task compose area */}
            <form onSubmit={handleCreateTask}>
              <div className="rounded-2xl border border-surface-3 bg-surface-0 px-4 pb-3 pt-4 shadow-sm transition-colors focus-within:border-ink-2">
                <textarea
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={handleTaskComposerKeyDown}
                  placeholder="What needs to be done?"
                  className="w-full resize-none bg-transparent text-base text-ink-0 placeholder:text-ink-2 outline-none"
                  rows={2}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={selectedColumn ?? ""}
                    onChange={(e) => setSelectedColumn(e.target.value as Id<"boardColumns">)}
                    className="cursor-pointer rounded-full border border-surface-3 bg-surface-1 px-3 py-1 text-xs text-ink-1 outline-none hover:bg-surface-2"
                  >
                    {sortedColumns.map((col) => (
                      <option key={col._id} value={col._id}>{col.name}</option>
                    ))}
                  </select>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value as Id<"agents"> | "none")}
                    className="cursor-pointer rounded-full border border-surface-3 bg-surface-1 px-3 py-1 text-xs text-ink-1 outline-none hover:bg-surface-2"
                  >
                    <option value="none">No agent</option>
                    {agents.map((agent: Agent) => (
                      <option key={agent._id} value={agent._id}>{agent.name}</option>
                    ))}
                  </select>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value as Id<"boardProjects"> | "none")}
                    className="cursor-pointer rounded-full border border-surface-3 bg-surface-1 px-3 py-1 text-xs text-ink-1 outline-none hover:bg-surface-2"
                  >
                    <option value="none">No project</option>
                    {projects.map((project: BoardProject) => (
                      <option key={project._id} value={project._id}>{project.name}</option>
                    ))}
                  </select>
                  <DateTimePicker
                    value={newTaskTargetCompletionAt}
                    onChange={setNewTaskTargetCompletionAt}
                    title="Target completion"
                    variant="inline"
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-surface-3 bg-surface-1 px-3 py-1 text-xs text-ink-1 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={newTaskIsPublic}
                      onChange={(e) => setNewTaskIsPublic(e.target.checked)}
                      className="h-3 w-3 rounded border-surface-3 accent-accent"
                    />
                    Public activity
                  </label>
                  <button
                    type="submit"
                    disabled={!newTaskText.trim() || (selectedAgent !== "none" && !selectedColumn)}
                    className="ml-auto rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-2">
                  Enter = new line, Shift+Enter = add task
                </p>
              </div>
            </form>

        {/* Edit task modal */}
        {editingTask && (
          <div className="fixed inset-0 z-50 flex h-dvh items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center sm:p-6">
            <div className="card w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-ink-0">Edit task</h2>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="rounded p-1 text-ink-2 hover:bg-surface-2"
                  aria-label="Close edit task"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
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
                <div>
                  <label className="block text-sm font-medium text-ink-0">Project</label>
                  <select
                    value={editProject}
                    onChange={(e) => setEditProject(e.target.value as Id<"boardProjects"> | "none")}
                    className="input mt-1.5"
                  >
                    <option value="none">No project</option>
                    {projects.map((project: BoardProject) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-0">Target completion</label>
                  <DateTimePicker
                    value={editTargetCompletionAt}
                    onChange={setEditTargetCompletionAt}
                    variant="field"
                  />
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
          <div className="fixed inset-0 z-50 flex h-dvh items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-6">
            <div className="card w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
              {/* Header */}
              <div className="sticky top-0 z-10 -mx-6 -mt-6 flex items-start justify-between gap-3 border-b border-surface-3 bg-surface-0 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-pretty text-base font-semibold text-ink-0">{detailTask.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={detailTask.status} />
                    {getAgentName(detailTask.agentId) && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                        {getAgentName(detailTask.agentId)}
                      </span>
                    )}
                    {getProjectName(detailTask.projectId) && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                        {getProjectName(detailTask.projectId)}
                      </span>
                    )}
                    <span className="text-xs text-ink-2">{formatDate(detailTask.createdAt)}</span>
                    {detailTask.outcomeEmailStatus ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          detailTask.outcomeEmailStatus === "sent"
                            ? "bg-green-100 text-green-700"
                            : detailTask.outcomeEmailStatus === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        Email {detailTask.outcomeEmailStatus}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => setDetailsTaskId(null)}
                  className="shrink-0 rounded p-1.5 text-ink-2 hover:bg-surface-2"
                  aria-label="Close task details"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Workflow pipeline view */}
              {workflowSteps && workflowSteps.length > 0 && (
                <details className="group mt-5" open={detailTask.status === "in_progress"}>
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-0">
                    <svg className="size-4 text-ink-2 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Pipeline
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-1">{workflowSteps.length} steps</span>
                  </summary>
                  <div className="mt-3">
                    <WorkflowView steps={workflowSteps} />
                  </div>
                </details>
              )}

              {/* Outcome section (primary, full width) */}
              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink-0">Outcome</h3>
                  <div className="flex items-center gap-2">
                    {detailTask.outcomeSummary && !editingOutcome && (
                      <button
                        type="button"
                        onClick={() => void handleListenToOutcome(detailTask._id, detailTask.agentId)}
                        disabled={isGeneratingTaskAudio}
                        className={`rounded p-1 transition-colors ${
                          isPlayingTaskAudio
                            ? "text-accent bg-accent/10"
                            : "text-ink-2 hover:bg-surface-2 hover:text-ink-0"
                        } disabled:opacity-50`}
                        aria-label={isPlayingTaskAudio ? "Stop audio" : "Listen to report"}
                        title={isPlayingTaskAudio ? "Stop audio" : "Listen to report"}
                      >
                        {isGeneratingTaskAudio ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                        ) : isPlayingTaskAudio ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                        )}
                      </button>
                    )}
                    {detailTask.outcomeSummary && !editingOutcome && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(detailTask.outcomeSummary ?? "");
                          notify.success("Copied to clipboard");
                        }}
                        className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
                        aria-label="Copy outcome text"
                        title="Copy outcome text"
                      >
                        <CopySimple size={16} />
                      </button>
                    )}
                    {detailTask.outcomeSummary && !editingOutcome && (
                      <button
                        type="button"
                        onClick={() => { setDetailsTaskId(null); setOutcomeViewerTaskId(detailTask._id); }}
                        className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-0 hover:bg-surface-3"
                      >
                        Full report
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 rounded-lg border border-surface-3 bg-surface-1 p-4">
                  {detailTask.outcomeEmailLastAttemptAt ? (
                    <p className="mb-3 text-xs text-ink-2">
                      Last email attempt:{" "}
                      {new Date(detailTask.outcomeEmailLastAttemptAt).toLocaleString()}
                      {detailTask.outcomeEmailError ? ` (${detailTask.outcomeEmailError})` : ""}
                    </p>
                  ) : null}
                  {detailTask.outcomeSummary && !editingOutcome ? (
                    <>
                      <div className="prose prose-sm max-w-none text-pretty text-ink-0 [&_a]:text-accent [&_a]:underline [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-2 [&_pre]:p-3 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-xs">
                        <ReactMarkdown>{detailTask.outcomeSummary}</ReactMarkdown>
                      </div>
                      {detailTask.outcomeLinks && detailTask.outcomeLinks.length > 0 && (
                        <div className="mt-3 space-y-1 border-t border-surface-3 pt-3">
                          {detailTask.outcomeLinks.map((link, i) => (
                            <a
                              key={i}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-xs text-accent hover:underline"
                            >
                              {link}
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingOutcome(true)}
                          className="text-xs text-ink-2 hover:text-ink-0 hover:underline"
                        >
                          Edit outcome
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={outcomeSummaryDraft}
                        onChange={(e) => setOutcomeSummaryDraft(e.target.value)}
                        className="input w-full resize-none"
                        rows={4}
                        placeholder="Summary of what was done (supports markdown)"
                      />
                      <textarea
                        value={outcomeLinksDraft}
                        onChange={(e) => setOutcomeLinksDraft(e.target.value)}
                        className="input mt-2 w-full resize-none"
                        rows={2}
                        placeholder={"Optional result links, one per line\nhttps://..."}
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-ink-2">Supports markdown</p>
                        <div className="flex gap-2">
                          {editingOutcome && (
                            <button
                              type="button"
                              onClick={() => {
                                setOutcomeSummaryDraft(detailTask.outcomeSummary ?? "");
                                setOutcomeLinksDraft((detailTask.outcomeLinks ?? []).join("\n"));
                                setEditingOutcome(false);
                              }}
                              className="text-xs text-ink-2 hover:text-ink-0 hover:underline"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await handleSaveOutcome();
                              setEditingOutcome(false);
                            }}
                            className="btn-secondary text-sm"
                            disabled={savingOutcome}
                          >
                            {savingOutcome ? "Saving..." : "Save outcome"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Comments section */}
              <details className="group mt-5">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-0">
                  <svg className="size-4 text-ink-2 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Comments
                  {taskComments && taskComments.length > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-1">{taskComments.length}</span>
                  )}
                </summary>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-surface-3 bg-surface-1 p-3">
                  {taskComments === undefined ? (
                    <p className="text-sm text-ink-1">Loading comments...</p>
                  ) : taskComments.length === 0 ? (
                    <p className="text-sm text-ink-1">No comments yet.</p>
                  ) : (
                    taskComments.map((comment) => (
                      <div key={comment._id} className="rounded bg-surface-0 p-2">
                        <p className="text-pretty text-sm text-ink-0">{comment.content}</p>
                        <p className="mt-1 text-xs tabular-nums text-ink-2">
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
              </details>

              {/* Attachments section */}
              <details className="group mt-4">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-0">
                  <svg className="size-4 text-ink-2 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Attachments
                  {taskAttachments && taskAttachments.length > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-1">{taskAttachments.length}</span>
                  )}
                </summary>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-surface-3 bg-surface-1 p-3">
                  {taskAttachments === undefined ? (
                    <p className="text-sm text-ink-1">Loading attachments...</p>
                  ) : taskAttachments.length === 0 ? (
                    <p className="text-sm text-ink-1">No attachments yet.</p>
                  ) : (
                    taskAttachments.map((file) => {
                      const lowerName = file.fileName.toLowerCase();
                      const isImage = file.contentType?.startsWith("image/") ?? false;
                      const isVideo = file.contentType?.startsWith("video/") ?? false;
                      const isPdf = file.contentType === "application/pdf" || lowerName.endsWith(".pdf");
                      const isDocLike = lowerName.endsWith(".doc") || lowerName.endsWith(".docx") || lowerName.endsWith(".txt") || lowerName.endsWith(".md");

                      return (
                        <div key={file._id} className="space-y-2 rounded bg-surface-0 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm text-ink-0">{file.fileName}</p>
                              <p className="text-xs text-ink-2">
                                {file.size ? `${Math.round(file.size / 1024)} KB` : "file"}
                              </p>
                            </div>
                            {file.url ? (
                              <a href={file.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-accent hover:underline">
                                Open
                              </a>
                            ) : (
                              <span className="text-xs text-ink-2">Unavailable</span>
                            )}
                          </div>
                          {file.url && isImage && (
                            <img src={file.url} alt={file.fileName} className="max-h-32 rounded border border-surface-3 object-cover" />
                          )}
                          {file.url && isVideo && (
                            <video src={file.url} controls className="max-h-44 w-full rounded border border-surface-3" />
                          )}
                          {file.url && isPdf && (
                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded border border-surface-3 px-2 py-1 text-xs text-ink-1 hover:bg-surface-1">
                              Preview PDF
                            </a>
                          )}
                          {file.url && isDocLike && (
                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded border border-surface-3 px-2 py-1 text-xs text-ink-1 hover:bg-surface-1" download>
                              Download document
                            </a>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <label className="btn-secondary mt-2 inline-flex cursor-pointer text-sm">
                  {uploadingAttachment ? "Uploading..." : "Upload file"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadAttachment(e.target.files?.[0] ?? null, e.currentTarget)
                    }
                    disabled={uploadingAttachment}
                  />
                </label>
              </details>
            </div>
          </div>
        )}

        {boardView === "board" ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                          projectName={getProjectName(task.projectId)}
                          subtaskCount={getSubtaskCount(task._id)}
                          onDragStart={() => handleDragStart(task._id)}
                          onEdit={() => startEditingTask(task)}
                          onOpenDetails={() => setDetailsTaskId(task._id)}
                          onDelete={() => handleDeleteTask(task._id)}
                          onArchive={() => handleArchiveTask(task._id)}
                          onDoNow={() => handleDoNow(task._id)}
                          onViewOutcome={() => setOutcomeViewerTaskId(task._id)}
                          showDoNow={column.name === "Todo" && task.status !== "completed" && task.status !== "failed"}
                          isDragging={draggingTask === task._id}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {projectSummaries.length === 0 ? (
              <div className="card lg:col-span-3">
                <h2 className="font-medium text-ink-0">No tasks yet</h2>
                <p className="mt-1 text-sm text-ink-1">
                  Create a task or project to start organizing work.
                </p>
              </div>
            ) : (
              projectSummaries.map((summary) => {
                const projectId = summary.id === "none" ? null : summary.id;
                return (
                <div key={summary.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium text-ink-0">{summary.name}</h2>
                      {summary.description && (
                        <p className="mt-1 text-sm text-ink-1">{summary.description}</p>
                      )}
                    </div>
                    {projectId && (
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(projectId)}
                        className="text-xs text-ink-2 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-surface-1 p-2">
                      <p className="text-lg font-semibold tabular-nums text-ink-0">{summary.taskCount}</p>
                      <p className="text-xs text-ink-2">Total</p>
                    </div>
                    <div className="rounded-lg bg-surface-1 p-2">
                      <p className="text-lg font-semibold tabular-nums text-ink-0">{summary.pendingCount}</p>
                      <p className="text-xs text-ink-2">Pending</p>
                    </div>
                    <div className="rounded-lg bg-surface-1 p-2">
                      <p className="text-lg font-semibold tabular-nums text-ink-0">{summary.inProgressCount}</p>
                      <p className="text-xs text-ink-2">In progress</p>
                    </div>
                    <div className="rounded-lg bg-surface-1 p-2">
                      <p className="text-lg font-semibold tabular-nums text-ink-0">{summary.completedCount}</p>
                      <p className="text-xs text-ink-2">Done</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-ink-2">
                      {summary.agentIds.size} agent{summary.agentIds.size !== 1 ? "s" : ""} active
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterProject(summary.id);
                        setBoardView("board");
                      }}
                      className="btn-secondary text-sm"
                    >
                      Open on board
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

        {/* Unassigned tasks */}
        {boardView === "board" && unassignedTasks.length > 0 && (
          <div className="mt-6">
            <h2 className="font-medium text-ink-0">Unassigned tasks</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unassignedTasks.map((task: Task) => (
                <TaskCard
                  key={task._id}
                  task={task}
                  agentName={getAgentName(task.agentId)}
                  projectName={getProjectName(task.projectId)}
                  subtaskCount={getSubtaskCount(task._id)}
                  onDragStart={() => handleDragStart(task._id)}
                  onEdit={() => startEditingTask(task)}
                  onOpenDetails={() => setDetailsTaskId(task._id)}
                  onDelete={() => handleDeleteTask(task._id)}
                  onArchive={() => handleArchiveTask(task._id)}
                  onDoNow={() => handleDoNow(task._id)}
                  onViewOutcome={() => setOutcomeViewerTaskId(task._id)}
                  showDoNow={task.status !== "completed" && task.status !== "failed"}
                  isDragging={draggingTask === task._id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Archived tasks section */}
        {filteredArchivedTasks.length > 0 && (
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
                {filteredArchivedTasks.length}
              </span>
            </button>

            {showArchive && (
              <div className="mt-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-ink-2">
                    {filteredArchivedTasks.length} archived task{filteredArchivedTasks.length !== 1 ? "s" : ""}
                  </p>
                  <button
                    onClick={handleDeleteAllArchived}
                    className="text-sm text-red-600 hover:text-red-700 hover:underline"
                  >
                    Delete all archived
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredArchivedTasks.map((task: Task) => (
                    <ArchivedTaskCard
                      key={task._id}
                      task={task}
                      agentName={getAgentName(task.agentId)}
                      projectName={getProjectName(task.projectId)}
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

        {/* Outcome viewer modal (rendered markdown report) */}
        {outcomeViewerTaskId && outcomeViewerTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOutcomeViewerTaskId(null)}>
            <div className="card mx-4 flex w-full max-w-2xl max-h-[85vh] flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-surface-3 pb-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink-0">Task report</h2>
                  <p className="mt-1 truncate text-sm text-ink-1">{outcomeViewerTask.description}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={outcomeViewerTask.status} />
                    {outcomeViewerTask.completedAt && (
                      <span className="text-xs text-ink-2">
                        Completed {new Date(outcomeViewerTask.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setOutcomeViewerTaskId(null)}
                  className="rounded p-1 text-ink-2 hover:bg-surface-2"
                  aria-label="Close report"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                {outcomeViewerTask.outcomeSummary ? (
                  <div className="prose prose-sm max-w-none text-ink-0 [&_a]:text-accent [&_a]:underline [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4 [&_pre]:bg-surface-2 [&_pre]:rounded [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-xs [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:rounded">
                    <ReactMarkdown>{outcomeViewerTask.outcomeSummary}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-ink-2">No outcome summary available.</p>
                )}
                {outcomeViewerTask.outcomeLinks && outcomeViewerTask.outcomeLinks.length > 0 && (
                  <div className="mt-4 space-y-1 border-t border-surface-3 pt-3">
                    <p className="text-xs font-medium text-ink-2">Result links</p>
                    {outcomeViewerTask.outcomeLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-accent hover:underline"
                      >
                        {link}
                      </a>
                    ))}
                  </div>
                )}
                {outcomeViewerTask.outcomeFileId && (
                  <OutcomeFileDownload taskId={outcomeViewerTask._id} />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-surface-3 pt-3">
                {outcomeViewerTask.outcomeSummary && (
                  <button
                    type="button"
                    onClick={() => void handleListenToOutcome(outcomeViewerTask._id, outcomeViewerTask.agentId)}
                    disabled={isGeneratingTaskAudio}
                    className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors ${
                      isPlayingTaskAudio
                        ? "bg-accent/10 text-accent"
                        : "text-ink-1 hover:bg-surface-2 hover:text-ink-0"
                    } disabled:opacity-50`}
                  >
                    {isGeneratingTaskAudio ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                    ) : isPlayingTaskAudio ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                    {isPlayingTaskAudio ? "Stop" : "Listen"}
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setOutcomeViewerTaskId(null); setDetailsTaskId(outcomeViewerTask._id); }}
                    className="btn-secondary text-sm"
                  >
                    Open details
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcomeViewerTaskId(null)}
                    className="btn-secondary text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card mx-4 w-full max-w-md">
              <h3 className="font-semibold text-ink-0">{confirmDialog.title}</h3>
              <p className="mt-2 text-sm text-ink-1">{confirmDialog.description}</p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="btn-secondary"
                  disabled={confirming}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDialog()}
                  className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  disabled={confirming}
                >
                  {confirming ? "Deleting..." : confirmDialog.buttonTitle}
                </button>
              </div>
            </div>
          </div>
        )}
          </div>{/* end main content */}
        </div>{/* end sidebar flex layout */}
      </div>
    </DashboardLayout>
  );
}

function OutcomeFileDownload({ taskId }: { taskId: Id<"tasks"> }) {
  const fileUrl = useQuery(platformApi.convex.board.getOutcomeFileUrl, { taskId });
  if (!fileUrl) return null;
  return (
    <div className="mt-4 border-t border-surface-3 pt-3">
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download full report
      </a>
    </div>
  );
}

function TaskCard({
  task,
  agentName,
  projectName,
  subtaskCount,
  onDragStart,
  onEdit,
  onOpenDetails,
  onDelete,
  onArchive,
  onDoNow,
  onViewOutcome,
  showDoNow,
  isDragging,
}: {
  task: Task;
  agentName: string | null;
  projectName: string | null;
  subtaskCount?: { total: number; completed: number };
  onDragStart: () => void;
  onEdit: () => void;
  onOpenDetails: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onDoNow: () => void;
  onViewOutcome: () => void;
  showDoNow: boolean;
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
            aria-label="Open task details"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {task.status === "completed" && task.outcomeSummary && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewOutcome(); }}
              className="rounded p-1 text-green-600 hover:bg-green-50 hover:text-green-700"
              title="View outcome"
              aria-label="View task outcome"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
            title="Edit"
            aria-label="Edit task"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink-0"
            title="Archive"
            aria-label="Archive task"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-ink-2 hover:bg-red-100 hover:text-red-600"
            title="Delete"
            aria-label="Delete task"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      {task.status === "completed" && task.outcomeSummary && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewOutcome(); }}
          className="mt-2 w-full text-left rounded bg-green-50 border border-green-200 px-2 py-1.5 hover:bg-green-100 transition-colors"
          title="View full outcome"
        >
          <p className="text-xs text-green-700 font-medium mb-0.5">Outcome</p>
          <p className="text-xs text-green-600 line-clamp-2 whitespace-pre-wrap">
            {task.outcomeSummary.replace(/[#*`_\[\]()]/g, "").slice(0, 160)}
          </p>
        </button>
      )}
      {task.parentTaskId && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-ink-2">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Subtask
        </div>
      )}
      {task.outcomeFileId && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-blue-600">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Full report available
        </div>
      )}
      {task.outcomeAudioId && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-accent">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          Audio narration available
        </div>
      )}
      {subtaskCount && subtaskCount.total > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-2">
          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.round((subtaskCount.completed / subtaskCount.total) * 100)}%` }}
            />
          </div>
          <span>{subtaskCount.completed}/{subtaskCount.total} subtasks</span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <StatusBadge status={task.status} />
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
            {formatTargetStatus(task)}
          </span>
          {agentName && (
            <span className="max-w-[10rem] truncate rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
              {agentName}
            </span>
          )}
          {projectName && (
            <span className="max-w-[10rem] truncate rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
              {projectName}
            </span>
          )}
          {requestedByLabel && (
            <span className="max-w-[12rem] truncate rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1" title={requesterAgentLabel ?? undefined}>
              {requestedByLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showDoNow && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDoNow();
              }}
              className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20"
              title="Start this task now"
            >
              Do now
            </button>
          )}
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
  projectName,
  onOpenDetails,
  onRestore,
  onDelete,
}: {
  task: Task;
  agentName: string | null;
  projectName: string | null;
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
            aria-label="Open task details"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={onRestore}
            className="rounded p-1 text-ink-2 hover:bg-green-100 hover:text-green-600"
            title="Restore task"
            aria-label="Restore task"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-ink-2 hover:bg-red-100 hover:text-red-600"
            title="Delete permanently"
            aria-label="Delete task permanently"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
            Archived
          </span>
          {agentName && (
            <span className="max-w-[10rem] truncate rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
              {agentName}
            </span>
          )}
          {projectName && (
            <span className="max-w-[10rem] truncate rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
              {projectName}
            </span>
          )}
          {requestedByLabel && (
            <span className="max-w-[12rem] truncate rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1" title={requesterAgentLabel ?? undefined}>
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

function formatTargetStatus(task: {
  status: string;
  targetCompletionAt?: number;
  doNowAt?: number;
  completedAt?: number;
}): string {
  if (task.status === "completed") {
    return task.completedAt ? `Completed ${formatShortDate(task.completedAt)}` : "Completed";
  }
  if (task.status === "failed") {
    return "Failed";
  }
  if (!task.targetCompletionAt) {
    if (task.status === "in_progress") {
      if (task.doNowAt) {
        return `Started ${formatTimeAgo(task.doNowAt)}`;
      }
      return "In progress, ETA unknown";
    }
    return "No target date";
  }

  const now = Date.now();
  if (task.targetCompletionAt < now) {
    const overdueHours = Math.max(1, Math.ceil((now - task.targetCompletionAt) / (1000 * 60 * 60)));
    return `Overdue ${overdueHours}h`;
  }
  const hours = Math.max(1, Math.ceil((task.targetCompletionAt - now) / (1000 * 60 * 60)));
  if (hours <= 24) return `ETA ${hours}h`;
  return `ETA ${new Date(task.targetCompletionAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
