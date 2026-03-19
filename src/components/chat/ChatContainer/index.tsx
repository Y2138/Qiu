"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import {
  FileText,
  BriefcaseBusiness,
  NotebookTabs,
  Sparkles,
} from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { Button } from "@/components/common/Button";
import { useChat } from "@/hooks/useChat";
import { useSession } from "@/hooks/useSession";
import { useModel } from "@/hooks/useModel";
import {
  getConsumedCheckpointIds,
  getLatestRunnableCheckpoint,
} from "@/lib/agent/view-model";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/utils/helpers";
import type { AgentRuntimeRequest, FileAttachment } from "@/types/chat";

const welcomeActions = [
  {
    icon: NotebookTabs,
    title: "整理需求并给出计划",
    description: "我会先拆成步骤，再继续推进。",
  },
  {
    icon: FileText,
    title: "总结刚上传的文件",
    description: "适合处理 txt、md、pdf。",
  },
  {
    icon: BriefcaseBusiness,
    title: "帮我推进今天的任务",
    description: "把目标拆开并逐步执行。",
  },
];

interface ChatContainerProps {
  className?: string;
}

function getSessionIdFromPathname(pathname: string | null): string | null {
  if (!pathname?.startsWith("/chat/")) return null;
  const segment = pathname.replace(/^\/chat\/?/, "").split("/")[0];
  return segment && segment !== "chat" ? segment : null;
}

function buildAgentConfig(input: {
  workMode: "plan" | "direct";
  autoMemoryEnabled: boolean;
  allowMcp: boolean;
  enabledPromptPresetIds: string[];
}): AgentRuntimeRequest {
  const maxSteps = input.workMode === "plan" ? 4 : 2;

  return {
    enabled: true,
    promptPresetIds: input.enabledPromptPresetIds,
    allowMcp: input.allowMcp,
    maxSteps,
    memoryMode: input.autoMemoryEnabled ? "session+user" : "session",
  };
}

export function ChatContainer({ className }: ChatContainerProps) {
  const pathname = usePathname();
  const paramsSessionId = useParams<{ sessionId?: string }>()?.sessionId;
  const [input, setInput] = useState("");

  const workMode = useSettingsStore((s) => s.workMode);
  const autoMemoryEnabled = useSettingsStore((s) => s.autoMemoryEnabled);
  const allowMcp = useSettingsStore((s) => s.allowMcp);
  const enabledPromptPresetIds = useSettingsStore(
    (s) => s.enabledPromptPresetIds,
  );
  const sendOnEnter = useSettingsStore((s) => s.sendOnEnter);
  const showTimestamp = useSettingsStore((s) => s.showTimestamp);
  const fontSize = useSettingsStore((s) => s.fontSize);

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    currentSessionId,
    loadSessionMessages,
    sendMessage,
    continueFromCheckpoint,
    regenerate,
    stopGeneration,
  } = useChat();
  const {
    activeSessionId,
    sessions,
    isLoading: isSessionLoading,
    setActiveSession,
  } = useSession();
  const { currentModel, setCurrentModel, modelsForActiveApiKey } = useModel();

  const effectiveSessionId =
    getSessionIdFromPathname(pathname) ??
    (paramsSessionId && typeof paramsSessionId === "string"
      ? paramsSessionId
      : activeSessionId);

  const availableModels = modelsForActiveApiKey;
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === effectiveSessionId),
    [effectiveSessionId, sessions],
  );
  const displayedMessages = useMemo(() => {
    if (!effectiveSessionId) return [];
    return messages.filter(
      (message) => message.sessionId === effectiveSessionId,
    );
  }, [effectiveSessionId, messages]);
  const consumedCheckpointIds = useMemo(
    () => getConsumedCheckpointIds(displayedMessages),
    [displayedMessages],
  );
  const latestRunnableCheckpoint =
    getLatestRunnableCheckpoint(displayedMessages);

  const isResolvingInitialSession =
    !effectiveSessionId && isSessionLoading && sessions.length === 0;
  const isLoadingCurrentSession =
    !!effectiveSessionId &&
    (isLoading || currentSessionId !== effectiveSessionId);
  const shouldShowWelcome =
    displayedMessages.length === 0 &&
    !isResolvingInitialSession &&
    !isLoadingCurrentSession;

  const agentConfig = useMemo(
    () =>
      buildAgentConfig({
        workMode,
        autoMemoryEnabled,
        allowMcp,
        enabledPromptPresetIds,
      }),
    [
      workMode,
      autoMemoryEnabled,
      allowMcp,
      enabledPromptPresetIds,
    ],
  );

  useEffect(() => {
    if (availableModels.length > 0) {
      const preferredModel = currentSession?.model
        ? availableModels.find((model) => model.id === currentSession.model)
        : undefined;
      const nextModel = preferredModel ?? availableModels[0];
      const modelExists = availableModels.some(
        (model) => model.id === currentModel?.id,
      );

      if (!modelExists || currentModel?.id !== nextModel.id) {
        setCurrentModel(nextModel);
      }
    }
  }, [availableModels, currentModel, currentSession?.model, setCurrentModel]);

  useEffect(() => {
    if (effectiveSessionId && effectiveSessionId !== activeSessionId) {
      setActiveSession(effectiveSessionId);
    }
  }, [effectiveSessionId, activeSessionId, setActiveSession]);

  useEffect(() => {
    if (!effectiveSessionId || currentSessionId === effectiveSessionId) {
      return;
    }

    void loadSessionMessages(effectiveSessionId);
  }, [currentSessionId, effectiveSessionId, loadSessionMessages]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent, attachments?: FileAttachment[]) => {
      event.preventDefault();
      if (!input.trim() && !attachments?.length) return;

      const content = input.trim() || "请基于我刚刚上传的文件继续处理。";
      await sendMessage(
        content,
        attachments,
        latestRunnableCheckpoint
          ? { ...agentConfig, resumeFromCheckpointId: undefined }
          : agentConfig,
      );
      setInput("");
    },
    [agentConfig, input, latestRunnableCheckpoint, sendMessage],
  );

  const handleResumeCheckpoint = useCallback(
    (checkpointId: string) => {
      void continueFromCheckpoint(checkpointId, agentConfig);
    },
    [agentConfig, continueFromCheckpoint],
  );

  const handleRegenerate = useCallback(
    (messageId: string) => {
      void regenerate(messageId, agentConfig);
    },
    [agentConfig, regenerate],
  );

  return (
    <div
      className={cn(
        "mx-auto my-4 flex w-full h-full max-w-5xl flex-col overflow-hidden",
        className,
      )}
    >
      {error && (
        <div className="w-full shrink-0 border-b border-destructive/20 bg-destructive/10 px-4 py-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <div className="flex h-full w-full flex-col px-4">
          {latestRunnableCheckpoint && (
            <div className="mt-4 rounded-3xl border border-sky-500/20 bg-sky-500/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    上一次处理被中断了
                  </p>
                  <p className="text-sm text-muted-foreground">
                    你可以直接继续，Qiu 会从最近一次可恢复的步骤接着做。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    handleResumeCheckpoint(
                      latestRunnableCheckpoint.checkpointId,
                    )
                  }
                  className="rounded-full px-4"
                >
                  继续处理
                </Button>
              </div>
            </div>
          )}

          {shouldShowWelcome ? (
            <div className="flex min-h-full flex-col items-center justify-center py-14">
              <div className="mb-10 max-w-xl text-center">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h1 className="text-3xl font-semibold text-foreground">
                  Qiu，随时帮你推进任务
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  直接说目标，或先上传文件。Qiu
                  会先理解任务、必要时拆步骤，并在对话里告诉你它正在做什么。
                </p>
              </div>

              <div className="grid w-full max-w-3xl gap-4 md:grid-cols-3">
                {welcomeActions.map((action) => (
                  <Button
                    key={action.title}
                    type="button"
                    variant="outline"
                    onClick={() => setInput(action.title)}
                    className="h-auto rounded-3xl border-border bg-card/80 p-5 text-left flex-col justify-start transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <action.icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {action.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList
              messages={displayedMessages}
              isLoading={isResolvingInitialSession || isLoadingCurrentSession}
              showTimestamp={showTimestamp}
              fontSize={fontSize}
              onResumeCheckpoint={handleResumeCheckpoint}
              onRegenerate={handleRegenerate}
              consumedCheckpointIds={consumedCheckpointIds}
            />
          )}
        </div>
      </div>

      <div className="shrink-0 backdrop-blur">
        <MessageInput
          sessionId={effectiveSessionId ?? undefined}
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          isStreaming={isStreaming}
          onStopGeneration={stopGeneration}
          currentModel={currentModel}
          availableModels={availableModels}
          onModelChange={setCurrentModel}
          sendOnEnter={sendOnEnter}
          fontSize={fontSize}
          hasRunnableCheckpoint={Boolean(latestRunnableCheckpoint)}
          onResumeLatest={() => {
            if (latestRunnableCheckpoint) {
              handleResumeCheckpoint(latestRunnableCheckpoint.checkpointId);
            }
          }}
        />
      </div>
    </div>
  );
}
