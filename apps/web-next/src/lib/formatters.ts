/** Values stored in millions USD in the database */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absValue >= 1000) {
    const b = absValue / 1000;
    return sign + "$" + (b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)) + "B";
  }
  if (absValue >= 1) {
    return sign + "$" + (absValue >= 100 ? absValue.toFixed(0) : absValue >= 10 ? absValue.toFixed(1) : absValue.toFixed(2)) + "M";
  }
  const k = absValue * 1000;
  if (k >= 1) {
    return sign + "$" + (k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1) : k.toFixed(2)) + "K";
  }
  const dollars = absValue * 1000000;
  return sign + "$" + dollars.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "N/A";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
  if (days > 0) return days + (days === 1 ? " day ago" : " days ago");
  if (hours > 0) return hours + (hours === 1 ? " hour ago" : " hours ago");
  if (minutes > 0) return minutes + (minutes === 1 ? " min ago" : " mins ago");
  return "Just now";
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "N/A";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

export function getDocIcon(name: string | null | undefined): string {
  if (!name) return "description";
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "picture_as_pdf";
  if (ext === "xlsx" || ext === "xls") return "table_chart";
  if (ext === "csv") return "table_view";
  if (ext === "msg" || ext === "eml") return "mail";
  if (ext === "docx" || ext === "doc") return "article";
  if (ext === "md") return "summarize";
  if (name.startsWith("Deal Overview")) return "summarize";
  return "description";
}

/** Extract initials from a name or firstName+lastName. Max 2 chars, uppercased. */
export function getInitials(nameOrFirst?: string | null, lastName?: string): string {
  if (lastName !== undefined) {
    // Two-arg form: getInitials("John", "Doe") → "JD"
    const f = (nameOrFirst || "")[0] || "";
    const l = (lastName || "")[0] || "";
    return (f + l).toUpperCase() || "?";
  }
  // Single-arg form: getInitials("John Doe") → "JD"
  if (!nameOrFirst) return "?";
  return nameOrFirst.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}
