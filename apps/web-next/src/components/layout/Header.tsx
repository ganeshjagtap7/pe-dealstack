"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationsDropdown } from "./NotificationsDropdown";

export function Header() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showDealActions = pathname === "/deals";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle px-6 bg-surface-card z-40 sticky top-0">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative hidden w-full max-w-lg md:block group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <span className="material-symbols-outlined text-text-muted group-focus-within:text-primary transition-colors text-[20px]">
              search
            </span>
          </div>
          <input
            ref={searchRef}
            className="block w-full rounded-md border border-border-subtle bg-background-body py-2 pl-10 pr-10 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-sm"
            placeholder="Search deals by name, industry, or thesis..."
            type="text"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <button className="p-1 hover:bg-gray-200 rounded transition-colors text-primary">
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {showDealActions && (
          <>
            <Link
              href="/deal-intake"
              className="flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm transition-colors text-sm font-medium border-2 border-primary text-primary bg-white hover:bg-primary hover:text-white"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Import Deals
            </Link>
            <Link
              href="/deal-intake"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg shadow-sm hover:bg-primary-hover transition-colors text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              Ingest Deal Data
            </Link>
          </>
        )}

        {/* Notifications — real-data dropdown */}
        <NotificationsDropdown />

        <div className="h-6 w-px bg-border-subtle" />

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 text-sm font-medium text-text-main hover:text-primary transition-colors"
          >
            <div
              className="bg-center bg-no-repeat bg-cover rounded-full size-8 border border-gray-200 shadow-sm flex items-center justify-center bg-primary text-white text-xs font-bold"
              style={user?.avatar ? { backgroundImage: `url('${user.avatar}')` } : {}}
            >
              {!user?.avatar && initials}
            </div>
            <span className="hidden md:inline">{user?.name || "Loading..."}</span>
            <span
              className={`material-symbols-outlined text-[18px] text-text-muted transition-transform duration-200 ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            >
              expand_more
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg shadow-lg py-1 z-50 bg-surface-card border border-border-subtle animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-3 border-b border-border-subtle">
                <p className="text-sm font-medium text-text-main">{user?.name}</p>
                <p className="text-xs text-text-muted truncate">{user?.role}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings"
                  className="flex items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-primary-light hover:text-primary transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  Profile
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-3 px-4 py-2 text-sm text-text-secondary hover:bg-primary-light hover:text-primary transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  <span className="material-symbols-outlined text-[18px]">settings</span>
                  Settings
                </Link>
              </div>
              <div className="border-t border-border-subtle py-1">
                <button
                  onClick={signOut}
                  className="flex items-center gap-3 px-4 py-2 text-sm w-full text-left text-red-600 hover:bg-red-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
