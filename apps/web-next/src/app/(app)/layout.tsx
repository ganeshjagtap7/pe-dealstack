"use client";

import { AuthProvider } from "@/providers/AuthProvider";
import { UserProvider } from "@/providers/UserProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { FeedbackButton } from "@/components/onboarding/FeedbackButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UserProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <Sidebar />
          <main className="flex h-full flex-1 flex-col overflow-hidden bg-background-body">
            <Header />
            <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>
          </main>
          <FeedbackButton />
        </div>
      </UserProvider>
    </AuthProvider>
  );
}
