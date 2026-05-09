import Link from "next/link";

const TOOLS = [
  {
    href: "/criteria/nda-redline",
    title: "NDA Red-Line",
    description:
      "Paste your firm's NDA policy once. Drop in any counterparty NDA. Get a clause-by-clause red-line with severity and suggested replacements.",
    icon: "rule",
    cta: "Open NDA red-line",
  },
  {
    href: "/criteria/teaser-filter",
    title: "Teaser Go / No-Go",
    description:
      "Paste your investment criteria. Drop in an inbound teaser or CIM. Get a GO / NO-GO decision with per-criterion findings in seconds.",
    icon: "fact_check",
    cta: "Open teaser filter",
  },
];

export default function CriteriaIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Criteria Engine
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-text-primary">
          Apply your firm&apos;s rules to every inbound deal artifact
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-text-secondary">
          Upload your firm&apos;s criteria once. Every NDA, teaser, or CIM that lands in your inbox gets the same first-pass review your associate would do — in seconds, on screen.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group rounded-xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[28px] text-primary">
                {tool.icon}
              </span>
              <h2 className="text-xl font-semibold text-text-primary">{tool.title}</h2>
            </div>
            <p className="mt-3 text-sm text-text-secondary">{tool.description}</p>
            <div
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "#003366" }}
            >
              {tool.cta}
              <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
