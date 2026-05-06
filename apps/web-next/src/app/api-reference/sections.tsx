import { Fragment } from "react";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type Endpoint = {
  method: Method;
  path: string;
  description: React.ReactNode;
  queryParams?: string;
  body?: string;
};

type EndpointGroup = {
  title: string;
  blurb: string;
  iconKey: string;
  iconWrapClass: string;
  defaultOpen?: boolean;
  endpoints: Endpoint[];
};

const METHOD_CLASS: Record<Method, string> = {
  GET: "bg-emerald-100 text-emerald-800",
  POST: "bg-blue-100 text-blue-800",
  PATCH: "bg-amber-100 text-amber-800",
  DELETE: "bg-rose-100 text-rose-800",
};

const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    title: "Deals",
    blurb: "Create, read, update, and delete deals in your pipeline",
    iconKey: "handshake",
    iconWrapClass: "bg-blue-500/10 text-blue-600",
    defaultOpen: true,
    endpoints: [
      {
        method: "GET",
        path: "/api/deals",
        description:
          "List all deals for the authenticated user's organization. Supports filtering and pagination.",
        queryParams: "status, stage, search, sortBy, sortOrder, limit, offset",
      },
      {
        method: "GET",
        path: "/api/deals/:id",
        description:
          "Get a single deal with all details including company, documents, activities, and team members.",
      },
      {
        method: "POST",
        path: "/api/deals",
        description: "Create a new deal manually.",
        body: `{
  "name": "Acme Corp Acquisition",
  "industry": "Manufacturing",
  "stage": "INITIAL_REVIEW",
  "dealSize": 50,
  "revenue": 25,
  "ebitda": 8
}`,
      },
      {
        method: "PATCH",
        path: "/api/deals/:id",
        description: (
          <>
            Update deal fields. Supports optimistic locking via{" "}
            <code className="bg-[#f1f5f9] px-1 rounded text-xs">
              lastKnownUpdatedAt
            </code>{" "}
            to prevent concurrent edit conflicts (returns 409 if stale).
          </>
        ),
      },
      {
        method: "DELETE",
        path: "/api/deals/:id",
        description:
          "Delete a deal and all associated data (documents, activities, memos). Admin or deal creator only.",
      },
      {
        method: "POST",
        path: "/api/deals/:id/analyze",
        description:
          "Trigger multi-document analysis. Requires 2+ documents. Detects conflicts, fills gaps, and synthesizes insights across all documents.",
      },
      {
        method: "POST",
        path: "/api/deals/:id/chat",
        description:
          "Chat with a deal using AI. Sends a question and receives an AI-generated answer based on all deal documents (RAG).",
        body: '{ "message": "What is the company\'s revenue growth trend?" }',
      },
    ],
  },
  {
    title: "Deal Ingestion",
    blurb: "Import deals from files, text, URLs, or emails",
    iconKey: "upload_file",
    iconWrapClass: "bg-violet-500/10 text-violet-600",
    endpoints: [
      {
        method: "POST",
        path: "/api/ingest",
        description:
          "Upload a document file (PDF, Word, Excel, CSV, text). Uses multipart form data. Excel/CSV files are auto-routed to bulk import.",
        body: `Content-Type: multipart/form-data
Body: file (binary)`,
      },
      {
        method: "POST",
        path: "/api/ingest/text",
        description: "Create a deal from pasted text content.",
        body: `{
  "text": "Deal content text...",
  "sourceType": "email"  // email | note | slack | whatsapp | other
}`,
      },
      {
        method: "POST",
        path: "/api/ingest/url",
        description:
          "Research a company from its website URL. Scrapes multiple pages and extracts deal data.",
        body: `{
  "url": "https://acme.com",
  "companyName": "Acme Corp",       // optional override
  "autoCreateDeal": true            // false = preview only
}`,
      },
      {
        method: "POST",
        path: "/api/ingest/email",
        description:
          "Upload a .eml email file. Parses email body for deal data and auto-processes PDF attachments.",
        body: `Content-Type: multipart/form-data
Body: file (.eml)`,
      },
      {
        method: "POST",
        path: "/api/ingest/bulk",
        description:
          "Bulk import deals from an Excel or CSV file. Each row creates a separate deal. Returns imported/failed/total counts.",
      },
    ],
  },
  {
    title: "Memos",
    blurb: "Create and manage investment memos with AI assistance",
    iconKey: "description",
    iconWrapClass: "bg-emerald-500/10 text-emerald-600",
    endpoints: [
      {
        method: "GET",
        path: "/api/memos?dealId=:dealId",
        description: "List all memos for a deal.",
      },
      {
        method: "POST",
        path: "/api/memos",
        description: "Create a new investment memo for a deal.",
        body: `{
  "dealId": "uuid",
  "title": "Investment Memo - Acme Corp",
  "templateId": "standard"   // optional: use a memo template
}`,
      },
      {
        method: "POST",
        path: "/api/memos/:id/generate",
        description: "AI-generate content for a specific memo section.",
        body: '{ "section": "executive_summary" }',
      },
    ],
  },
  {
    title: "Export & Audit",
    blurb: "Export data and view audit trails",
    iconKey: "download",
    iconWrapClass: "bg-amber-500/10 text-amber-600",
    endpoints: [
      {
        method: "GET",
        path: "/api/export/deals?format=csv",
        description: (
          <>
            Export all deals as CSV or JSON. Supported formats:{" "}
            <code className="bg-[#f1f5f9] px-1 rounded text-xs">csv</code>,{" "}
            <code className="bg-[#f1f5f9] px-1 rounded text-xs">json</code>. CSV
            includes headers: Name, Industry, Revenue, EBITDA, Stage, Status,
            Confidence, Created.
          </>
        ),
      },
      {
        method: "GET",
        path: "/api/audit",
        description:
          "View audit log entries. Filter by action, resourceType, resourceId, severity, date range. Paginated with limit/offset.",
        queryParams:
          "action, resourceType, resourceId, severity, startDate, endDate, limit, offset",
      },
    ],
  },
  {
    title: "Users & Invitations",
    blurb: "Manage team members and workspace invitations",
    iconKey: "group",
    iconWrapClass: "bg-rose-500/10 text-rose-600",
    endpoints: [
      {
        method: "GET",
        path: "/api/users/me",
        description:
          "Get the authenticated user's profile, role, organization, and preferences.",
      },
      {
        method: "GET",
        path: "/api/users/team",
        description: "List all team members in the user's organization.",
      },
      {
        method: "POST",
        path: "/api/invitations",
        description: "Invite a new team member. Admin only.",
        body: `{
  "email": "analyst@firm.com",
  "role": "MEMBER"   // ADMIN | MEMBER | VIEWER
}`,
      },
    ],
  },
];

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="p-4 rounded-lg bg-white border border-[#e2e8f0]">
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${METHOD_CLASS[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-[#111418]">{endpoint.path}</code>
      </div>
      <p className="text-sm text-[#64748b]">{endpoint.description}</p>
      {endpoint.queryParams && (
        <div className="text-xs font-mono text-[#64748b] mt-2">
          <span className="font-semibold text-[#111418]">Query params:</span>
          <span className="ml-2">{endpoint.queryParams}</span>
        </div>
      )}
      {endpoint.body && (
        <pre className="bg-[#1e293b] rounded-lg p-3 overflow-x-auto text-xs mt-3">
          <code className="text-gray-300 font-mono whitespace-pre">{endpoint.body}</code>
        </pre>
      )}
    </div>
  );
}

export function EndpointSections() {
  return (
    <div className="space-y-4">
      {ENDPOINT_GROUPS.map((group) => (
        <details
          key={group.title}
          className="group rounded-xl bg-[#f8fafc] border border-[#e2e8f0] overflow-hidden"
          open={group.defaultOpen}
        >
          <summary className="flex items-center gap-4 p-6 cursor-pointer list-none">
            <div
              className={`size-10 rounded-lg flex items-center justify-center flex-shrink-0 ${group.iconWrapClass}`}
            >
              <span className="material-symbols-outlined">{group.iconKey}</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#111418]">{group.title}</h3>
              <p className="text-sm text-[#64748b]">{group.blurb}</p>
            </div>
            <span className="material-symbols-outlined text-[#64748b] group-open:rotate-180 transition-transform">
              expand_more
            </span>
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-[#e2e8f0]">
            <div className="space-y-4">
              {group.endpoints.map((ep, idx) => (
                <Fragment key={`${ep.method}-${ep.path}-${idx}`}>
                  <EndpointCard endpoint={ep} />
                </Fragment>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
