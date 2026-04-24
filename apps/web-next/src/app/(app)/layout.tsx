"use client";

import { AuthProvider } from "@/providers/AuthProvider";
import { UserProvider } from "@/providers/UserProvider";
import { NotificationCountProvider } from "@/providers/NotificationCountProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { FeedbackButton } from "@/components/onboarding/FeedbackButton";
import { AIAssistant } from "@/components/layout/AIAssistant";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UserProvider>
        <NotificationCountProvider>
          <ToastProvider>
            <div className="flex h-screen w-full overflow-hidden">
              <Sidebar />
              <main className="flex h-full flex-1 flex-col overflow-hidden bg-background-body min-w-0">
                <Header />
                <div className="flex-1 overflow-y-auto custom-scrollbar page-transition-fade-in">
                  {children}
                </div>
              </main>
              <FeedbackButton />
              <AIAssistant />
            </div>
          </ToastProvider>
        </NotificationCountProvider>
      </UserProvider>
    </AuthProvider>
  );
}
