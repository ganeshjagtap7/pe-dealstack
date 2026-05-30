import { redirect } from "next/navigation";

// Google Workspace OAuth handles both first-time sign-up and returning sign-in
// — Supabase creates the user record on first callback. The dedicated signup
// page is collapsed into /login to keep one button, one notice, one path.
// Kept as a redirect (vs deleted) so links to /signup from old marketing
// emails, the previous (auth)/login footer, or browser autofill still work.
export default function SignupPage() {
  redirect("/login");
}
