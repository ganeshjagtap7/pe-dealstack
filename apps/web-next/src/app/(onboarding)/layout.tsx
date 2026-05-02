// Minimal layout for the onboarding flow — no sidebar, no app header.
// Matches the full-screen wizard from apps/web/onboarding.html (3a796c8).
// The root body has overflow-hidden for the app shell, so we override it here
// to allow the onboarding wizard to scroll normally.
//
// Providers: onboarding still needs an authenticated Supabase session
// (api.ts forwards the bearer token from AuthProvider), the user record
// (UserProvider), and the toast UI so catch blocks can surface failures
// to the user instead of console-warning silently. We deliberately skip the
// dashboard-only providers (NotificationCount, IngestDealModal) and chrome
// (Sidebar, Header, AIAssistant) — onboarding is a no-chrome wizard.
import { AuthProvider } from "@/providers/AuthProvider";
import { UserProvider } from "@/providers/UserProvider";
import { ToastProvider } from "@/providers/ToastProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UserProvider>
        <ToastProvider>
          <div className="min-h-screen bg-background-body overflow-y-auto" style={{ height: "100vh" }}>
            {children}
          </div>
        </ToastProvider>
      </UserProvider>
    </AuthProvider>
  );
}
