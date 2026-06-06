"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/providers/ToastProvider";

// Auto-creates a default LBO model and redirects to the detail page.
// Lets links like "New LBO" land directly on the editor without a wizard.
export default function NewValuationPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        const created = await api.post<{ id: string }>("/valuations", {});
        router.replace(`/valuations/${created.id}`);
      } catch {
        showToast("Couldn't create a new model.", "error");
        router.replace("/valuations");
      }
    })();
  }, [router, showToast]);

  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
