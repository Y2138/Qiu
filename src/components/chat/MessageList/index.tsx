"use client";

import { memo, useEffect } from "react";
import { ArrowDown, FileText } from "lucide-react";
import { AgentTrace } from "@/components/chat/AgentTrace";
import { Loading } from "@/components/common/Loading";
import { Button } from "@/components/common/Button";
import { MarkdownRenderer, StreamingText } from "@/components/chat";
import { useSmartScroll } from "@/hooks/useSmartScroll";
import { cn } from "@/utils/helpers";
import { buildAssistantParts } from "@/lib/agent/message-parts";
import type { FileAttachment, Message } from "@/types/chat";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  showTimestamp: boolean;
  fontSize: number;
  onResumeCheckpoint?: (checkpointId: string) => void;
  onRegenerate?: (messageId: string) => void;
  consumedCheckpointIds?: Set<string>;
}

function MessageListInner({
  messages,
  isLoading,
  showTimestamp,
  fontSize,
  onResumeCheckpoint,
  onRegenerate,
  consumedCheckpointIds,
}: MessageListProps) {
  const { containerRef, shouldAutoScroll, scrollToBottom } = useSmartScroll({
    threshold: 150,
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <div ref={containerRef} className="relative flex flex-1 h-full flex-col gap-4 overflow-y-auto py-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
        >
          <div
            className={cn(
              "max-w-[86%] rounded-[26px] px-5 py-4",
              message.role === "user"
                ? "rounded-tr-md bg-primary text-primary-foreground shadow-primary/20"
                : "rounded-tl-md border border-border/50 bg-muted text-foreground",
            )}
            style={{ fontSize: `${fontSize}px` }}
          >
            {message.files?.length ? <AttachmentSummary files={message.files} /> : null}

            {message.role === "user" ? (
              <span className="whitespace-pre-wrap break-words">{message.content}</span>
            ) : message.isStreaming ? (
              <div className="min-h-[1.5em]">
                <AgentInlineSummary
                  message={message}
                  onResumeCheckpoint={onResumeCheckpoint}
                  consumedCheckpointIds={consumedCheckpointIds}
                />
                <StreamingText content={message.content} isStreaming={true} speed={20} showCursor={true} />
              </div>
            ) : (
              <>
                <AgentInlineSummary
                  message={message}
                  onResumeCheckpoint={onResumeCheckpoint}
                  consumedCheckpointIds={consumedCheckpointIds}
                />
                <MarkdownRenderer content={message.content} />
                {onRegenerate && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRegenerate(message.id)}
                      className="h-7 rounded-full border-border/70 bg-background px-3 text-xs"
                    >
                      重新生成
                    </Button>
                  </div>
                )}
              </>
            )}

            {message.error && <p className="mt-2 text-sm text-destructive">{message.error}</p>}

            {showTimestamp && (
              <p className={cn(
                "mt-2 text-xs",
                message.role === "user" ? "text-primary-foreground/72" : "text-muted-foreground/80",
              )}>
                {new Date(message.createdAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
      ))}

      {isLoading && messages.length === 0 && (
        <div className="flex justify-center">
          <Loading size="lg" />
        </div>
      )}

      {!shouldAutoScroll && messages.length > 0 && (
        <Button
          type="button"
          onClick={() => scrollToBottom(true)}
          className={cn(
            "fixed right-8 bottom-28 z-10 h-12 w-12 rounded-full border-2 border-primary/20 p-0 shadow-xl shadow-primary/25 transition-all duration-200",
          )}
          title="滚动到底部"
        >
          <ArrowDown className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

function AgentInlineSummary({
  message,
  onResumeCheckpoint,
  consumedCheckpointIds,
}: {
  message: Message;
  onResumeCheckpoint?: (checkpointId: string) => void;
  consumedCheckpointIds?: Set<string>;
}) {
  const parts = buildAssistantParts({
    content: message.content,
    metadata: message.metadata,
  });
  const trace = parts.find((part) => part.kind === "agent_trace");

  if (!trace) return null;

  const canResume = trace.resumable
    ? !consumedCheckpointIds?.has(trace.resumable.checkpointId)
    : false;

  return (
    <AgentTrace
      trace={trace}
      onResumeCheckpoint={onResumeCheckpoint}
      canResume={canResume}
    />
  );
}

function AttachmentSummary({ files }: { files: FileAttachment[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="inline-flex items-center gap-2 rounded-2xl border border-current/10 bg-background/15 px-3 py-1.5 text-xs"
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="truncate">{file.name}</span>
        </div>
      ))}
    </div>
  );
}

export const MessageList = memo(MessageListInner);
