"use client";

import { useEffect } from "react";
import { EnrichmentResponse, FirmProfile, PersonProfile } from "./enrichment-types";

// Full profile report modal — detailed firm + person data.
// Ported from showProfileReport() in apps/web/js/onboarding/onboarding-tasks.js
// (9948dcf). Closes on X, backdrop click, and Escape.
export function ProfileReportModal({
  result,
  onClose,
}: {
  result: EnrichmentResponse;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const firm = result.firmProfile;
  const person = result.personProfile;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(17,24,39,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-border-subtle flex-shrink-0">
          <div>
            <h3 className="text-[18px] font-bold text-text-main">Research Report</h3>
            <p className="text-[12px] text-text-muted mt-1">
              AI-generated from website, LinkedIn, and web search
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-main transition-colors p-1"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {firm && <FirmSection firm={firm} />}
          {person && <PersonSection person={person} />}
          {result.steps && result.steps.length > 0 && <ResearchActivity steps={result.steps} />}
          {firm?.sources && firm.sources.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-border-subtle flex items-center gap-1 text-[11px] text-text-muted">
              <span className="material-symbols-outlined text-[14px]">info</span>
              Sources: {firm.sources.join(", ")}
            </div>
          )}
          {firm?.confidence && <ConfidenceBadge confidence={firm.confidence} />}
        </div>
      </div>
    </div>
  );
}

function FirmSection({ firm }: { firm: FirmProfile }) {
  const fields: Array<[string, string | number | undefined]> = [
    ["Description", firm.description],
    ["Strategy", firm.strategy],
    ["Sectors", firm.sectors?.join(", ")],
    ["Check Size", firm.checkSizeRange],
    ["AUM", firm.aum],
    ["Team Size", firm.teamSize],
    ["HQ", firm.headquarters],
    ["Founded", firm.foundedYear],
    ["Investment Criteria", firm.investmentCriteria],
    ["Key Differentiators", firm.keyDifferentiators],
  ];

  return (
    <div className="mb-5">
      <SectionHeader icon="business" title="Firm Profile" />
      {fields.map(([label, value]) =>
        value ? (
          <FieldRow key={label} label={label} value={String(value)} />
        ) : null,
      )}

      {firm.portfolioCompanies && firm.portfolioCompanies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2">
            Portfolio Companies
          </div>
          {firm.portfolioCompanies.map((co, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5 text-[13px]">
              <span className="text-primary font-semibold">{co.name}</span>
              {co.sector && <span className="text-text-muted">· {co.sector}</span>}
              {co.status === "exited" && (
                <span className="text-[11px] text-secondary bg-secondary-light px-1.5 py-0.5 rounded">
                  Exited
                </span>
              )}
              {co.verified && (
                <span
                  className="material-symbols-outlined text-secondary text-[14px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {firm.recentDeals && firm.recentDeals.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2">
            Recent Deals
          </div>
          {firm.recentDeals.map((deal, i) => (
            <div key={i} className="text-[13px] mb-1 text-text-main">
              {deal.title}
              {deal.date && <span className="text-text-muted"> ({deal.date})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonSection({ person }: { person: PersonProfile }) {
  const fields: Array<[string, string | number | undefined]> = [
    ["Title", person.title],
    ["Role", person.role],
    ["Bio", person.bio],
    ["Education", person.education],
    ["Years in PE", person.yearsInPE],
    ["Expertise", person.expertise?.join(", ")],
    ["Experience", person.experience?.join(" → ")],
  ];

  return (
    <div className="pt-4 border-t-2 border-border-subtle">
      <SectionHeader icon="person" title="Your Profile" />
      {fields.map(([label, value]) =>
        value ? (
          <FieldRow key={label} label={label} value={String(value)} />
        ) : null,
      )}
      {person.notableDeals && person.notableDeals.length > 0 && (
        <div className="mt-2 text-[13px]">
          <span className="text-text-muted">Notable Deals</span>
          <span className="text-text-main ml-2">{person.notableDeals.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function ResearchActivity({ steps }: { steps: Array<{ node: string; message: string; detail?: string }> }) {
  const iconFor = (node: string) => {
    switch (node) {
      case "scrape":
        return "language";
      case "searchFirm":
      case "searchPerson":
        return "search";
      case "synthesize":
        return "auto_awesome";
      case "verify":
        return "verified";
      default:
        return "save";
    }
  };
  return (
    <div className="mt-4 pt-3 border-t-2 border-border-subtle">
      <SectionHeader icon="search" title="Research Activity" />
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-2 mb-1.5 text-[12px] text-text-secondary">
          <span className="material-symbols-outlined text-text-muted text-[14px] mt-0.5">{iconFor(s.node)}</span>
          <div>
            <span className="text-text-main">{s.message}</span>
            {s.detail && <span className="text-text-muted ml-1">— {s.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
      </div>
      <h4 className="text-[15px] font-bold text-text-main">{title}</h4>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 mb-2 text-[13px] leading-snug">
      <span className="text-text-muted min-w-[110px] flex-shrink-0">{label}</span>
      <span className="text-text-main">{value}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles: Record<typeof confidence, { color: string; bg: string }> = {
    high: { color: "#059669", bg: "#D1FAE5" },
    medium: { color: "#D97706", bg: "#FEF3C7" },
    low: { color: "#DC2626", bg: "#FEE2E2" },
  };
  const s = styles[confidence];
  return (
    <div className="mt-2">
      <span
        className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded"
        style={{ color: s.color, backgroundColor: s.bg }}
      >
        {confidence} confidence
      </span>
    </div>
  );
}
