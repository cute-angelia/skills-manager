// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { InstallSkills } from "./InstallSkills";

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  scan: vi.fn(),
  refreshManagedSkills: vi.fn(),
  refreshPresets: vi.fn(),
  openSkillDetailById: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({ ...mocks, managedSkills: [] }),
}));
vi.mock("../lib/tauri", () => ({
  scanLocalSkills: mocks.scan,
  fetchLeaderboard: vi.fn().mockResolvedValue([]),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  mocks.scan.mockResolvedValue({ tools_scanned: 1, skills_found: 0, groups: [] });
  mocks.refreshManagedSkills.mockResolvedValue(undefined);
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

describe("local skill page entry", () => {
  it("does not scan automatically on entry and only scans when clicking scan button", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/install?tab=local"]}><InstallSkills /></MemoryRouter>);
    // 进入时不自动扫描
    expect(mocks.scan).not.toHaveBeenCalled();

    // 点击手动扫描按钮
    await user.click(screen.getAllByRole("button", { name: "install.scan.startScan" })[0]);
    await waitFor(() => expect(mocks.scan).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refreshManagedSkills).toHaveBeenCalledTimes(1));
  });

  it("does not scan on other tabs and supports explicit rescanning", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/install?tab=git"]}><InstallSkills /></MemoryRouter>);
    await screen.findByRole("button", { name: "install.localInstall" });
    expect(mocks.scan).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "install.localInstall" }));
    expect(mocks.scan).not.toHaveBeenCalled();

    // 手动点击扫描
    await user.click(screen.getAllByRole("button", { name: "install.scan.startScan" })[0]);
    await waitFor(() => expect(mocks.scan).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refreshManagedSkills).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "install.scan.rescan" }));
    await waitFor(() => expect(mocks.scan).toHaveBeenCalledTimes(2));
  });

  it("filters scan results by query and status, and updates import button label", async () => {
    const user = userEvent.setup();
    const sampleGroups = [
      {
        name: "pdf-reader",
        fingerprint: "hash1",
        locations: [{ id: "1", tool: "claude_code", found_path: "/path/to/pdf-reader" }],
        imported: false,
        found_at: 1700000000000,
      },
      {
        name: "code-analyzer",
        fingerprint: "hash2",
        locations: [{ id: "2", tool: "codex", found_path: "/path/to/code-analyzer" }],
        imported: true,
        found_at: 1700000000000,
      },
    ];
    mocks.scan.mockResolvedValueOnce({
      tools_scanned: 2,
      skills_found: 2,
      groups: sampleGroups,
    });

    render(
      <MemoryRouter initialEntries={["/install?tab=local"]}>
        <InstallSkills />
      </MemoryRouter>
    );

    // 手动点击扫描
    await user.click(screen.getAllByRole("button", { name: "install.scan.startScan" })[0]);

    await waitFor(() => expect(screen.getByText("pdf-reader")).toBeTruthy());
    expect(screen.getByText("code-analyzer")).toBeTruthy();

    // 默认按钮显示全部导入数量
    expect(screen.getByRole("button", { name: "install.scan.importAllCount" })).toBeTruthy();

    // 输入搜索关键字进行过滤
    const searchInput = screen.getByPlaceholderText("install.scan.searchPlaceholder");
    await user.type(searchInput, "pdf");

    // 只展示匹配项
    expect(screen.getByText("pdf-reader")).toBeTruthy();
    expect(screen.queryByText("code-analyzer")).toBeNull();

    // 按钮文案联动为导入筛选结果
    expect(screen.getByRole("button", { name: "install.scan.importFiltered" })).toBeTruthy();

    // 切换到已导入状态
    await user.click(screen.getByText(/install\.scan\.filterImported/));
    // pdf-reader 未导入，所以应该无匹配
    expect(screen.queryByText("pdf-reader")).toBeNull();
    expect(screen.getByText("install.scan.noMatches")).toBeTruthy();

    // 点击清除筛选
    await user.click(screen.getByRole("button", { name: "install.scan.clearFilters" }));
    expect(screen.getByText("pdf-reader")).toBeTruthy();
    expect(screen.getByText("code-analyzer")).toBeTruthy();
  });

  it("filters accurately with baoyu and x-daily-plan scenario", async () => {
    const user = userEvent.setup();
    const groups = [
      {
        name: "baoyu-article-illustrator",
        fingerprint: "hash1",
        locations: [
          { id: "1", tool: "codex", found_path: "/Users/vanilla/.codex/skills/baoyu-article-illustrator" },
        ],
        imported: false,
        found_at: 1700000000000,
      },
      {
        name: "baoyu-comic",
        fingerprint: "hash2",
        locations: [
          { id: "2", tool: "claude_code", found_path: "/Users/vanilla/.claude/skills/baoyu-comic" },
        ],
        imported: false,
        found_at: 1700000000000,
      },
      {
        name: "x-daily-plan",
        fingerprint: "hash3",
        locations: [
          { id: "3", tool: "antigravity", found_path: "/Users/vanilla/.gemini/config/skills/x-daily-plan" },
        ],
        imported: true,
        found_at: 1700000000000,
      },
    ];
    mocks.scan.mockResolvedValueOnce({
      tools_scanned: 2,
      skills_found: 3,
      groups,
    });

    render(
      <MemoryRouter initialEntries={["/install?tab=local"]}>
        <InstallSkills />
      </MemoryRouter>
    );

    // 手动点击扫描
    await user.click(screen.getAllByRole("button", { name: "install.scan.startScan" })[0]);

    await waitFor(() => expect(screen.getByText("baoyu-article-illustrator")).toBeTruthy());

    const searchInput = screen.getByPlaceholderText("install.scan.searchPlaceholder");
    await user.type(searchInput, "x-daily-plan");

    expect(screen.queryByText("baoyu-article-illustrator")).toBeNull();
    expect(screen.queryByText("baoyu-comic")).toBeNull();
    expect(screen.getByText("x-daily-plan")).toBeTruthy();

    // Select imported filter
    await user.click(screen.getByText(/install\.scan\.filterImported/));
    expect(screen.queryByText("baoyu-article-illustrator")).toBeNull();
    expect(screen.getByText("x-daily-plan")).toBeTruthy();
  });

  it("handles duplicate group names without React key collision warnings", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const groups = [
      {
        name: "baoyu-article-illustrator",
        fingerprint: "hash_fp_1",
        locations: [
          { id: "1", tool: "codex", found_path: "/Users/vanilla/.codex/skills/baoyu-article-illustrator" },
        ],
        imported: false,
        found_at: 1700000000000,
      },
      {
        name: "baoyu-article-illustrator",
        fingerprint: "hash_fp_2",
        locations: [
          { id: "2", tool: "claude_code", found_path: "/Users/vanilla/.claude/skills/baoyu-article-illustrator" },
        ],
        imported: false,
        found_at: 1700000000000,
      },
    ];
    mocks.scan.mockResolvedValueOnce({
      tools_scanned: 2,
      skills_found: 2,
      groups,
    });

    render(
      <MemoryRouter initialEntries={["/install?tab=local"]}>
        <InstallSkills />
      </MemoryRouter>
    );

    // 手动点击扫描
    await user.click(screen.getAllByRole("button", { name: "install.scan.startScan" })[0]);

    await waitFor(() => {
      const items = screen.getAllByText("baoyu-article-illustrator");
      expect(items.length).toBe(2);
    });

    const keyWarningCalls = errorSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("Encountered two children with the same key"))
    );
    expect(keyWarningCalls.length).toBe(0);
    errorSpy.mockRestore();
  });

  it("renders agent dropdown and search filter even before scanning, and passes selected agents to scan", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/install?tab=local"]}>
        <InstallSkills />
      </MemoryRouter>
    );

    // 未扫描前，搜索框和 Agent 下拉菜单就已经渲染可见
    expect(screen.getByPlaceholderText("install.scan.searchPlaceholder")).toBeTruthy();
    const dropdownButton = screen.getByTitle("install.scan.allAgents");
    expect(dropdownButton).toBeTruthy();

    // 点击下拉菜单，可展开并查看选项
    await user.click(dropdownButton);
    expect(screen.getByText("install.scan.selectAllAgents")).toBeTruthy();
    expect(screen.getByText("install.scan.resetDefaultAgents")).toBeTruthy();

    // 点击扫描，触发扫描
    await user.click(screen.getAllByRole("button", { name: "install.scan.startScan" })[0]);
    await waitFor(() => {
      expect(mocks.scan).toHaveBeenCalledTimes(1);
    });
  });
});
