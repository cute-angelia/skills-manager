import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { createSkill } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({ createSkill: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn().mockResolvedValue(undefined);
  render(<CreateSkillDialog onClose={onClose} onCreated={onCreated} />);
  return { user: userEvent.setup(), onClose, onCreated };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  name = "meeting-summary",
) {
  await user.type(screen.getByLabelText("createSkill.name"), name);
  await user.type(
    screen.getByLabelText("createSkill.description"),
    "Summarize meetings",
  );
}

describe("CreateSkillDialog", () => {
  it("rejects invalid names and empty descriptions before invoking the backend", async () => {
    const { user } = setup();
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    expect(createSkill).not.toHaveBeenCalled();
    await fill(user, "../escape");
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "createSkill.invalidName",
    );
    expect(createSkill).not.toHaveBeenCalled();
  });

  it("previews Markdown and keeps the draft when switching back to edit", async () => {
    const { user } = setup();
    const body = screen.getByRole("textbox", { name: "createSkill.body" });
    await user.clear(body);
    await user.type(body, "# My draft");
    await user.click(screen.getByRole("tab", { name: "createSkill.preview" }));
    expect(screen.getByRole("heading", { name: "My draft" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "createSkill.edit" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "createSkill.body",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("# My draft");
  });

  it("preserves the draft and explains name collisions after a failed request", async () => {
    vi.mocked(createSkill).mockRejectedValueOnce(
      new Error("SKILL_EXISTS: meeting-summary"),
    );
    const { user, onClose } = setup();
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("createSkill.exists"),
    );
    expect(
      (screen.getByLabelText("createSkill.name") as HTMLInputElement).value,
    ).toBe("meeting-summary");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks closing and duplicate submission while creating, then refreshes and closes", async () => {
    let resolve!: (value: { skill_id: string; name: string }) => void;
    vi.mocked(createSkill).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, onCreated, onClose } = setup();
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "common.cancel",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.keyboard("{Escape}{Enter}");
    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(createSkill).toHaveBeenCalledWith(
      "meeting-summary",
      "Summarize meetings",
      "createSkill.template",
    );
    expect(onClose).not.toHaveBeenCalled();
    resolve({ skill_id: "new-id", name: "meeting-summary" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByLabelText("createSkill.name") as HTMLInputElement).value,
    ).toBe("");
  });

  it("requires description and body, and rejects a second YAML header", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("createSkill.name"), "example");
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "createSkill.requiredDescription",
    );
    await user.type(
      screen.getByLabelText("createSkill.description"),
      "Example",
    );
    const body = screen.getByRole("textbox", { name: "createSkill.body" });
    await user.clear(body);
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "createSkill.requiredBody",
    );
    await user.type(body, "---\nname: nested\n---");
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "createSkill.frontmatter",
    );
    expect(createSkill).not.toHaveBeenCalled();
  });

  it("closes a saved draft even if refreshing the list fails", async () => {
    vi.mocked(createSkill).mockResolvedValueOnce({
      skill_id: "saved",
      name: "meeting-summary",
    });
    const { user, onCreated, onClose } = setup();
    onCreated.mockRejectedValueOnce(new Error("Refresh failed"));
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "createSkill.create" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(createSkill).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard preview switching and Escape cancellation", async () => {
    const { user, onClose } = setup();
    const edit = screen.getByRole("tab", { name: "createSkill.edit" });
    edit.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen
        .getByRole("tab", { name: "createSkill.preview" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await user.keyboard("{Home}");
    expect(
      screen
        .getByRole("tab", { name: "createSkill.edit" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
