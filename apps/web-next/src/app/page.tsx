import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { LandingNavbar } from "@/components/layout/LandingNavbar";

export default function LandingPage() {
  return (
    <div
      className="bg-white text-[#1e293b] font-sans overflow-x-hidden overflow-y-auto antialiased"
      style={{ height: "100vh" }}
    >
      <LandingNavbar />

      {/* Hero */}
      <section className="relative w-full overflow-hidden bg-[#f8fafc]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23003366' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative px-4 md:px-10 lg:px-40 py-16 lg:py-24">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
              <div className="flex-1 flex flex-col gap-6 text-center lg:text-left z-10">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-[#111418]">
                  Stop drowning in <span className="text-primary">deal flow</span>.
                </h1>
                <p className="text-lg text-slate-600 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  PE OS helps small M&amp;A teams manage 20–50 deals per week and
                  analyze them in minutes, not days. Built by operators who close
                  deals, not consultants who advise on them.
                </p>
                <div className="flex flex-wrap gap-4 justify-center lg:justify-start pt-4">
                  <Link
                    href="/signup"
                    className="h-12 px-8 rounded-lg text-white text-base font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#003366" }}
                  >
                    Start Free
                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                  </Link>
                  <Link
                    href="#demo"
                    className="h-12 px-8 rounded-lg bg-white border border-slate-200 text-[#111418] text-base font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">play_circle</span>
                    Watch Demo
                  </Link>
                </div>
                <div className="flex items-center justify-center lg:justify-start gap-2 text-sm text-slate-500 pt-2">
                  <span className="material-symbols-outlined text-[18px] text-green-500">check_circle</span>
                  <span>No credit card required. Set up in under 3 minutes.</span>
                </div>
              </div>

              {/* Hero Mockup */}
              <div className="flex-1 w-full max-w-[600px] lg:max-w-none" style={{ perspective: "1000px" }}>
                <div className="relative group transform transition-transform duration-700 hover:scale-[1.01] hover:rotate-1">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-400 rounded-xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
                  <div className="relative rounded-xl overflow-hidden shadow-2xl bg-white border border-slate-200">
                    <div className="absolute top-0 w-full h-8 bg-slate-100 border-b border-slate-200 flex items-center px-4 gap-2">
                      <div className="size-2.5 rounded-full bg-red-400" />
                      <div className="size-2.5 rounded-full bg-yellow-400" />
                      <div className="size-2.5 rounded-full bg-green-400" />
                    </div>
                    <div
                      className="pt-8 aspect-[4/3]"
                      style={{ background: "linear-gradient(135deg, #003366 0%, #004488 40%, #0055AA 70%, #1a6bb5 100%)" }}
                    >
                      <div className="w-full h-full bg-white/10 backdrop-contrast-125 p-6 flex flex-col gap-4">
                        <div className="flex gap-4">
                          <div className="w-1/3 h-32 rounded bg-white/90 shadow-sm backdrop-blur" />
                          <div className="w-1/3 h-32 rounded bg-white/90 shadow-sm backdrop-blur" />
                          <div className="w-1/3 h-32 rounded bg-white/90 shadow-sm backdrop-blur" />
                        </div>
                        <div className="flex-1 rounded bg-white/90 shadow-sm backdrop-blur" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Origin */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-xs font-semibold text-primary uppercase tracking-[0.15em] mb-3">Origin</p>
          <p className="text-lg md:text-xl text-slate-600 leading-relaxed">
            Built from the methodology behind <span className="font-semibold text-[#111418]">Kautilya</span> — a
            buy-side advisory constructing proprietary acquisition pipelines for
            middle-market buyers.
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-20 bg-[#f8fafc] border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111418] tracking-tight mb-4">
              Your deal flow is outpacing your team.
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              You&apos;re reviewing 20–50 opportunities every week — CIMs, teasers,
              spreadsheets — and losing deals because there aren&apos;t enough hours
              in the day.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { stat: "80:1", label: "Deal-to-close ratio" },
              { stat: "4+ hrs", label: "Per CIM review" },
              { stat: "$50K+", label: "Enterprise tool cost" },
            ].map((s) => (
              <div
                key={s.label}
                className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm text-center"
              >
                <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2 tabular-nums">
                  {s.stat}
                </div>
                <div className="text-sm font-medium text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What PE OS Does */}
      <section id="features" className="py-20 bg-white border-t border-slate-100">
        <div className="px-4 md:px-10 lg:px-40 max-w-7xl mx-auto">
          <div className="mb-16 text-center">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.15em] mb-3">What PE OS Does</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111418] tracking-tight">
              Manage and analyze at deal speed.
            </h2>
          </div>

          <div className="flex flex-col gap-20">
            {/* Feature 1: CIM Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5">
                  <span className="material-symbols-outlined text-2xl">description</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-[#111418] mb-4">
                  Upload a CIM. Get structured analysis in 2 minutes.
                </h3>
                <p className="text-slate-600 mb-6 leading-relaxed">
                  Drop in a CIM and PE OS extracts the financials, flags the
                  risks, and drafts the IC memo — automatically.
                </p>
                <ul className="flex flex-col gap-3 text-slate-700">
                  {[
                    "Revenue, EBITDA, margins extracted instantly",
                    "Customer concentration and working capital flags",
                    "Addback and normalization identification",
                    "Auto-generated investment thesis + red flags",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">check</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl overflow-hidden shadow-xl bg-white border border-slate-200">
                <div className="h-7 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-1.5">
                  <div className="size-2 rounded-full bg-red-400" />
                  <div className="size-2 rounded-full bg-yellow-400" />
                  <div className="size-2 rounded-full bg-green-400" />
                </div>
                <div className="p-6 bg-[#f8fafc] aspect-[4/3] flex flex-col gap-3">
                  <div className="h-6 w-2/3 rounded bg-white shadow-sm" />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="h-20 rounded bg-white shadow-sm" />
                    <div className="h-20 rounded bg-white shadow-sm" />
                    <div className="h-20 rounded bg-white shadow-sm" />
                  </div>
                  <div className="flex-1 rounded bg-white shadow-sm" />
                </div>
              </div>
            </div>

            {/* Feature 2: Pipeline Management */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 rounded-xl overflow-hidden shadow-xl bg-white border border-slate-200">
                <div className="h-7 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-1.5">
                  <div className="size-2 rounded-full bg-red-400" />
                  <div className="size-2 rounded-full bg-yellow-400" />
                  <div className="size-2 rounded-full bg-green-400" />
                </div>
                <div className="p-6 bg-[#f8fafc] aspect-[4/3] grid grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((col) => (
                    <div key={col} className="flex flex-col gap-2">
                      <div className="h-4 rounded bg-slate-200" />
                      <div className="h-16 rounded bg-white shadow-sm" />
                      <div className="h-16 rounded bg-white shadow-sm" />
                      <div className="h-16 rounded bg-white shadow-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5">
                  <span className="material-symbols-outlined text-2xl">view_kanban</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-[#111418] mb-4">
                  Your entire pipeline, one view.
                </h3>
                <p className="text-slate-600 mb-6 leading-relaxed">
                  Stop juggling spreadsheets and email threads. Every deal, every
                  stage, every team member — in a single place.
                </p>
                <ul className="flex flex-col gap-3 text-slate-700">
                  {[
                    "Kanban and table views for deal stages",
                    "Filter by sector, size, geography, custom tags",
                    "Activity timeline per deal",
                    "Team assignments and handoffs",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">check</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Feature 3: Deal Search */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5">
                  <span className="material-symbols-outlined text-2xl">forum</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-[#111418] mb-4">
                  Ask questions. Get answers from your deals.
                </h3>
                <p className="text-slate-600 mb-6 leading-relaxed">
                  Natural-language search across every deal you&apos;ve uploaded. No
                  more hunting through folders for last quarter&apos;s EBITDA bridge.
                </p>
                <ul className="flex flex-col gap-3 text-slate-700">
                  {[
                    "Query across all uploaded documents",
                    "Cross-deal pattern recognition",
                    "Instant recall of any deal detail",
                    "Exportable summaries and comparisons",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">check</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl overflow-hidden shadow-xl bg-white border border-slate-200">
                <div className="h-7 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-1.5">
                  <div className="size-2 rounded-full bg-red-400" />
                  <div className="size-2 rounded-full bg-yellow-400" />
                  <div className="size-2 rounded-full bg-green-400" />
                </div>
                <div className="p-6 bg-[#f8fafc] aspect-[4/3] flex flex-col gap-3 justify-end">
                  <div className="self-start max-w-[80%] p-3 rounded-lg bg-white shadow-sm text-sm text-slate-600">
                    Show me SaaS deals with &gt;$10M EBITDA from 2023.
                  </div>
                  <div
                    className="self-end max-w-[80%] p-3 rounded-lg text-white text-sm shadow-sm"
                    style={{ backgroundColor: "#003366" }}
                  >
                    Found 7 deals. Top three by EBITDA: Acme SaaS ($14.2M), Vertex ($12.8M)…
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="py-20 bg-[#f8fafc] border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-semibold text-primary uppercase tracking-[0.15em] mb-3">See It In Action</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#111418] tracking-tight mb-4">
            From CIM to analysis in 2 minutes.
          </h2>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
            Watch a real CIM get uploaded, analyzed, and turned into a structured
            deal brief.
          </p>
          <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black border border-slate-200 aspect-video">
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/9mQC_HHFt28?start=2"
              title="PE OS demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* Onboarding */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111418] tracking-tight">
              Up and running in 3 minutes.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Create your workspace",
                desc: "Sign up with your work email, invite your team. No implementation, no IT ticket.",
              },
              {
                step: "2",
                title: "Upload your first deal",
                desc: "Drop in a CIM, teaser, or financial pack. PE OS analyzes it automatically.",
              },
              {
                step: "3",
                title: "Manage and analyze at speed",
                desc: "Track your pipeline, ask questions, share analysis with your team.",
              },
            ].map((s) => (
              <div key={s.step} className="p-8 rounded-2xl bg-[#f8fafc] border border-slate-200">
                <div
                  className="size-10 rounded-full text-white flex items-center justify-center font-bold text-base mb-5"
                  style={{ backgroundColor: "#003366" }}
                >
                  {s.step}
                </div>
                <h3 className="text-xl font-bold text-[#111418] mb-3">{s.title}</h3>
                <p className="text-slate-600 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-[#f8fafc] border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111418] tracking-tight mb-4">
              Simple pricing. No surprises.
            </h2>
            <p className="text-lg text-slate-600">
              Start free. Upgrade when you need more capacity.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: "Starter",
                price: "$99",
                seat: "per seat / month",
                features: [
                  "Up to 3 team members",
                  "25 deal analyses / month",
                  "Pipeline management",
                  "Chat with deals",
                  "Email support",
                ],
                cta: "Start Free Trial",
                href: "/signup?plan=starter",
                featured: false,
              },
              {
                name: "Pro",
                price: "$149",
                seat: "per seat / month",
                features: [
                  "Up to 10 team members",
                  "Unlimited deal analyses",
                  "Advanced pipeline + custom fields",
                  "Cross-deal pattern search",
                  "Priority support + onboarding",
                  "API access",
                ],
                cta: "Start Free Trial",
                href: "/signup?plan=pro",
                featured: true,
              },
              {
                name: "Team",
                price: "$199",
                seat: "per seat / month",
                features: [
                  "Unlimited team members",
                  "Everything in Pro",
                  "SSO + admin controls",
                  "Custom integrations",
                  "Dedicated account manager",
                  "SLA guarantee",
                ],
                cta: "Contact Sales",
                href: "/signup?plan=team",
                featured: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative p-8 rounded-2xl bg-white border shadow-sm flex flex-col ${
                  plan.featured ? "border-primary shadow-lg shadow-primary/10" : "border-slate-200"
                }`}
              >
                {plan.featured && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-white text-xs font-bold uppercase tracking-wide"
                    style={{ backgroundColor: "#003366" }}
                  >
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-[#111418] mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-[#111418] tabular-nums">{plan.price}</span>
                </div>
                <p className="text-sm text-slate-500 mb-6">{plan.seat}</p>
                <ul className="flex flex-col gap-3 text-sm text-slate-700 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">check</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-auto h-11 px-5 rounded-lg font-bold text-sm flex items-center justify-center transition-all ${
                    plan.featured
                      ? "text-white hover:opacity-90 shadow-lg shadow-primary/25"
                      : "bg-white border border-slate-200 text-[#111418] hover:bg-slate-50"
                  }`}
                  style={plan.featured ? { backgroundColor: "#003366" } : undefined}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="material-symbols-outlined text-5xl text-primary/30 mb-4">format_quote</span>
          <blockquote className="text-xl md:text-2xl text-[#111418] font-medium leading-relaxed mb-6">
            &ldquo;We build proprietary acquisition pipelines for buy-side firms —
            sector mapping, target identification, outreach, analysis. PE OS is
            that same process, productized. The methodology that powers our
            advisory work, now available as software for teams who want to run it
            themselves.&rdquo;
          </blockquote>
          <div className="text-sm text-slate-600">
            <span className="font-bold text-[#111418]">Dev Shah</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>Founder, Kautilya Advisory</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 border-t border-slate-100" style={{ backgroundColor: "#003366" }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Your deals won&apos;t wait. Neither should your tools.
          </h2>
          <p className="text-lg text-white/80 mb-10 max-w-2xl mx-auto">
            Start managing your pipeline and analyzing deals in minutes. Free to
            try, no credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-flex h-14 px-8 rounded-lg bg-white text-[#003366] text-lg font-bold hover:bg-slate-50 transition-colors items-center gap-2"
          >
            Get Started Free
            <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#f8fafc] border-t border-slate-200 pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-10 lg:px-40">
          <div className="flex flex-col md:flex-row md:justify-between gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Logo className="size-6 text-primary" />
                <h2 className="text-lg font-bold text-[#111418]">PE OS</h2>
              </div>
              <p className="text-sm text-slate-500">lmmos.ai</p>
            </div>
            <div className="text-sm text-slate-500 md:text-right flex flex-col gap-1">
              <span>Built by <span className="font-medium text-[#111418]">@devlikesbizness</span></span>
              <a className="hover:text-primary transition-colors" href="mailto:dev@pocketfund.io">dev@pocketfund.io</a>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-400">&copy; 2026 PE OS. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link className="hover:text-primary transition-colors" href="/privacy-policy">Privacy</Link>
              <Link className="hover:text-primary transition-colors" href="/terms-of-service">Terms</Link>
              <Link className="hover:text-primary transition-colors" href="/security">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
