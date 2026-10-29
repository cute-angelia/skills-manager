import { describe, expect, it } from "vitest";
import { normalizeSkillSearch, skillSearchMatches } from "./skillSearch";

describe("normalizeSkillSearch", () => {
  it("normalizes hyphenated and spaced queries equivalently", () => {
    expect(normalizeSkillSearch("wrap up")).toBe("wrap-up");
    expect(normalizeSkillSearch("wrap-up")).toBe("wrap-up");
    expect(normalizeSkillSearch("wrap_up")).toBe("wrap-up");
  });

  it("preserves trailing hyphen for prefix queries like x-", () => {
    expect(normalizeSkillSearch("x-")).toBe("x-");
    expect(normalizeSkillSearch("x－")).toBe("x-"); // fullwidth hyphen
    expect(normalizeSkillSearch("x—")).toBe("x-"); // em-dash
  });

  it("handles empty or purely separator inputs", () => {
    expect(normalizeSkillSearch("")).toBe("");
    expect(normalizeSkillSearch("   ")).toBe("");
    expect(normalizeSkillSearch("-")).toBe("");
    expect(normalizeSkillSearch("---")).toBe("");
  });

  it("matches x- correctly without matching unrelated tools like codex", () => {
    const query = normalizeSkillSearch("x-");
    expect(query).toBe("x-");

    expect(skillSearchMatches(query, ["x-daily-plan"])).toBe(true);
    expect(skillSearchMatches(query, ["x_daily_plan"])).toBe(true);
    expect(skillSearchMatches(query, ["baoyu-article-illustrator"])).toBe(false);
    expect(skillSearchMatches(query, ["baoyu-infographic"])).toBe(false);
    expect(skillSearchMatches(query, ["codex"])).toBe(false);
  });
});
