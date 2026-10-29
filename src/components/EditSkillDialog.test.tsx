// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditSkillDialog } from "./EditSkillDialog";
import { bumpVersion, parseSkillContent } from "../lib/skillVersion";
import { editSkill } from "../lib/tauri";
import type { InstallLocalResult, ManagedSkill } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  editSkill: vi.fn(),
  revealSkillFolder: vi.fn(),
  getSkillDocument: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sampleSkill: ManagedSkill = {
  id: "skill-1",
  name: "test-skill",
  description: "Initial description",
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
  central_path: "/path/to/test-skill",
  enabled: true,
  created_at: 1700000000000,
  updated_at: 1700000000000,
  status: "ok",
  targets: [],
  preset_ids: [],
  tags: [],
};

describe("bumpVersion", () => {
  it("increments patch number", () => {
    expect(bumpVersion("1.0.0")).toBe("1.0.1");
    expect(bumpVersion("1.0.98")).toBe("1.0.99");
  });

  it("rolls over patch > 99 to minor", () => {
    expect(bumpVersion("1.0.99")).toBe("1.1.0");
    expect(bumpVersion("1.5.99")).toBe("1.6.0");
  });

  it("rolls over minor > 99 to major", () => {
    expect(bumpVersion("1.99.99")).toBe("2.0.0");
    expect(bumpVersion("0.99.99")).toBe("1.0.0");
  });

  it("handles v prefixes and non-standard versions", () => {
    expect(bumpVersion("v1.0.0")).toBe("1.0.1");
    expect(bumpVersion("1.0")).toBe("1.0.1");
    expect(bumpVersion("invalid")).toBe("1.0.1");
  });
});

describe("parseSkillContent", () => {
  it("extracts version and updated_at from frontmatter", () => {
    const raw = `---
name: my-skill
description: some description
version: 1.2.3
updated_at: 2026-10-29 18:00:00
---

# Content
`;
    const parsed = parseSkillContent(raw);
    expect(parsed.name).toBe("my-skill");
    expect(parsed.description).toBe("some description");
    expect(parsed.version).toBe("1.2.3");
    expect(parsed.updatedAt).toBe("2026-10-29 18:00:00");
    expect(parsed.body).toBe("\n# Content");
  });

  it("falls back to default 1.0.0 when version is omitted", () => {
    const raw = `---
name: my-skill
---

# Body
`;
    const parsed = parseSkillContent(raw);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.updatedAt).toBeNull();
  });
});

describe("EditSkillDialog", () => {
  function setup(initialDocContent?: string) {
    const onClose = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const doc = initialDocContent
      ? {
          skill_id: sampleSkill.id,
          filename: "SKILL.md",
          content: initialDocContent,
          central_path: sampleSkill.central_path,
        }
      : undefined;

    render(
      <EditSkillDialog
        skill={sampleSkill}
        initialDoc={doc}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    return { user: userEvent.setup(), onClose, onSaved };
  }

  it("renders existing version and auto-increments version on save if unmodified", async () => {
    const initialContent = `---
name: test-skill
description: Initial description
version: 1.0.5
updated_at: 2026-10-29 10:00:00
---

# Instructions
`;
    const { user, onSaved, onClose } = setup(initialContent);
    vi.mocked(editSkill).mockResolvedValueOnce({
      name: "test-skill",
      skill_id: sampleSkill.id,
      path: sampleSkill.central_path,
    } as InstallLocalResult);

    const versionInput = screen.getByLabelText("editSkill.version");
    expect((versionInput as HTMLInputElement).value).toBe("1.0.5");

    await user.click(screen.getByRole("button", { name: "editSkill.save" }));

    // Because version wasn't manually edited, it should auto-increment from 1.0.5 to 1.0.6
    expect(editSkill).toHaveBeenCalledWith(
      sampleSkill.id,
      "test-skill",
      "Initial description",
      "# Instructions",
      "1.0.6",
    );
    expect(onSaved).toHaveBeenCalledWith("test-skill");
    expect(onClose).toHaveBeenCalled();
  });

  it("uses custom version when user manually edits version field", async () => {
    const initialContent = `---
name: test-skill
description: Initial description
version: 1.0.5
---

# Instructions
`;
    const { user, onSaved } = setup(initialContent);
    vi.mocked(editSkill).mockResolvedValueOnce({
      name: "test-skill",
      skill_id: sampleSkill.id,
      path: sampleSkill.central_path,
    } as InstallLocalResult);

    const versionInput = screen.getByLabelText("editSkill.version");
    await user.clear(versionInput);
    await user.type(versionInput, "2.0.0");

    await user.click(screen.getByRole("button", { name: "editSkill.save" }));

    // Because user explicitly typed 2.0.0, save 2.0.0 directly
    expect(editSkill).toHaveBeenCalledWith(
      sampleSkill.id,
      "test-skill",
      "Initial description",
      "# Instructions",
      "2.0.0",
    );
    expect(onSaved).toHaveBeenCalledWith("test-skill");
  });
});
