import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/layout/MarketingPageShell";

export const metadata: Metadata = {
  title: "Documentation - PE OS",
  description:
    "Comprehensive guides and documentation to help you set up and configure PE OS for your private equity firm.",
};

type FeatureGuide = {
  title: string;
  blurb: string;
  iconKey: string;
  iconWrapClass: string;
  items: { heading: string; body: React.ReactNode }[];
};

const QUICK_START = [
  {
    step: "1",
    title: "Create Your Account",
    body: (
      <>
        <p className="text-sm text-[#64748b] mb-3">
          Visit the{" "}
          <Link href="/signup" className="text-primary hover:underline">
            sign up page
          </Link>{" "}
          and enter your email, full name, and firm name. You&apos;ll receive a
          verification email to confirm your account.
        </p>
        <p className="text-sm text-[#64748b]">
          Once verified, log in and you&apos;ll be taken to your dashboard. The
          account creator is automatically assigned the{" "}
          <strong className="text-[#111418]">Admin</strong> role.
        </p>
      </>
    ),
  },
  {
    step: "2",
    title: "Import Your First Deal",
    body: (
      <>
        <p className="text-sm text-[#64748b] mb-3">
          Navigate to <strong className="text-[#111418]">Deal Intake</strong>{" "}
          from the sidebar. Upload a CIM, teaser, or any deal document (PDF,
          Word, Excel).
        </p>
        <p className="text-sm text-[#64748b]">
          Our AI extracts key data — company name, financials, industry — in
          seconds. Review the extraction preview with confidence scores before
          saving.
        </p>
      </>
    ),
  },
  {
    step: "3",
    title: "Invite Your Team",
    body: (
      <>
        <p className="text-sm text-[#64748b] mb-3">
          Go to <strong className="text-[#111418]">Settings</strong> and invite
          colleagues via email. Assign roles: Admin (full control), Member
          (standard access), or Viewer (read-only).
        </p>
        <p className="text-sm text-[#64748b]">
          Invitees receive an email link to join your workspace. All team
          members share the same deal pipeline and data room.
        </p>
      </>
    ),
  },
];

const FEATURE_GUIDES: FeatureGuide[] = [
  {
    title: "Deal Ingestion",
    blurb: "Upload documents, paste text, scrape URLs, or forward emails to create deals",
    iconKey: "upload_file",
    iconWrapClass: "bg-blue-500/10 text-blue-600",
    items: [
      {
        heading: "File Upload",
        body: "Upload PDF, Word (.docx), Excel (.xlsx, .csv), or plain text files. The system automatically detects the file type and routes it to the appropriate parser. Excel files with multiple deals are processed as bulk imports.",
      },
      {
        heading: "Text Paste",
        body: "Paste deal content directly — from emails, Slack messages, WhatsApp forwards, or meeting notes. Minimum 50 characters required. Select the source type for better AI extraction context.",
      },
      {
        heading: "URL Research",
        body: "Enter a company website URL and PE OS scrapes multiple pages (About, Team, Products, Services) to build a comprehensive company profile. Optionally preview the extraction before creating a deal.",
      },
      {
        heading: "Email Forwarding",
        body: "Upload .eml email files exported from Gmail or Outlook. PE OS extracts deal data from the email body and automatically processes any PDF attachments.",
      },
      {
        heading: "Confidence Scores",
        body: "Every extracted field gets a confidence score (0-100%). Fields below 60% are automatically flagged for manual review. Color-coded bars show extraction quality at a glance: green (>80%), yellow (60-80%), red (<60%).",
      },
    ],
  },
  {
    title: "Deal Management",
    blurb: "Track deals through your pipeline from initial review to close",
    iconKey: "handshake",
    iconWrapClass: "bg-emerald-500/10 text-emerald-600",
    items: [
      {
        heading: "Deal Pipeline",
        body: "View all deals in your CRM with filtering by stage (Initial Review, Due Diligence, LOI, Closing, Closed, Passed), status (Active, On Hold, Dead), and industry. Sort by date, name, or deal size.",
      },
      {
        heading: "Deal Details",
        body: "Each deal page shows company info, financials, AI-extracted data, activity timeline, attached documents, team members, and investment memos. Edit any field directly on the deal page.",
      },
      {
        heading: "Deal Team",
        body: "Assign team members to specific deals with access levels: View (read-only), Edit (modify deal data), or Admin (full control including delete). Track who's working on what.",
      },
      {
        heading: "Activity Feed",
        body: "Every action on a deal is logged — document uploads, stage changes, AI extractions, memo creation, team changes. The timeline gives a complete audit trail of deal progress.",
      },
    ],
  },
  {
    title: "AI Features",
    blurb: "AI-powered extraction, chat, memo generation, and multi-document analysis",
    iconKey: "psychology",
    iconWrapClass: "bg-violet-500/10 text-violet-600",
    items: [
      {
        heading: "AI Data Extraction",
        body: "Powered by GPT-4, the system extracts company name, industry, revenue, EBITDA, margins, employee count, headquarters, and more from any document. Financial data is validated against PE industry norms to catch extraction errors.",
      },
      {
        heading: "Chat with Deals",
        body: "Ask natural language questions about any deal. The AI uses RAG (Retrieval-Augmented Generation) to search across all documents for the deal and provide sourced answers. Example: \"What's the revenue growth trend?\" or \"Summarize the management team.\"",
      },
      {
        heading: "Investment Memo Builder",
        body: "Generate professional investment memos with AI-assisted sections: Executive Summary, Company Overview, Market Analysis, Financial Analysis, Investment Thesis, Risks, and Recommendation. Edit and customize each section.",
      },
      {
        heading: "Multi-Document Analysis",
        body: "When a deal has 2+ documents, PE OS automatically cross-references them to detect conflicts (e.g., different revenue figures in CIM vs teaser), fill data gaps, and synthesize insights across all sources.",
      },
    ],
  },
  {
    title: "Virtual Data Room",
    blurb: "Organize, share, and track deal documents securely",
    iconKey: "folder_open",
    iconWrapClass: "bg-amber-500/10 text-amber-600",
    items: [
      {
        heading: "Document Organization",
        body: "Create folders and subfolders to organize deal documents. Supported types: CIM, Teaser, Financial Model, NDA, LOI, Due Diligence reports, and custom document types.",
      },
      {
        heading: "File Management",
        body: "Upload, download, preview, and delete documents. Supported formats include PDF, Word, Excel, PowerPoint, and images. Maximum file size: 50MB per file.",
      },
      {
        heading: "Folder Insights",
        body: "AI-generated insights for each folder summarize key points across all documents within. Get an instant overview of what's in each section of your data room.",
      },
    ],
  },
  {
    title: "Team & Permissions",
    blurb: "Manage users, roles, and access control for your workspace",
    iconKey: "group",
    iconWrapClass: "bg-rose-500/10 text-rose-600",
    items: [
      {
        heading: "Workspace Roles",
        body: (
          <>
            <strong>Admin</strong> — full access: manage users, invite team,
            delete deals, view audit logs, export data. <strong>Member</strong>{" "}
            — standard access: create/edit deals, upload documents, use AI
            features. <strong>Viewer</strong> — read-only access to deals and
            documents.
          </>
        ),
      },
      {
        heading: "Invitations",
        body: "Admins can invite new team members via email. Invitations expire after 7 days and can be revoked. Invited users join the same workspace and firm with the assigned role.",
      },
      {
        heading: "Display Titles",
        body: "Set custom display titles (Managing Director, Vice President, Associate, Analyst) independently of system roles. Titles are visible to teammates but don't affect permissions.",
      },
    ],
  },
  {
    title: "Security & Compliance",
    blurb: "Encryption, audit trails, and data protection for regulated PE firms",
    iconKey: "shield",
    iconWrapClass: "bg-teal-500/10 text-teal-600",
    items: [
      {
        heading: "Data Encryption",
        body: "AES-256-GCM encryption at rest for sensitive deal fields. TLS 1.3 for all data in transit. Encryption keys are managed server-side and never exposed to clients.",
      },
      {
        heading: "Immutable Audit Trail",
        body: "Every action is logged — deal creation, edits, document uploads, AI extractions, exports, logins. Audit logs are INSERT-ONLY (cannot be modified or deleted) for SEC/regulatory compliance.",
      },
      {
        heading: "Data Export",
        body: "Export your deal data in CSV or JSON format at any time. Every export is audit-logged. Your data is yours — full portability guaranteed.",
      },
    ],
  },
];

export default function DocumentationPage() {
  return (
    <MarketingPageShell active="resources">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/5 to-blue-50 py-20">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <nav className="flex items-center justify-center gap-2 text-sm text-[#64748b] mb-6">
            <Link href="/resources" className="hover:text-primary transition-colors">
              Resources
            </Link>
            <span className="material-symbols-outlined text-base">chevron_right</span>
            <span className="text-[#111418] font-medium">Documentation</span>
          </nav>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-[#111418] mb-6">
            Documentation
          </h1>
          <p className="text-lg text-[#64748b] max-w-3xl mx-auto">
            Comprehensive guides to help you set up, configure, and get the most
            out of PE OS for your firm.
          </p>
        </div>
      </div>

      {/* Quick Start */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined">rocket_launch</span>
          </div>
          <h2 className="text-2xl font-bold text-[#111418]">Quick Start Guide</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {QUICK_START.map((s) => (
            <div
              key={s.step}
              className="p-6 rounded-xl bg-white border border-[#e2e8f0] shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {s.step}
                </div>
                <h3 className="font-bold text-[#111418]">{s.title}</h3>
              </div>
              {s.body}
            </div>
          ))}
        </div>
      </div>

      {/* Feature Guides */}
      <div className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-[#111418] mb-10">Feature Guides</h2>
          <div className="space-y-4">
            {FEATURE_GUIDES.map((guide) => (
              <details
                key={guide.title}
                className="group rounded-xl bg-[#f8fafc] border border-[#e2e8f0] overflow-hidden"
              >
                <summary className="flex items-center gap-4 p-6 cursor-pointer list-none">
                  <div
                    className={`size-10 rounded-lg flex items-center justify-center flex-shrink-0 ${guide.iconWrapClass}`}
                  >
                    <span className="material-symbols-outlined">{guide.iconKey}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-[#111418]">{guide.title}</h3>
                    <p className="text-sm text-[#64748b]">{guide.blurb}</p>
                  </div>
                  <span className="material-symbols-outlined text-[#64748b] group-open:rotate-180 transition-transform">
                    expand_more
                  </span>
                </summary>
                <div className="px-6 pb-6 pt-2 border-t border-[#e2e8f0]">
                  <div className="space-y-4 text-sm text-[#64748b]">
                    {guide.items.map((item) => (
                      <div key={item.heading}>
                        <h4 className="font-semibold text-[#111418] mb-1">
                          {item.heading}
                        </h4>
                        <p>{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* Need Help CTA */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-[#111418] mb-4">
            Can&apos;t find what you&apos;re looking for?
          </h2>
          <p className="text-[#64748b] mb-8">
            Check our Help Center for FAQs or reach out to our support team.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/help-center"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-lg text-white font-bold hover:opacity-90 transition-colors"
              style={{ backgroundColor: "#003366" }}
            >
              <span className="material-symbols-outlined">help</span>
              Visit Help Center
            </Link>
            <a
              href="mailto:hello@pocket-fund.com"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-lg bg-[#f1f5f9] text-[#111418] font-bold hover:bg-[#e2e8f0] transition-colors"
            >
              <span className="material-symbols-outlined">mail</span>
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </MarketingPageShell>
  );
}
