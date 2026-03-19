"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Brain,
  CircleAlert,
  CircleCheckBig,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/utils/helpers";
import type { AgentTracePart } from "@/types/chat";

interface AgentTraceProps {
  trace: AgentTracePart;
  onResumeCheckpoint?: (checkpointId: string) => void;
  canResume?: boolean;
  className?: string;
}

export function AgentTrace({
  trace,
  onResumeCheckpoint,
  canResume = true,
  className,
}: AgentTraceProps) {
  if (trace.items.length === 0 && !trace.resumable) {
    return null;
  }
  
  const isCompleted = trace.status === "completed";
  const [isExpanded, setIsExpanded] = useState(!isCompleted);

  useEffect(() => {
    setIsExpanded(!isCompleted);
  }, [isCompleted, trace.items.length]);

  const contentHeightClass = isCompleted
    ? isExpanded
      ? "max-h-[11rem]"
      : "max-h-[3rem]"
    : "max-h-[11rem]";
  const canExpand = isCompleted && trace.items.length > 0;

  return (
    <section
      className={cn(
        "relative mb-3 overflow-hidden rounded-2xl border border-foreground/10 bg-background/50",
        className,
      )}
      aria-label="Agent Workflow"
    >
      <div className="flex items-center gap-2 border-b border-foreground/10 px-3 py-2 text-sm text-foreground/70">
        <Brain className="h-4 w-4 shrink-0 text-sky-600" />
        <span>{isCompleted ? "已思考" : "思考中"}</span>
      </div>

      {canExpand && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded((current) => !current)}
          className="absolute top-1.5 right-1.5 z-10 h-8 rounded-md px-2 text-[11px] text-foreground/60 hover:bg-foreground/5"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "收起工作流详情" : "展开查看更多"}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="mr-1 h-3.5 w-3.5" />
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      )}

      <div
        className={cn(
          "space-y-2 px-3 py-2.5 text-[13px] transition-[max-height] duration-300 ease-out",
          isCompleted && "pr-12",
          isCompleted && !isExpanded ? "overflow-hidden" : "overflow-y-auto",
          contentHeightClass,
        )}
      >
        {trace.items.map((item) => {
          if (item.type === "thinking_summary") {
            return (
              <div key={item.id} className="border-l border-foreground/15 pl-3 text-foreground/75">
                <div className="flex items-center gap-2">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0 opacity-75" />
                  <p className="leading-6">{item.text}</p>
                </div>
              </div>
            );
          }

          if (item.type === "tool_status") {
            const isRunning = item.state === "running";
            const isSuccess = item.state === "success";

            return (
              <div
                key={item.id}
                className={cn(
                  "border-l pl-3",
                  isRunning && "border-foreground/15 text-foreground/75",
                  isSuccess && "border-emerald-300/80 text-emerald-800 dark:text-emerald-200",
                  item.state === "failed" &&
                    "border-amber-300/80 text-amber-800 dark:text-amber-200",
                )}
              >
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <p className="min-w-0 leading-6">
                    {item.toolName}
                    {isRunning
                      ? " 正在执行"
                      : isSuccess
                        ? " 已完成"
                        : " 执行失败"}
                  </p>
                </div>
                {((item.summary || typeof item.latencyMs === "number") || (isExpanded && item.summary)) && (
                  <div className="pl-[1.35rem]">
                    {(item.summary || typeof item.latencyMs === "number") && (
                      <p className="text-[11px] leading-5 opacity-70">
                        {[
                          item.summary,
                          typeof item.latencyMs === "number"
                            ? `${item.latencyMs}ms`
                            : undefined,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {isExpanded && item.summary && (
                      <div className="mt-1 text-[12px] leading-5 whitespace-pre-wrap break-words opacity-80">
                        {item.summary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className={cn(
                "border-l pl-3",
                item.tone === "success" &&
                  "border-emerald-300/80 text-emerald-800 dark:text-emerald-200",
                item.tone === "warning" &&
                  "border-amber-300/80 text-amber-800 dark:text-amber-200",
                item.tone === "info" && "border-foreground/15 text-foreground/75",
              )}
            >
              <div className="flex items-center gap-2">
                {item.tone === "success" ? (
                  <CircleCheckBig className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                )}
                <p className="leading-6">{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      {trace.resumable && onResumeCheckpoint && canResume && (
        <div className="border-t border-foreground/10 px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-foreground/80">
              这一轮处理已暂停，可以从刚才的位置继续。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onResumeCheckpoint(trace.resumable!.checkpointId)
              }
              className="h-8 rounded-md px-3"
            >
              {trace.resumable.label}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
