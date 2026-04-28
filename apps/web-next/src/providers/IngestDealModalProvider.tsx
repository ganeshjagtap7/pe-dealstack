"use client";

// ---------------------------------------------------------------------------
// IngestDealModalProvider — exposes a single modal instance and an
// `openDealIntake()` helper to all (app) routes. Mounted once at the (app)
// layout root alongside CommandPalette so any trigger (Header CTA, command
// palette action, dashboard quick-action, deals page UploadCard) can open
// the modal without prop drilling.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { IngestDealModal } from "@/components/deal-intake/IngestDealModal";

interface IngestDealModalContextValue {
  openDealIntake: () => void;
  closeDealIntake: () => void;
}

const IngestDealModalContext = createContext<IngestDealModalContextValue | null>(null);

export function IngestDealModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openDealIntake = useCallback(() => setOpen(true), []);
  const closeDealIntake = useCallback(() => setOpen(false), []);

  return (
    <IngestDealModalContext.Provider value={{ openDealIntake, closeDealIntake }}>
      {children}
      <IngestDealModal open={open} onClose={closeDealIntake} />
    </IngestDealModalContext.Provider>
  );
}

export function useIngestDealModal(): IngestDealModalContextValue {
  const ctx = useContext(IngestDealModalContext);
  if (!ctx) {
    // Defensive fallback — outside the provider (e.g. /deal-intake page itself,
    // which renders the form directly), opening just navigates as a hard link.
    return {
      openDealIntake: () => {
        if (typeof window !== "undefined") window.location.href = "/deal-intake";
      },
      closeDealIntake: () => {},
    };
  }
  return ctx;
}
