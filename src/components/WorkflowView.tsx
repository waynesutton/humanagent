import {
  CheckCircle,
  XCircle,
  CircleNotch,
  MinusCircle,
  ShieldCheck,
  GearSix,
  Brain,
  Lightning,
  CodeBlock,
  FloppyDisk,
  Timer,
  CaretRight,
} from "@phosphor-icons/react";
import { formatDuration, formatDateTime } from "../lib/datetime";

export type WorkflowStep = {
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  detail?: string;
};

const STEP_ICONS: Record<string, React.ComponentType<{ size: number; className?: string; weight?: "fill" | "regular" | "bold" }>> = {
  "Security scan": ShieldCheck,
  "Config load": GearSix,
  "Context build": Brain,
  "LLM call": Lightning,
  "Parse response": CodeBlock,
  "Execute actions": Lightning,
  "Save memory": FloppyDisk,
};

function StepIcon({ label, size = 14 }: { label: string; size?: number }) {
  const Icon = STEP_ICONS[label] ?? GearSix;
  return <Icon size={size} weight="bold" />;
}

function StatusIndicator({ status }: { status: WorkflowStep["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle size={16} weight="fill" className="text-green-500" />;
    case "failed":
      return <XCircle size={16} weight="fill" className="text-red-500" />;
    case "in_progress":
      return <CircleNotch size={16} className="animate-spin text-accent" />;
    case "skipped":
      return <MinusCircle size={16} weight="fill" className="text-ink-2" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-surface-3" />;
  }
}

function ConnectorLine() {
  return (
    <div className="flex items-center px-1">
      <div className="h-px w-4 bg-surface-3 sm:w-6" />
      <CaretRight size={10} className="text-surface-3" />
    </div>
  );
}

/** Pipeline visualization inspired by GitHub Actions CI view */
export function WorkflowView({ steps, className }: { steps: WorkflowStep[]; className?: string }) {
  if (!steps || steps.length === 0) return null;

  const allCompleted = steps.every((s) => s.status === "completed");
  const anyFailed = steps.some((s) => s.status === "failed");
  const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const pipelineStart = steps[0]?.startedAt;
  const pipelineEnd = steps[steps.length - 1]?.completedAt;

  // Group steps into phases for the box layout
  const phases: { name: string; steps: WorkflowStep[] }[] = [
    { name: "Input", steps: steps.filter((s) => s.label === "Security scan") },
    { name: "Setup", steps: steps.filter((s) => ["Config load", "Context build"].includes(s.label)) },
    { name: "Processing", steps: steps.filter((s) => ["LLM call", "Parse response"].includes(s.label)) },
    { name: "Output", steps: steps.filter((s) => ["Execute actions", "Save memory"].includes(s.label)) },
  ].filter((p) => p.steps.length > 0);

  return (
    <div className={`rounded-lg border border-surface-3 bg-surface-1 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Timer size={14} className="text-ink-2" />
          <span className="text-xs font-medium text-ink-1">Pipeline</span>
        </div>
        <div className="flex items-center gap-1.5">
          {allCompleted ? (
            <CheckCircle size={14} weight="fill" className="text-green-500" />
          ) : anyFailed ? (
            <XCircle size={14} weight="fill" className="text-red-500" />
          ) : (
            <CircleNotch size={14} className="animate-spin text-accent" />
          )}
          <span className="text-xs font-semibold text-ink-0">
            {allCompleted ? "Success" : anyFailed ? "Failed" : "Running"}
          </span>
        </div>
        <span className="text-xs tabular-nums text-ink-2">
          Total: {formatDuration(totalDuration)}
        </span>
        {pipelineStart && (
          <span className="text-xs text-ink-2">
            {formatDateTime(pipelineStart, { timeOnly: true })}
          </span>
        )}
      </div>

      {/* Pipeline graph */}
      <div className="overflow-x-auto p-4">
        <div className="flex items-stretch gap-0">
          {phases.map((phase, phaseIdx) => (
            <div key={phase.name} className="flex items-center">
              {/* Phase box */}
              <div className="rounded border border-surface-3 bg-surface-0 px-3 py-2">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-2">
                  {phase.name}
                </div>
                <div className="space-y-1.5">
                  {phase.steps.map((step) => (
                    <div
                      key={step.label}
                      className="flex items-center gap-2"
                      title={step.detail ?? undefined}
                    >
                      <StatusIndicator status={step.status} />
                      <StepIcon label={step.label} size={13} />
                      <span className="whitespace-nowrap text-xs text-ink-0">
                        {step.label}
                      </span>
                      {step.durationMs !== undefined && (
                        <span className="ml-auto whitespace-nowrap pl-3 text-xs tabular-nums text-ink-2">
                          {formatDuration(step.durationMs)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Connector between phases */}
              {phaseIdx < phases.length - 1 && <ConnectorLine />}
            </div>
          ))}
        </div>
      </div>

      {/* Elapsed footer (only when pipeline is done) */}
      {pipelineEnd && pipelineStart && (
        <div className="border-t border-surface-3 px-4 py-1.5">
          <span className="text-[10px] tabular-nums text-ink-2">
            Elapsed: {formatDuration(pipelineEnd - pipelineStart)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Compact inline version for chat views */
export function WorkflowViewCompact({ steps, className }: { steps: WorkflowStep[]; className?: string }) {
  if (!steps || steps.length === 0) return null;

  const allCompleted = steps.every((s) => s.status === "completed");
  const anyFailed = steps.some((s) => s.status === "failed");
  const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div
            className="flex items-center gap-1 rounded-full border border-surface-3 bg-surface-1 px-2 py-0.5"
            title={`${step.label}${step.detail ? ": " + step.detail : ""}${step.durationMs ? " (" + formatDuration(step.durationMs) + ")" : ""}`}
          >
            <StatusIndicator status={step.status} />
            <span className="text-[10px] text-ink-1">{step.label}</span>
            {step.durationMs !== undefined && (
              <span className="text-[10px] tabular-nums text-ink-2">
                {formatDuration(step.durationMs)}
              </span>
            )}
          </div>
          {i < steps.length - 1 && (
            <CaretRight size={8} className="mx-0.5 text-surface-3" />
          )}
        </div>
      ))}
      <div className="ml-1 flex items-center gap-1 text-[10px]">
        {allCompleted ? (
          <CheckCircle size={12} weight="fill" className="text-green-500" />
        ) : anyFailed ? (
          <XCircle size={12} weight="fill" className="text-red-500" />
        ) : (
          <CircleNotch size={12} className="animate-spin text-accent" />
        )}
        <span className="tabular-nums text-ink-2">{formatDuration(totalDuration)}</span>
      </div>
    </div>
  );
}
