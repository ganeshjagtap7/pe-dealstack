"use client";

import Link from "next/link";
import { useUser } from "@/providers/UserProvider";
import { WidgetShell } from "./shell";

// Ported from apps/web/js/widgets/quick-actions.js.
// Hides "Create Task" for non-admins.
const BASE_ACTIONS = [
  { icon: "add_circle", label: "New Deal", href: "/deal-intake" },
  { icon: "upload_file", label: "Upload Doc", href: "/data-room" },
  { icon: "person_add", label: "Add Contact", href: "/contacts" },
];

const ADMIN_ROLES = new Set(["ADMIN", "PARTNER", "PRINCIPAL"]);

export function QuickActionsWidget() {
  const { user } = useUser();
  const isAdmin = user?.role ? ADMIN_ROLES.has(user.role.toUpperCase()) : false;

  const actions = [...BASE_ACTIONS];
  if (isAdmin) {
    actions.push({ icon: "task_alt", label: "Create Task", href: "/admin" });
  }

  return (
    <WidgetShell title="Quick Actions" icon="bolt">
      <div className="grid grid-cols-2 gap-3 p-4">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-border-subtle hover:border-primary hover:bg-primary-light/30 transition-all group"
          >
            <span className="material-symbols-outlined text-primary text-[28px] group-hover:scale-110 transition-transform">
              {a.icon}
            </span>
            <span className="text-xs font-semibold text-text-main">{a.label}</span>
          </Link>
        ))}
      </div>
    </WidgetShell>
  );
}
