// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_ENABLE_COUNTS_KEY,
  clearAgentEnableCounts,
  getAgentEnableCounts,
  recordAgentEnable,
  sortToolsByUsage,
} from "./agentUsage";

describe("agentUsage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAgentEnableCounts();
  });

  it("returns empty object initially", () => {
    expect(getAgentEnableCounts()).toEqual({});
  });

  it("records enable counts and increments correctly", () => {
    recordAgentEnable("codex");
    expect(getAgentEnableCounts()).toEqual({ codex: 1 });

    recordAgentEnable("codex");
    recordAgentEnable("antigravity");
    expect(getAgentEnableCounts()).toEqual({ codex: 2, antigravity: 1 });

    // Verify localStorage persistence
    const saved = JSON.parse(window.localStorage.getItem(AGENT_ENABLE_COUNTS_KEY) || "{}");
    expect(saved).toEqual({ codex: 2, antigravity: 1 });
  });

  it("handles corrupted or invalid data gracefully", () => {
    window.localStorage.setItem(AGENT_ENABLE_COUNTS_KEY, "invalid-json");
    expect(getAgentEnableCounts()).toEqual({});

    window.localStorage.setItem(AGENT_ENABLE_COUNTS_KEY, JSON.stringify({ codex: -5, claude: "foo", gemini: 3 }));
    expect(getAgentEnableCounts()).toEqual({ gemini: 3 });
  });

  it("sorts tools by usage descending while preserving original order for equal counts", () => {
    const tools = [
      { key: "claude_code", name: "Claude" },
      { key: "codex", name: "Codex" },
      { key: "antigravity", name: "Antigravity" },
      { key: "cursor", name: "Cursor" },
    ];

    // No clicks yet -> should keep original order
    expect(sortToolsByUsage(tools, {})).toEqual(tools);

    // codex clicked 2 times, cursor clicked 5 times
    const counts = { codex: 2, cursor: 5 };
    const sorted = sortToolsByUsage(tools, counts);

    expect(sorted.map((t) => t.key)).toEqual([
      "cursor",      // 5 clicks
      "codex",       // 2 clicks
      "claude_code", // 0 clicks (original index 0)
      "antigravity", // 0 clicks (original index 2)
    ]);
  });
});
