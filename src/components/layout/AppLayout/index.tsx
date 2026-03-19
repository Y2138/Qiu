"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/hooks";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeSessionId, sessions } = useSession();

  const previousSessionIdRef = useRef<string | null>(null);
  const hasHandledInitialLoadRef = useRef(false);

  useEffect(() => {
    const isSettingsPage = pathname === "/settings" || pathname.startsWith("/settings/");
    const isChatRoot = pathname === "/chat" || pathname === "/" || pathname === "";
    const isSessionPage = pathname.startsWith("/chat/");
    const currentSessionIdFromPath = isSessionPage ? pathname.split("/chat/")[1]?.split("/")[0] : null;

    // 设置页面不处理导航
    if (isSettingsPage) {
      return;
    }

    // 初始加载时：如果有活动会话且在聊天根页面，跳转到会话页面
    if (!hasHandledInitialLoadRef.current && sessions.length > 0) {
      hasHandledInitialLoadRef.current = true;

      if (activeSessionId && (isChatRoot || pathname === "/")) {
        // 只有当不在正确的会话页面时才跳转
        if (currentSessionIdFromPath !== activeSessionId) {
          router.replace(`/chat/${activeSessionId}`);
          return;
        }
      }
    }

    // 当活动会话变化时（用户点击会话列表）
    if (activeSessionId && activeSessionId !== previousSessionIdRef.current) {
      previousSessionIdRef.current = activeSessionId;

      // 如果当前不在该会话页面，跳转到该会话
      if (currentSessionIdFromPath !== activeSessionId) {
        router.replace(`/chat/${activeSessionId}`);
      }
    }
  }, [activeSessionId, sessions.length, router, pathname]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 pt-12 overflow-hidden">
        <Sidebar />

        {/* 主内容区 */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
