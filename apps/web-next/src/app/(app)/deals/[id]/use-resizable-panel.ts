"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Resizable Panel Hook ─────────────────────────────────────
// Drag the border between deal details and chat to resize.
// Persists width preference in localStorage.
// Ported from deal-chat-resize.js.

const STORAGE_KEY = "pe-deal-chat-width";
const MIN_LEFT = 400;
const MIN_RIGHT = 300;
const HANDLE_WIDTH = 6; // matches w-1.5 (6px)

export function useResizablePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // null = use CSS default widths; number = explicit pixel width for left panel
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Internal refs for drag math (avoids stale closures in mousemove)
  const dragState = useRef({ startX: 0, startLeftWidth: 0 });

  // ── Restore saved width on mount ──────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && window.innerWidth >= 1024) {
      // Hydrate after mount: localStorage + window.innerWidth need a real
      // browser; lazy useState would mismatch SSR's null default.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeftWidth(parseInt(saved, 10));
    }
  }, []);

  // ── Clamp helper ──────────────────────────────────────────────
  const clamp = useCallback((value: number): number => {
    const container = containerRef.current;
    if (!container) return value;
    const mainWidth = container.getBoundingClientRect().width;
    const maxLeft = mainWidth - MIN_RIGHT - HANDLE_WIDTH;
    return Math.max(MIN_LEFT, Math.min(value, maxLeft));
  }, []);

  // ── Apply a width (clamp + set state) ─────────────────────────
  const applyWidth = useCallback(
    (value: number) => {
      setLeftWidth(clamp(value));
    },
    [clamp],
  );

  // ── Mouse handlers ────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const left = leftRef.current;
      if (!left) return;
      dragState.current.startX = e.clientX;
      dragState.current.startLeftWidth = left.getBoundingClientRect().width;
      setIsDragging(true);
    },
    [],
  );

  // Global mousemove + mouseup (attached when dragging)
  useEffect(() => {
    if (!isDragging) return;

    // Prevent text selection and set resize cursor on body
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragState.current.startX;
      applyWidth(dragState.current.startLeftWidth + delta);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      // Persist
      const left = leftRef.current;
      if (left) {
        const w = Math.round(left.getBoundingClientRect().width);
        localStorage.setItem(STORAGE_KEY, w.toString());
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, applyWidth]);

  // ── Touch handlers ────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const left = leftRef.current;
    if (!left) return;
    dragState.current.startX = touch.clientX;
    dragState.current.startLeftWidth = left.getBoundingClientRect().width;
    setIsDragging(true);
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const delta = touch.clientX - dragState.current.startX;
      applyWidth(dragState.current.startLeftWidth + delta);
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      const left = leftRef.current;
      if (left) {
        const w = Math.round(left.getBoundingClientRect().width);
        localStorage.setItem(STORAGE_KEY, w.toString());
      }
    };

    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, applyWidth]);

  // ── Double-click to reset ─────────────────────────────────────
  const onDoubleClick = useCallback(() => {
    setLeftWidth(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ── Style object for the left panel ───────────────────────────
  const leftPanelStyle: React.CSSProperties =
    leftWidth != null
      ? {
          flexBasis: leftWidth,
          flexGrow: 0,
          flexShrink: 0,
          maxWidth: leftWidth,
          minWidth: MIN_LEFT,
        }
      : { minWidth: MIN_LEFT };

  return {
    containerRef,
    leftRef,
    handleRef,
    leftPanelStyle,
    isDragging,
    onMouseDown,
    onTouchStart,
    onDoubleClick,
  };
}
