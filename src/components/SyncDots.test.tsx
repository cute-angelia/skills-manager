// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncDots } from "./SyncDots";
import type { ManagedSkill, ToolInfo } from "../lib/tauri";
import { clearAgentEnableCounts, recordAgentEnable } from "../lib/agentUsage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockSkill: ManagedSkill = {
  id: "test-skill",
  name: "Test Skill",
  description: "Test description",
  source_type: "local",
  source_ref: null,
  source_ref_resolved: null,
  source_subpath: null,
  source_branch: null,
  source_revision: null,
  remote_revision: null,
  update_status: "local_only",
  last_checked_at: null,
  last_check_error: null,
  central_path: "/path/test",
  enabled: true,
  created_at: 0,
  updated_at: 0,
  status: "ok",
  targets: [
    {
      id: "tgt-1",
      skill_id: "test-skill",
      tool: "codex",
      target_path: "/path/codex",
      mode: "symlink",
      status: "synced",
      synced_at: 0,
    },
  ],
  preset_ids: [],
  tags: [],
};

const mockTools: ToolInfo[] = [
  {
    key: "codex",
    display_name: "Codex",
    installed: true,
    skills_dir: "/path/codex",
    enabled: true,
    is_custom: false,
    has_path_override: false,
    project_relative_skills_dir: null,
    has_project_path_override: false,
    category: "coding",
  },
  {
    key: "claude_code",
    display_name: "Claude Code",
    installed: true,
    skills_dir: "/path/claude",
    enabled: true,
    is_custom: false,
    has_path_override: false,
    project_relative_skills_dir: null,
    has_project_path_override: false,
    category: "coding",
  },
  {
    key: "antigravity",
    display_name: "Antigravity",
    installed: true,
    skills_dir: "/path/antigravity",
    enabled: true,
    is_custom: false,
    has_path_override: false,
    project_relative_skills_dir: null,
    has_project_path_override: false,
    category: "coding",
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  clearAgentEnableCounts();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SyncDots ordering by enable counts", () => {
  it("renders tools in default order when no enable counts recorded", async () => {
    await act(async () => {
      root.render(<SyncDots skill={mockSkill} tools={mockTools} onToggle={vi.fn()} />);
    });

    const buttons = container.querySelectorAll("button");
    const titles = Array.from(buttons).map((btn) => btn.getAttribute("title") || "");
    expect(titles.map((t) => t.split(" · ")[0])).toEqual(["Codex", "Claude Code", "Antigravity"]);
  });

  it("renders tools sorted by enable counts descending", async () => {
    // Record counts: Antigravity = 3, Claude Code = 1, Codex = 0
    recordAgentEnable("antigravity");
    recordAgentEnable("antigravity");
    recordAgentEnable("antigravity");
    recordAgentEnable("claude_code");

    await act(async () => {
      root.render(<SyncDots skill={mockSkill} tools={mockTools} onToggle={vi.fn()} />);
    });

    const buttons = container.querySelectorAll("button");
    const titles = Array.from(buttons).map((btn) => btn.getAttribute("title") || "");
    expect(titles.map((t) => t.split(" · ")[0])).toEqual(["Antigravity", "Claude Code", "Codex"]);
  });

  it("updates sort order reactively when a new enable count is recorded", async () => {
    await act(async () => {
      root.render(<SyncDots skill={mockSkill} tools={mockTools} onToggle={vi.fn()} />);
    });

    let buttons = container.querySelectorAll("button");
    let titles = Array.from(buttons).map((b) => (b.getAttribute("title") || "").split(" · ")[0]);
    expect(titles).toEqual(["Codex", "Claude Code", "Antigravity"]);

    // Now record antigravity 5 times
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        recordAgentEnable("antigravity");
      }
    });

    buttons = container.querySelectorAll("button");
    titles = Array.from(buttons).map((b) => (b.getAttribute("title") || "").split(" · ")[0]);
    // Antigravity (5) should now move to the front
    expect(titles).toEqual(["Antigravity", "Codex", "Claude Code"]);
  });

  it("calls onToggle with true when clicking an available agent", async () => {
    const handleToggle = vi.fn();
    await act(async () => {
      root.render(<SyncDots skill={mockSkill} tools={mockTools} onToggle={handleToggle} />);
    });

    // In mockSkill, 'codex' is synced, 'claude_code' is available
    const buttons = container.querySelectorAll("button");
    const claudeButton = buttons[1]; // CC

    await act(async () => {
      claudeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(handleToggle).toHaveBeenCalledWith("claude_code", true);
  });
});
