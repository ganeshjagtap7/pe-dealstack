"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Logo } from "./Logo";
import { useUser } from "@/providers/UserProvider";
import { NAV_ITEMS, type NavItem } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { InviteTeamModal } from "./InviteTeamModal";

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
        isActive
          ? "bg-primary text-white shadow-sm"
          : "text-text-secondary hover:bg-primary-light hover:text-primary",
        item.isAI && !isActive && "hover:bg-secondary-light hover:text-secondary"
      )}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[20px]",
          item.isAI && !isActive && "text-secondary"
        )}
      >
        {item.icon}
      </span>
      <span className="nav-label text-sm font-medium">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
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
      if (item.divider) continue;
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
            <h2 className="text-xl font-bold tracking-tight text-primary">PE OS</h2>
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
                className={cn("my-2 mx-2 border-t border-border-subtle", collapsed && "hidden")}
              />
            ) : (
              <NavLink key={item.id} item={item} isActive={item.id === activeId} />
            )
          )}
        </nav>

        {/* Bottom actions */}
        <div className={cn("flex flex-col gap-2 mt-4 pt-4 border-t border-border-subtle", collapsed && "hidden")}>
          {isMember && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              title="Invite Team Members"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm text-text-secondary hover:bg-secondary-light hover:text-secondary"
            >
              <span className="material-symbols-outlined text-[20px] text-secondary">person_add</span>
              <span className="font-medium">Invite Team</span>
            </button>
          )}
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
              activeId === "settings"
                ? "bg-primary text-white shadow-sm"
                : "text-text-secondary hover:bg-primary-light hover:text-primary"
            )}
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
            <span className="font-medium">Settings</span>
          </Link>
        </div>

        {/* User profile */}
        <div className="mt-4">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 p-2.5 rounded-lg transition-all border border-border-subtle bg-background-body/50 hover:border-primary hover:bg-primary-light",
              collapsed && "justify-center border-none bg-transparent p-2.5"
            )}
          >
            <div
              className="bg-center bg-no-repeat bg-cover rounded-full size-8 shrink-0 border border-gray-200 shadow-sm flex items-center justify-center bg-primary text-white text-xs font-bold"
              style={user?.avatar ? { backgroundImage: `url('${encodeURI(user.avatar)}')` } : {}}
            >
              {!user?.avatar && initials}
            </div>
            {!collapsed && (
              <div className="flex flex-col overflow-hidden">
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
