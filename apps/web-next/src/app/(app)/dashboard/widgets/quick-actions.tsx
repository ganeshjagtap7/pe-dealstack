"use client";

import Link from "next/link";
import { useUser } from "@/providers/UserProvider";
import { useIngestDealModal } from "@/providers/IngestDealModalProvider";
import { WidgetShell } from "./shell";

// Ported from quick-actions.js.
// Hides "Create Task" for non-admins.
//
// "New Deal" used to deep-link to /deal-intake. The full-page intake flow has
// since been replaced with a modal opened via IngestDealModalProvider, so the
// quick action now triggers the modal instead of navigating.

interface QuickAction {
  icon: string;
  label: string;
  href?: string;
  /** When set, the action runs `onClick` and the tile is rendered as a
   *  <button> instead of a <Link>. */
  onClick?: () => void;
}

const ADMIN_ROLES = new Set(["ADMIN", "PARTNER", "PRINCIPAL"]);

export function QuickActionsWidget() {
  const { user } = useUser();
  const { openDealIntake } = useIngestDealModal();
  const isAdmin = user?.role ? ADMIN_ROLES.has(user.role.toUpperCase()) : false;

  const actions: QuickAction[] = [
    { icon: "add_circle", label: "New Deal", onClick: openDealIntake },
    { icon: "upload_file", label: "Upload Doc", href: "/data-room" },
    { icon: "person_add", label: "Add Contact", href: "/contacts" },
  ];
  if (isAdmin) {
    actions.push({ icon: "task_alt", label: "Create Task", href: "/admin" });
  }

  return (
    <WidgetShell title="Quick Actions" icon="bolt">
      <div className="grid grid-cols-2 gap-3 p-4">
        {actions.map((a) => {
          const className =
            "flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-border-subtle hover:border-primary hover:bg-primary-light/30 transition-all group";
          const inner = (
            <>
              <span className="material-symbols-outlined text-primary text-[28px] group-hover:scale-110 transition-transform">
                {a.icon}
              </span>
              <span className="text-xs font-semibold text-text-main">{a.label}</span>
            </>
          );
          if (a.onClick) {
            return (
              <button key={a.label} type="button" onClick={a.onClick} className={className}>
                {inner}
              </button>
            );
          }
          return (
            <Link key={a.label} href={a.href!} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>
    </WidgetShell>
  );
}
