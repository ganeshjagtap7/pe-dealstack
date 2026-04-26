"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/providers/AuthProvider";
import { UserProvider } from "@/providers/UserProvider";
import { NotificationCountProvider } from "@/providers/NotificationCountProvider";
import { PresenceProvider } from "@/providers/PresenceProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { FeedbackButton } from "@/components/onboarding/FeedbackButton";
import { AIAssistant } from "@/components/layout/AIAssistant";
import { CommandPalette } from "@/components/layout/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthProvider>
      <UserProvider>
        <NotificationCountProvider>
          <PresenceProvider>
            <ToastProvider>
              <div className="flex h-screen w-full overflow-hidden">
                <Sidebar />
                <main className="flex h-full flex-1 flex-col overflow-hidden bg-background-body min-w-0">
                  <Header />
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div key={pathname} className="page-fade-in">
                      {children}
                    </div>
                  </div>
                </main>
                <FeedbackButton />
                <AIAssistant />
                <CommandPalette />
              </div>
            </ToastProvider>
          </PresenceProvider>
        </NotificationCountProvider>
      </UserProvider>
    </AuthProvider>
  );
}
