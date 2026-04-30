"use client";

import { useState } from "react";

type Plan = {
  name: string;
  description: string;
  monthly: string;
  annual: string;
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  ctaPrimary?: boolean;
  intro: string;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Boutique",
    description: "Perfect for solo analysts and small partnerships.",
    monthly: "$249",
    annual: "$199",
    cta: "Start Free Trial",
    ctaHref: "/signup",
    intro: "Includes:",
    features: [
      "Basic AI Deal Ingestion",
      "5 Active Deal Rooms",
      "Standard Screening",
      "Email Support",
    ],
  },
  {
    name: "Mid-Market",
    description: "For growing investment teams and deal flow.",
    monthly: "$599",
    annual: "$479",
    cta: "Get Started",
    ctaHref: "/signup",
    highlighted: true,
    ctaPrimary: true,
    intro: "Everything in Boutique, plus:",
    features: [
      "Advanced 'Chat with Deals' AI",
      "Team Deal Rooms & Collab",
      "Sentiment Analysis Engine",
      "Unlimited Historical Data",
    ],
  },
  {
    name: "Enterprise",
    description: "Full-scale operational leverage and security.",
    monthly: "Custom",
    annual: "Custom",
    cta: "Contact Sales",
    ctaHref: "mailto:hello@pocket-fund.com?subject=Enterprise%20Plan%20Inquiry",
    intro: "Everything in Mid-Market, plus:",
    features: [
      "Custom API Limits & Integration",
      "Unlimited Deal Rooms",
      "Dedicated Account Manager",
      "SSO & Enterprise Audit Logs",
    ],
  },
];

export function PricingTable() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <>
      {/* Billing Toggle */}
      <div className="flex justify-center mb-12">
        <div className="flex p-1 bg-[#e2e8f0] rounded-xl relative">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={
              billing === "monthly"
                ? "rounded-lg px-6 py-2 text-sm font-semibold bg-white text-[#111418] shadow-sm transition-all z-10"
                : "rounded-lg px-6 py-2 text-sm font-semibold text-[#64748b] transition-all z-10"
            }
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={
              billing === "annual"
                ? "rounded-lg px-6 py-2 text-sm font-semibold bg-white text-[#111418] shadow-sm transition-all z-10 flex items-center"
                : "rounded-lg px-6 py-2 text-sm font-semibold text-[#64748b] transition-all z-10 flex items-center"
            }
          >
            Annual
            <span className="ml-2 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {PLANS.map((plan) => {
          const price = billing === "annual" ? plan.annual : plan.monthly;
          const showSuffix = price !== "Custom";
          const cardClass = plan.highlighted
            ? "flex flex-col relative rounded-2xl border-2 border-primary bg-white p-8 shadow-xl hover:-translate-y-1 transition-all duration-300 z-10"
            : "flex flex-col rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300";
          const ctaClass = plan.ctaPrimary
            ? "w-full rounded-lg text-white h-12 px-4 text-sm font-bold hover:opacity-90 transition-colors shadow-md mb-8 flex items-center justify-center"
            : "w-full rounded-lg bg-[#f1f5f9] text-[#111418] h-12 px-4 text-sm font-bold hover:bg-[#e2e8f0] transition-colors mb-8 flex items-center justify-center";

          return (
            <div key={plan.name} className={cardClass}>
              {plan.highlighted && (
                <div
                  className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm text-white"
                  style={{ backgroundColor: "#003366" }}
                >
                  MOST POPULAR
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-[#111418] text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-[#64748b] text-sm h-10">{plan.description}</p>
              </div>
              <div className="mb-8 flex items-baseline gap-1">
                <span className="text-[#111418] text-4xl font-extrabold tracking-tight">
                  {price}
                </span>
                {showSuffix && (
                  <span className="text-[#64748b] text-sm font-medium">/user/mo</span>
                )}
              </div>
              <a
                href={plan.ctaHref}
                className={ctaClass}
                style={plan.ctaPrimary ? { backgroundColor: "#003366" } : undefined}
              >
                {plan.cta}
              </a>
              <div className="space-y-4 flex-1">
                <p className="text-xs font-bold text-[#64748b] uppercase tracking-wider">
                  {plan.intro}
                </p>
                <ul className="space-y-3">
                  {plan.features.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-start gap-3 text-sm text-[#334155]"
                    >
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        check_circle
                      </span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
