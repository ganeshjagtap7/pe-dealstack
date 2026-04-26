"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Logo } from "./Logo";
import { useUser } from "@/providers/UserProvider";
import { useNotificationCount } from "@/providers/NotificationCountProvider";
import { usePresence } from "@/providers/PresenceProvider";
import { NAV_ITEMS, type NavItem } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { InviteTeamModal } from "./InviteTeamModal";

function NavLink({
  item,
  isActive,
  collapsed,
  showDot,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  showDot?: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "nav-item flex items-center gap-3 rounded-lg transition-colors relative",
        collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
        isActive
          ? "bg-primary text-white shadow-sm"
          : "text-text-secondary hover:bg-primary-light hover:text-primary",
        item.isAI && !isActive && "hover:bg-secondary-light hover:text-secondary"
      )}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[20px] shrink-0",
          item.isAI && !isActive && "text-secondary"
        )}
      >
        {item.icon}
      </span>
      {!collapsed && <span className="nav-label text-sm font-medium truncate">{item.label}</span>}
      {showDot && (
        <span
          className={cn(
            "rounded-full bg-secondary shrink-0",
            collapsed ? "absolute top-2 right-2 w-1.5 h-1.5" : "absolute top-2 right-2 w-1.5 h-1.5",
          )}
          style={{ boxShadow: "0 0 6px rgba(5,150,105,0.5)" }}
          aria-label="New activity"
        />
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { unreadCount } = useNotificationCount();
  const { teamHasRecentActivity } = usePresence();
  const [collapsed, setCollapsed] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === "true");
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(next));
  };

  const isAdmin = user?.systemRole === "ADMIN";
  const isMember = user?.systemRole === "ADMIN" || user?.systemRole === "MEMBER";

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.memberOnly && !isMember) return false;
    return true;
  });

  const getActiveId = () => {
    if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
    for (const item of NAV_ITEMS) {
      if (item.divider || !item.href) continue;
      if (pathname === item.href || pathname.startsWith(item.href + "/")) return item.id;
    }
    return "";
  };

  const activeId = getActiveId();
  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "";

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col z-20 transition-all duration-300 relative border-r border-border-subtle bg-surface-card shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Collapse button */}
      <button
        onClick={toggleCollapse}
        className="absolute -right-3 top-20 z-30 flex h-6 w-6 items-center justify-center rounded-full shadow-sm border border-border-subtle bg-surface-card hover:bg-primary-light hover:text-primary transition-colors"
      >
        <span
          className={cn(
            "material-symbols-outlined text-[16px] transition-transform duration-300",
            collapsed && "rotate-180"
          )}
        >
          chevron_left
        </span>
      </button>

      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-border-subtle">
        <Link href="/dashboard" className="flex items-center gap-2 text-primary">
          <Logo className="size-7 shrink-0" />
          {!collapsed && (
            <h2 className="logo-text text-xl font-bold tracking-tight text-primary">PE OS</h2>
          )}
        </Link>
      </div>

      {/* Nav */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto p-4 custom-scrollbar">
        <nav className="flex flex-col gap-1">
          {visibleItems.map((item) =>
            item.divider ? (
              <div
                key="divider"
                className={cn("sidebar-divider my-2 mx-2 border-t border-border-subtle", collapsed && "hidden")}
              />
            ) : (
              <NavLink
                key={item.id}
                item={item}
                isActive={item.id === activeId}
                collapsed={collapsed}
                // Activity dot: ported from apps/web/js/layout.js@1e843b9.
                // Show green dot on Deals nav when there are unread notifications
                // and the user isn't already on /deals. Polling cadence is
                // controlled by NotificationCountProvider (30s) — that provider
                // is the only "team activity" signal the API exposes today.
                // TODO(presence): replace with /presence endpoint once API
                // adds a per-team activity feed.
                showDot={item.id === "deals" && unreadCount > 0 && activeId !== "deals"}
              />
            )
          )}
        </nav>

        {/* Bottom actions */}
        <div className={cn("sidebar-actions flex flex-col gap-2 mt-4 pt-4 border-t border-border-subtle", collapsed && "hidden")}>
          {isMember && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              title="Invite Team Members"
              className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm text-text-secondary hover:bg-secondary-light hover:text-secondary"
            >
              <span className="material-symbols-outlined text-[20px] text-secondary">person_add</span>
              <span className="nav-label font-medium">Invite Team</span>
            </button>
          )}
          <Link
            href="/settings"
            className={cn(
              "nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
              activeId === "settings"
                ? "bg-primary text-white shadow-sm"
                : "text-text-secondary hover:bg-primary-light hover:text-primary"
            )}
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
            <span className="nav-label font-medium">Settings</span>
          </Link>
        </div>

        {/* Team activity indicator — green dot when any team member has been
            active within the last 5 minutes, gray otherwise. Driven by
            PresenceProvider (60s polling). Ports the sidebar activity dot
            from apps/web/js/layout.js@1e843b9 — that version keyed off
            unread notifications, but the spec for web-next is real-time
            team presence, so this consults usePresence() instead.
            TODO(presence): becomes meaningful once /presence ships in API. */}
        <div
          className={cn(
            "sidebar-activity flex items-center gap-2 mt-3 px-3 py-2 rounded-lg border border-border-subtle bg-background-body/40",
            collapsed && "justify-center px-0 border-none bg-transparent",
          )}
          title={teamHasRecentActivity ? "Team active now" : "Team is away"}
        >
          <span
            aria-hidden="true"
            className="block rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              backgroundColor: teamHasRecentActivity ? "#10B981" : "#9CA3AF",
              boxShadow: teamHasRecentActivity ? "0 0 6px rgba(16,185,129,0.55)" : "none",
            }}
          />
          {!collapsed && (
            <span className="text-[11px] font-medium text-text-secondary truncate">
              {teamHasRecentActivity ? "Team active now" : "Team is away"}
            </span>
          )}
        </div>

        {/* User profile */}
        <div className="user-profile mt-3">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 p-2.5 rounded-lg transition-all hover:shadow-sm border border-border-subtle bg-background-body/50 hover:border-primary hover:bg-primary-light",
              collapsed && "justify-center border-none bg-transparent p-2.5 hover:bg-[rgba(0,51,102,0.05)] hover:border-none hover:shadow-none"
            )}
            title="View Profile & Settings"
          >
            <div
              className={cn(
                "bg-center bg-no-repeat bg-cover rounded-full shrink-0 border border-gray-200 shadow-sm flex items-center justify-center bg-primary text-white text-xs font-bold",
                collapsed ? "size-9" : "size-8"
              )}
              style={user?.avatar ? { backgroundImage: `url('${encodeURI(user.avatar)}')` } : {}}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="user-info flex flex-col overflow-hidden">
                <span className="text-xs font-bold truncate text-text-main">
                  {user?.name || "Loading..."}
                </span>
                <span className="text-[10px] truncate text-text-secondary">
                  {user?.role || ""}
                </span>
              </div>
            )}
          </Link>
        </div>
      </div>
      {inviteOpen && <InviteTeamModal onClose={() => setInviteOpen(false)} />}
    </aside>
  );
}
