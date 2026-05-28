import { describe, it, expect } from "vitest";
import {
  SKILLS,
  findSkillCommand,
  expandChatInput,
  filterSkills,
  type Deal,
  type Skill,
} from "./index";

// ---------------------------------------------------------------------------
// Test fixtures
//
// `Deal` is `DealDetail` from the deal page. The skill prompt builders only
// read a small surface (`companyName`, `name`, `industry`), so a minimal mock
// that satisfies the required fields is enough. We cast through `unknown`
// instead of using `as any` to keep strict-mode happy without disabling type
// checks.
// ---------------------------------------------------------------------------

const baseDeal: Deal = {
  id: "deal-1",
  name: "Project Alpha",
  companyName: "TestCo",
  stage: "INITIAL_REVIEW",
  industry: "SaaS",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function findSkillByCommand(command: string): Skill {
  const s = SKILLS.find((sk) => sk.command === command);
  if (!s) throw new Error(`Test fixture references missing skill: ${command}`);
  return s;
}

// ---------------------------------------------------------------------------
// findSkillCommand
// ---------------------------------------------------------------------------

describe("findSkillCommand — happy path", () => {
  it("returns the matched skill with empty extra on exact command match (/ic-memo)", () => {
    const result = findSkillCommand("/ic-memo");
    expect(result).not.toBeNull();
    expect(result?.skill.command).toBe("/ic-memo");
    expect(result?.extra).toBe("");
  });

  it("returns matched skill + trailing text when separated by a single space", () => {
    const result = findSkillCommand("/ic-memo focus on retention risk");
    expect(result).not.toBeNull();
    expect(result?.skill.command).toBe("/ic-memo");
    expect(result?.extra).toBe("focus on retention risk");
  });

  it("returns matched skill + trailing text when separated by a newline", () => {
    const result = findSkillCommand("/ic-memo\nfocus on retention risk");
    expect(result).not.toBeNull();
    expect(result?.skill.command).toBe("/ic-memo");
    expect(result?.extra).toBe("focus on retention risk");
  });

  it("returns matched skill + trailing text when separated by a tab", () => {
    const result = findSkillCommand("/ic-memo\tfocus on retention risk");
    expect(result).not.toBeNull();
    expect(result?.skill.command).toBe("/ic-memo");
    expect(result?.extra).toBe("focus on retention risk");
  });

  it("trims whitespace around the extra context", () => {
    const result = findSkillCommand("/ic-memo    focus on retention risk   ");
    expect(result?.extra).toBe("focus on retention risk");
  });

  it("matches /chart-revenue and does NOT collide with /chart-margin", () => {
    const result = findSkillCommand("/chart-revenue please");
    expect(result?.skill.command).toBe("/chart-revenue");
  });

  it("matches /chart-margin and does NOT collide with /chart-revenue", () => {
    const result = findSkillCommand("/chart-margin please");
    expect(result?.skill.command).toBe("/chart-margin");
  });

  it("matches /chart-comp-mults distinctly from the other chart commands", () => {
    const result = findSkillCommand("/chart-comp-mults");
    expect(result?.skill.command).toBe("/chart-comp-mults");
  });

  it("matches every registered command with empty extra on bare invocation", () => {
    for (const skill of SKILLS) {
      const result = findSkillCommand(skill.command);
      expect(result).not.toBeNull();
      expect(result?.skill.command).toBe(skill.command);
      expect(result?.extra).toBe("");
    }
  });

  it("matches with leading whitespace (function uses trimStart)", () => {
    const result = findSkillCommand("  /ic-memo");
    expect(result).not.toBeNull();
    expect(result?.skill.command).toBe("/ic-memo");
    expect(result?.extra).toBe("");
  });

  it("matches with leading whitespace + extra text", () => {
    const result = findSkillCommand("   /qoe-flags watch AR trends");
    expect(result?.skill.command).toBe("/qoe-flags");
    expect(result?.extra).toBe("watch AR trends");
  });

  it("preserves internal whitespace inside extra context", () => {
    const result = findSkillCommand("/ic-memo line one\nline two");
    expect(result?.extra).toBe("line one\nline two");
  });
});

describe("findSkillCommand — negative cases", () => {
  it("returns null for input without a leading slash", () => {
    expect(findSkillCommand("ic-memo")).toBeNull();
  });

  it("returns null for an unknown command", () => {
    expect(findSkillCommand("/totally-made-up")).toBeNull();
  });

  it("returns null for /ic-memo-v2 (prefix-overlap of /ic-memo — anchored match must reject)", () => {
    // CRITICAL: anchored-match logic exists specifically to prevent this
    // kind of collision. If a future /ic-memo-v2 is added, the parser must
    // not mis-route it to /ic-memo.
    const result = findSkillCommand("/ic-memo-v2");
    expect(result).toBeNull();
  });

  it("returns null for /ic-memo-v2 with trailing text (still a prefix collision)", () => {
    expect(findSkillCommand("/ic-memo-v2 some extra")).toBeNull();
  });

  it("returns null for /chart-revenue-extra (prefix overlap of /chart-revenue)", () => {
    expect(findSkillCommand("/chart-revenue-extra")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(findSkillCommand("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(findSkillCommand("   ")).toBeNull();
  });

  it("returns null when a command appears mid-string rather than at the start", () => {
    expect(findSkillCommand("hello /ic-memo world")).toBeNull();
  });

  it("returns null for a bare slash", () => {
    expect(findSkillCommand("/")).toBeNull();
  });

  it("returns null when the command is followed immediately by a non-whitespace character", () => {
    // /ic-memo: would prefix-match /ic-memo with separator ':', which the
    // parser rejects (only space / tab / newline allowed).
    expect(findSkillCommand("/ic-memo:foo")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// expandChatInput
// ---------------------------------------------------------------------------

describe("expandChatInput", () => {
  it("returns input unchanged when there is no matching command", () => {
    const input = "just a regular chat message";
    expect(expandChatInput(input, baseDeal)).toBe(input);
  });

  it("returns input unchanged when deal is null (early-return guard) even if command matches", () => {
    // Documented guard: null deal short-circuits before parsing. The raw
    // text reaches the agent verbatim — including any leading slash.
    expect(expandChatInput("/ic-memo", null)).toBe("/ic-memo");
  });

  it("returns input unchanged when deal is null and input is plain text", () => {
    expect(expandChatInput("hello world", null)).toBe("hello world");
  });

  it("returns the skill's full prompt when command matches with no extra context", () => {
    const skill = findSkillByCommand("/ic-memo");
    const expected = skill.buildPrompt(baseDeal);
    const result = expandChatInput("/ic-memo", baseDeal);
    expect(result).toBe(expected);
  });

  it("appends an 'Additional context from the analyst' block when extra is present", () => {
    const skill = findSkillByCommand("/ic-memo");
    const base = skill.buildPrompt(baseDeal);
    const result = expandChatInput(
      "/ic-memo focus on FY25 churn forecast",
      baseDeal,
    );
    expect(result).toBe(
      `${base}\n\n---\n**Additional context from the analyst:**\nfocus on FY25 churn forecast`,
    );
  });

  it("uses the analyst-context separator exactly once even with newlines in extra", () => {
    const result = expandChatInput("/qoe-flags\nline one\nline two", baseDeal);
    expect(result).toContain(
      "---\n**Additional context from the analyst:**\nline one\nline two",
    );
    expect(result.match(/---\n\*\*Additional context from the analyst:\*\*/g))
      .toHaveLength(1);
  });

  it("substitutes the deal company name into prompts that reference nameOf(deal)", () => {
    const result = expandChatInput("/ic-memo", baseDeal);
    expect(result).toContain("TestCo");
  });

  it("falls back to deal.name when companyName is absent", () => {
    const noCompany: Deal = { ...baseDeal, companyName: undefined };
    const result = expandChatInput("/ic-memo", noCompany);
    expect(result).toContain("Project Alpha");
  });

  it("falls back to 'this company' when both companyName and name are absent", () => {
    const anonymous: Deal = {
      ...baseDeal,
      companyName: undefined,
      // name is required on Deal, but the helper guards against empty too.
      name: "",
    };
    const result = expandChatInput("/ic-memo", anonymous);
    expect(result).toContain("this company");
  });

  it("includes the industry clause for prompts that reference industryOf(deal)", () => {
    const result = expandChatInput("/ic-memo", baseDeal);
    expect(result).toContain("SaaS");
  });

  it("returns input verbatim for an unknown command (no expansion attempted)", () => {
    const input = "/totally-made-up extra stuff";
    expect(expandChatInput(input, baseDeal)).toBe(input);
  });
});

describe("filterSkills", () => {
  it("returns all skills for an empty query", () => {
    expect(filterSkills("").length).toBe(SKILLS.length);
    expect(filterSkills("   ").length).toBe(SKILLS.length);
  });

  it("matches against command (with leading slash)", () => {
    const hits = filterSkills("/ic-memo");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((s) => s.id === "ic-memo")).toBe(true);
  });

  it("matches against command (without leading slash) — the menu-input convention", () => {
    const hits = filterSkills("qoe");
    expect(hits.some((s) => s.id === "qoe-flags")).toBe(true);
  });

  it("matches against the label so analysts searching by name find it", () => {
    const hits = filterSkills("Investment Committee");
    expect(hits.some((s) => s.id === "ic-memo")).toBe(true);
  });

  it("matches against the description so intent-based searches work — 'red flags' finds qoeFlags", () => {
    // qoeFlags description: "Quality of Earnings red flags grouped by category with severity."
    // The phrase "red flags" appears in NO command or label, only the description.
    const hits = filterSkills("red flags");
    expect(hits.some((s) => s.id === "qoe-flags")).toBe(true);
  });

  it("matches against the description for other intent phrases ('memo', 'chart', 'comp')", () => {
    expect(filterSkills("memo").some((s) => s.category === "memo")).toBe(true);
    expect(filterSkills("chart").some((s) => s.category === "visual")).toBe(true);
    expect(filterSkills("comparable").some((s) => s.id === "comp-bench")).toBe(true);
  });

  it("returns empty array for a query that matches nothing", () => {
    expect(filterSkills("xyznosuchthing").length).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(filterSkills("IC-MEMO").some((s) => s.id === "ic-memo")).toBe(true);
    expect(filterSkills("RED FLAGS").some((s) => s.id === "qoe-flags")).toBe(true);
  });
});
