// Minimal layout for the onboarding flow — no sidebar, no app header.
// Matches the full-screen wizard from apps/web/onboarding.html (3a796c8).
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background-body">{children}</div>;
}
