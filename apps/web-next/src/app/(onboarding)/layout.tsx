// Minimal layout for the onboarding flow — no sidebar, no app header.
// Matches the full-screen wizard from apps/web/onboarding.html (3a796c8).
// The root body has overflow-hidden for the app shell, so we override it here
// to allow the onboarding wizard to scroll normally.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background-body overflow-y-auto" style={{ height: "100vh" }}>
      {children}
    </div>
  );
}
