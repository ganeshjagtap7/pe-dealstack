"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/providers/AuthProvider";
import { UserProvider } from "@/providers/UserProvider";
import { NotificationCountProvider } from "@/providers/NotificationCountProvider";
import { PresenceProvider } from "@/providers/PresenceProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { IngestDealModalProvider } from "@/providers/IngestDealModalProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { FeedbackButton } from "@/components/onboarding/FeedbackButton";
import { AIAssistant } from "@/components/layout/AIAssistant";
import { CommandPalette } from "@/components/layout/CommandPalette";

// Pages that manage their own internal scrolling (full-bleed flex layouts with
// docked side panels). For these we drop the layout's overflow-y-auto wrapper
// so `h-full` chains resolve to the viewport height; otherwise the docked
// chat panel collapses below the deal content instead of side-by-side.
function isFullBleedPage(pathname: string): boolean {
  return /^\/deals\/[^/]+$/.test(pathname);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = isFullBleedPage(pathname);
  return (
    <AuthProvider>
      <UserProvider>
        <NotificationCountProvider>
          <PresenceProvider>
            <ToastProvider>
              <IngestDealModalProvider>
                <div className="flex h-screen w-full overflow-hidden">
                  <Sidebar />
                  <main className="flex h-full flex-1 flex-col overflow-hidden bg-background-body min-w-0">
                    <Header />
                    <div
                      className={
                        fullBleed
                          ? "flex-1 min-h-0 flex flex-col overflow-hidden"
                          : "flex-1 overflow-y-auto custom-scrollbar"
                      }
                    >
                      <div
                        key={pathname}
                        className={
                          fullBleed
                            ? "page-fade-in flex-1 min-h-0 flex flex-col overflow-hidden"
                            : "page-fade-in"
                        }
                      >
                        {children}
                      </div>
                    </div>
                  </main>
                  <FeedbackButton />
                  <AIAssistant />
                  <CommandPalette />
                </div>
              </IngestDealModalProvider>
            </ToastProvider>
          </PresenceProvider>
        </NotificationCountProvider>
      </UserProvider>
    </AuthProvider>
  );
}
