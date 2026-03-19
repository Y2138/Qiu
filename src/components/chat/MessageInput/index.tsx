"use client";

import { memo, useCallback, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, LoaderCircle, Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/common/Dropdown";
import { cn } from "@/utils/helpers";
import { uploadFile, validateFile } from "@/services/file";
import type { Model } from "@/types/model";
import type { FileAttachment } from "@/types/chat";

interface MessageInputProps {
  sessionId?: string;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent, attachments?: FileAttachment[]) => void;
  isLoading: boolean;
  isStreaming: boolean;
  onStopGeneration: () => void;
  currentModel?: Model | null;
  availableModels: Model[];
  onModelChange: (model: Model) => void;
  sendOnEnter: boolean;
  fontSize: number;
  hasRunnableCheckpoint?: boolean;
  onResumeLatest?: () => void;
}

function MessageInputInner({
  sessionId,
  input,
  onInputChange,
  onSubmit,
  isLoading,
  isStreaming,
  onStopGeneration,
  currentModel,
  availableModels,
  onModelChange,
  sendOnEnter,
  fontSize,
  hasRunnableCheckpoint,
  onResumeLatest,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const hasPendingUpload = attachments.some((attachment) => attachment.status === "uploading");

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter") return;

      const canSubmit = (input.trim() || attachments.length > 0) && !isLoading && !hasPendingUpload;
      const shouldSend = sendOnEnter
        ? !event.shiftKey
        : (event.metaKey || event.ctrlKey) && !event.shiftKey;

      if (shouldSend && canSubmit) {
        event.preventDefault();
        onSubmit(event, attachments);
        setAttachments([]);
      }
    },
    [attachments, hasPendingUpload, input, isLoading, onSubmit, sendOnEnter],
  );

  const handleOpenFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      if (!selectedFiles.length) return;

      setUploadError(null);

      for (const file of selectedFiles) {
        const validation = validateFile(file);
        if (!validation.valid) {
          setUploadError(validation.error ?? "文件暂不支持上传");
          continue;
        }

        const placeholderId = crypto.randomUUID();
        setAttachments((current) => [
          ...current,
          {
            id: placeholderId,
            name: file.name,
            type: "document",
            mimeType: file.type,
            size: file.size,
            status: "uploading",
          },
        ]);

        try {
          const uploaded = await uploadFile(file, { sessionId });
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.id === placeholderId
                ? {
                    id: uploaded.id,
                    name: uploaded.name,
                    type: uploaded.type,
                    mimeType: uploaded.mimeType,
                    size: uploaded.size,
                    status: "uploaded",
                  }
                : attachment,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "文件上传失败";
          setUploadError(message);
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.id === placeholderId
                ? { ...attachment, status: "failed", error: message }
                : attachment,
            ),
          );
        }
      }

      event.target.value = "";
    },
    [sessionId],
  );

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      if (hasPendingUpload) {
        event.preventDefault();
        return;
      }
      onSubmit(event, attachments);
      setAttachments([]);
    },
    [attachments, hasPendingUpload, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className="w-full px-4 pt-2 pb-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        className="hidden"
        multiple
        onChange={handleFileChange}
      />

      <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm transition-all duration-200 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              默认会先理解任务，再继续处理
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">可上传 txt / md / pdf</span>
            {hasRunnableCheckpoint && onResumeLatest && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResumeLatest}
                  className="h-7 rounded-full px-2.5 text-xs"
                >
                  继续上次处理
                </Button>
              )}
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-border/60 px-4 py-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm"
              >
                {attachment.status === "uploading" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{attachment.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {attachment.status === "uploading" && "文件上传中"}
                    {attachment.status === "uploaded" && "已上传，Agent 可按需读取"}
                    {attachment.status === "failed" && (attachment.error ?? "上传失败")}
                  </p>
                </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAttachment(attachment.id)}
                    className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
                    aria-label={`移除 ${attachment.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
          </div>
        )}

        <div className="relative">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉 Qiu 你要完成什么，或让它继续处理刚刚的文件..."
            rows={1}
            className={cn(
              "min-h-15 max-h-60 w-full resize-none bg-transparent px-4 pt-4 pb-3 text-foreground placeholder:text-muted-foreground focus:outline-none",
            )}
            style={{ fontSize: `${fontSize}px` }}
            disabled={isLoading}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
          <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenFileDialog}
                className="rounded-full px-3"
                title="上传文件"
              >
                <Paperclip className="h-4 w-4 text-primary" />
                上传文件
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-3 text-muted-foreground hover:text-foreground"
                  >
                    <span className="max-w-48 truncate">{currentModel?.name || "选择模型"}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-48 border-border bg-popover">
                {availableModels.length > 0 ? (
                  availableModels.map((model) => (
                    <DropdownMenuItem key={model.id} onClick={() => onModelChange(model)} className="cursor-pointer">
                      {model.name}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    请先配置模型
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            {uploadError && <span className="text-xs text-destructive">{uploadError}</span>}
            {isStreaming ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onStopGeneration}
                  className="rounded-full px-4"
                >
                  停止
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isLoading || hasPendingUpload || (!input.trim() && attachments.length === 0)}
                  className="rounded-full px-4"
                >
                  <Send className="h-4 w-4" />
                  发送
                </Button>
              )}
            </div>
          </div>
      </div>
    </form>
  );
}

export const MessageInput = memo(MessageInputInner);
