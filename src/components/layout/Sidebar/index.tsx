"use client";

import { useCallback, memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/utils/helpers";
import { useSession } from "@/hooks/useSession";
import { useUIStore } from "@/stores";
import { Plus, MessageSquare, Settings, Trash2, Search, Pencil, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/common/Button";
import type { Session } from "@/types/session";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isCollapsed: boolean;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
}

const SessionItem = memo(function SessionItem({
  session,
  isActive,
  isCollapsed,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftTitle(session.title);
  }, [session.title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setDraftTitle(session.title);
    setIsEditing(true);
  }, [session.title]);

  const handleCancelEdit = useCallback((event?: React.MouseEvent) => {
    event?.stopPropagation();
    setDraftTitle(session.title);
    setIsEditing(false);
  }, [session.title]);

  const handleSaveEdit = useCallback(async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setDraftTitle(session.title);
      setIsEditing(false);
      return;
    }
    if (nextTitle === session.title) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      await onRename(session.id, nextTitle);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to rename session:", error);
    } finally {
      setIsSaving(false);
    }
  }, [draftTitle, onRename, session.id, session.title]);

  // 收起状态下的简单展示
  if (isCollapsed) {
    return (
      <div
        onClick={() => onSelect(session.id)}
        className={cn(
          "w-10 h-10 flex items-center justify-center rounded-xl text-sm transition-all duration-200 cursor-pointer border mx-auto",
          isActive
            ? "bg-card text-primary font-medium border-primary/30 ring-1 ring-primary/20"
            : "text-sidebar-foreground border-sidebar-border/60 bg-card/50 hover:bg-card hover:text-secondary-foreground hover:border-sidebar-border",
        )}
        title={session.title}
      >
        <MessageSquare
          className={cn(
            "h-4 w-4",
            isActive ? "text-primary" : "text-sidebar-foreground/60",
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 px-3 py-3 rounded-xl text-sm transition-all duration-200 group cursor-pointer border",
        isActive
          ? "bg-card text-primary font-medium border-primary/30 ring-1 ring-primary/20"
          : "text-sidebar-foreground border-sidebar-border/60 bg-card/50 hover:bg-card hover:text-secondary-foreground hover:border-sidebar-border",
      )}
    >
      <div
        onClick={() => !isEditing && onSelect(session.id)}
        className="flex-1 flex items-center gap-2 text-left cursor-pointer min-w-0"
      >
        <MessageSquare
          className={cn(
            "h-4 w-4 flex-shrink-0",
            isActive ? "text-primary" : "text-sidebar-foreground/60",
          )}
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          {isEditing ? (
            <input
              ref={inputRef}
              value={draftTitle}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={() => void handleSaveEdit()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSaveEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftTitle(session.title);
                  setIsEditing(false);
                }
              }}
              disabled={isSaving}
              className="w-full rounded-md border border-primary/30 bg-background px-2 py-1 text-sm text-foreground outline-none ring-1 ring-primary/10"
            />
          ) : (
            <span 
              className="block truncate" 
              title={session.title}
            >
              {session.title}
            </span>
          )}
        </div>
      </div>
      <div className={cn("flex-shrink-0 transition-opacity flex items-center gap-0.5", isEditing ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        {isEditing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md p-0 text-sidebar-foreground/50 hover:bg-emerald-500/10 hover:text-emerald-600"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => void handleSaveEdit(event)}
              disabled={isSaving}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md p-0 text-sidebar-foreground/50 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md p-0 text-sidebar-foreground/50 hover:text-foreground"
            onClick={handleStartEdit}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-md p-0 text-sidebar-foreground/50 hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => onDelete(e, session.id)}
          disabled={isEditing}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});

export function Sidebar() {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const {
    filteredSessions,
    activeSessionId,
    createSession,
    deleteSession,
    renameSession,
    searchSessions,
    isLoading,
  } = useSession();
  const searchQuery = useUIStore((s) => s.searchQuery);

  const handleNewChat = useCallback(async () => {
    try {
      const session = await createSession();
      router.push(`/chat/${session.id}`);
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  }, [createSession, router]);

  // 仅通过 URL 跳转，由 ChatContainer 根据 params 同步 activeSession，避免 store 先更新、params 未更新时被 sync 改回旧 session 导致闪烁
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      router.push(`/chat/${sessionId}`);
    },
    [router],
  );

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      try {
        await deleteSession(sessionId);
        if (activeSessionId === sessionId) {
          router.push("/chat");
        }
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    },
    [activeSessionId, deleteSession, router],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      await renameSession(sessionId, title);
    },
    [renameSession],
  );

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return (
    <aside 
      className={cn(
        "flex-shrink-0 border-r border-sidebar-border bg-sidebar relative z-10 transition-all duration-300",
        isCollapsed ? "w-16" : "w-60"
      )}
    >
      {/* 展开/收起按钮 - 位于边框上 */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center",
          "w-5 h-10 rounded-full cursor-pointer",
          "bg-card border border-sidebar-border shadow-sm",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          "transition-all duration-200 hover:scale-110",
          isCollapsed ? "-right-2.5" : "-right-2.5"
        )}
        title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3 ml-0.5" />
        ) : (
          <ChevronLeft className="h-3 w-3 mr-0.5" />
        )}
      </button>

      <div className="flex h-full flex-col">
        {/* New chat button */}
        <div className={cn(
          "bg-sidebar-background border-b border-sidebar-border",
          isCollapsed ? "p-2" : "p-4"
        )}>
          <Button
            variant="outline"
            onClick={handleNewChat}
            disabled={isLoading}
            className={cn(
              "gap-2 border-sidebar-border bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground transition-colors",
              isCollapsed ? "w-10 h-10 p-0 justify-center mx-auto" : "w-full justify-start"
            )}
            title="新建任务"
          >
            <Plus className="h-4 w-4 text-primary flex-shrink-0" />
            {!isCollapsed && <span>新建任务</span>}
          </Button>

          {!isCollapsed && (
            <div className="relative h-9 mt-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/50 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索任务..."
                value={searchQuery}
                onChange={(e) => searchSessions(e.target.value)}
                className="w-full h-9 pl-8 pr-2 bg-sidebar-background border border-sidebar-border rounded-md text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus:border-primary focus:ring-1 focus:ring-sidebar-ring/50 outline-none"
              />
            </div>
          )}
        </div>

        {/* Session list */}
        <div className={cn(
          "flex-1 overflow-y-auto bg-sidebar-background",
          isCollapsed ? "px-2 py-4" : "px-4 py-4"
        )}>
          {!isCollapsed && (
            <div className="text-xs font-medium uppercase tracking-wider px-2 mb-3 text-muted-foreground">
              历史会话
            </div>
          )}
          <div className={cn("space-y-2", isCollapsed && "space-y-3")}>
            {filteredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={activeSessionId === session.id}
                isCollapsed={isCollapsed}
                onSelect={handleSelectSession}
                onDelete={handleDeleteSession}
                onRename={handleRenameSession}
              />
            ))}
            {filteredSessions.length === 0 && !isLoading && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {isCollapsed ? "无" : "暂无会话"}
              </div>
            )}
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {isCollapsed ? "..." : "加载中..."}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={cn(
          "border-t border-sidebar-border bg-sidebar-background",
          isCollapsed ? "p-2" : "p-4"
        )}>
          <Link
            href="/settings"
            className={cn(
              "flex items-center rounded-xl text-sm hover:bg-card border border-sidebar-border/30 hover:border-sidebar-border text-sidebar-foreground transition-all",
              isCollapsed ? "justify-center w-10 h-10 p-0 mx-auto" : "gap-2 px-4 py-3"
            )}
            title="设置"
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && <span>设置</span>}
          </Link>
        </div>
      </div>
    </aside>
  );
}
