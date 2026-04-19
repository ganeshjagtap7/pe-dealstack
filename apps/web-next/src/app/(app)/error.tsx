"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold text-primary mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-600 mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "#003366" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
