// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MySkills } from "./MySkills";
import type { ManagedSkill } from "../lib/tauri";

const sampleSkills: ManagedSkill[] = [
  {
    id: "skill-update-1",
    name: "updatable-skill",
    description: "Has update",
    source_type: "git",
    source_ref: "https://github.com/user/updatable",
    source_ref_resolved: "https://github.com/user/updatable",
    source_subpath: null,
    source_branch: "main",
    source_revision: "rev1",
    remote_revision: "rev2",
    update_status: "update_available",
    last_checked_at: 1700000000000,
    last_check_error: null,
    central_path: "/path/to/updatable",
    enabled: true,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    status: "ok",
    targets: [],
    preset_ids: [],
    tags: [],
  },
  {
    id: "skill-normal-2",
    name: "normal-skill",
    description: "No update",
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
    central_path: "/path/to/normal",
    enabled: true,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    status: "ok",
    targets: [],
    preset_ids: [],
    tags: [],
  },
];

const appMocks = vi.hoisted(() => ({
  t: (key: string, opts?: Record<string, unknown>) => {
    if (opts && "count" in opts) return `${key}:${opts.count}`;
    return key;
  },
  refreshPresets: vi.fn(),
  refreshManagedSkills: vi.fn(),
  refreshTools: vi.fn(),
  refreshProjects: vi.fn(),
  openSkillDetailById: vi.fn(),
  closeSkillDetail: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: appMocks.t }) }));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    ...appMocks,
    viewedPreset: null,
    tools: [],
    managedSkills: sampleSkills,
    detailSkillId: null,
    projects: [],
  }),
}));
vi.mock("../lib/tauri", () => ({
  getPresetSkillOrder: vi.fn().mockResolvedValue([]),
  gitBackupPendingConflicts: vi.fn().mockResolvedValue([]),
  getAllTags: vi.fn().mockResolvedValue([]),
  getSettings: vi.fn().mockResolvedValue(null),
  gitBackupStatus: vi.fn().mockResolvedValue(null),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MySkills update highlight & filter", () => {
  it("filters and highlights updatable skills when URL has filter=updates", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/my-skills?filter=updates"]}>
        <MySkills />
      </MemoryRouter>
    );

    // 顶部横幅展示
    expect(screen.getByText("mySkills.showingUpdatesNotice:1")).toBeTruthy();

    // 只有有更新的 skill 出现，没有更新的被过滤掉
    expect(screen.getByText("updatable-skill")).toBeTruthy();
    expect(screen.queryByText("normal-skill")).toBeNull();

    // 点击查看全部 Skill 关闭横幅并恢复所有技能
    await user.click(screen.getByText("mySkills.showAllSkills"));
    expect(screen.getByText("updatable-skill")).toBeTruthy();
    expect(screen.getByText("normal-skill")).toBeTruthy();
  });
});
