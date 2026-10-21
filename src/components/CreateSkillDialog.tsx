import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { FilePlus2, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { createSkill } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { SkillMarkdown } from "./SkillMarkdown";
import { cn } from "../utils";

interface Props {
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function CreateSkillDialog({ onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState(() => t("createSkill.template"));
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    nameInput.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  const close = () => {
    if (!submitting.current) onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key !== "Tab") return;
    const elements = dialog.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled):not([tabindex='-1']), input:not(:disabled), textarea:not(:disabled), [tabindex='0']",
    );
    if (!elements?.length) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const identifier = name.trim();
    let validation: string | null = null;
    if (
      !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(identifier) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(identifier)
    )
      validation = "invalidName";
    else if (!description.trim()) validation = "requiredDescription";
    else if (!body.trim()) validation = "requiredBody";
    else if (body.trim().split(/\r?\n/, 1)[0].trimEnd() === "---")
      validation = "frontmatter";
    if (validation) {
      setError(t(`createSkill.${validation}`));
      return;
    }
    submitting.current = true;
    dialog.current?.focus();
    setBusy(true);
    setError(null);
    try {
      await createSkill(identifier, description.trim(), body.trim());
    } catch (cause) {
      const message = getErrorMessage(cause, t("common.error"));
      const code = message.split(":", 1)[0];
      const codes: Record<string, string> = {
        SKILL_EXISTS: "exists",
        INVALID_SKILL_NAME: "invalidName",
        EMPTY_DESCRIPTION: "requiredDescription",
        EMPTY_BODY: "requiredBody",
        BODY_FRONTMATTER: "frontmatter",
      };
      setError(codes[code] ? t(`createSkill.${codes[code]}`) : message);
      submitting.current = false;
      setBusy(false);
      return;
    }
    // Creation is already durable: a refresh failure must not invite another
    // create request for the same name or keep an apparently unsaved draft.
    toast.success(t("createSkill.success"));
    try {
      await onCreated();
    } catch {
      toast.error(t("createSkill.refreshFailed"));
    }
    setName("");
    setDescription("");
    setBody(t("createSkill.template"));
    submitting.current = false;
    setBusy(false);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-skill-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div>
            <h2
              id="create-skill-title"
              className="flex items-center gap-2 text-[17px] font-semibold text-primary"
            >
              <FilePlus2 className="h-4 w-4 text-accent" />
              {t("createSkill.title")}
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              {t("createSkill.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 text-muted hover:bg-surface-hover disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-col"
        >
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <fieldset disabled={busy} className="space-y-4">
              <div>
                <label
                  htmlFor="new-skill-name"
                  className="mb-1.5 block text-[13px] font-medium text-secondary"
                >
                  {t("createSkill.name")}
                </label>
                <input
                  ref={nameInput}
                  id="new-skill-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={64}
                  placeholder="meeting-summary"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-describedby="new-skill-name-hint"
                  className="app-input w-full font-mono"
                />
                <p
                  id="new-skill-name-hint"
                  className="mt-1 text-[12px] text-muted"
                >
                  {t("createSkill.nameHint")}
                </p>
              </div>
              <div>
                <label
                  htmlFor="new-skill-description"
                  className="mb-1.5 block text-[13px] font-medium text-secondary"
                >
                  {t("createSkill.description")}
                </label>
                <textarea
                  id="new-skill-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  placeholder={t("createSkill.descriptionPlaceholder")}
                  className="app-input h-auto w-full resize-y py-2"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="new-skill-body"
                    className="text-[13px] font-medium text-secondary"
                  >
                    {t("createSkill.body")}
                  </label>
                  <div
                    role="tablist"
                    aria-label={t("createSkill.body")}
                    className="app-segmented"
                    onKeyDown={(event) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? false
                          : event.key === "End"
                            ? true
                            : !preview;
                      setPreview(next);
                      event.currentTarget
                        .querySelector<HTMLButtonElement>(
                          next ? "#skill-preview-tab" : "#skill-edit-tab",
                        )
                        ?.focus();
                    }}
                  >
                    {[false, true].map((isPreview) => (
                      <button
                        key={String(isPreview)}
                        type="button"
                        role="tab"
                        id={isPreview ? "skill-preview-tab" : "skill-edit-tab"}
                        aria-controls="new-skill-body-panel"
                        aria-selected={preview === isPreview}
                        tabIndex={preview === isPreview ? 0 : -1}
                        onClick={() => setPreview(isPreview)}
                        className={cn(
                          "app-segmented-button",
                          preview === isPreview &&
                            "app-segmented-button-active",
                        )}
                      >
                        {t(
                          isPreview
                            ? "createSkill.preview"
                            : "createSkill.edit",
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  id="new-skill-body-panel"
                  role="tabpanel"
                  aria-labelledby={
                    preview ? "skill-preview-tab" : "skill-edit-tab"
                  }
                >
                  {preview ? (
                    <div className="min-h-[280px] rounded-xl border border-border-subtle bg-background p-4">
                      <SkillMarkdown content={body} />
                    </div>
                  ) : (
                    <textarea
                      id="new-skill-body"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      rows={12}
                      spellCheck={false}
                      className="app-input h-auto min-h-[280px] w-full resize-y py-3 font-mono leading-6"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-[12px] text-muted">
                  {t("createSkill.bodyHint")}
                </p>
              </div>
            </fieldset>
            {error && (
              <p
                role="alert"
                className="mt-4 whitespace-pre-wrap rounded-lg border border-red-500/30 bg-danger-bg px-3 py-2 text-[13px] text-danger"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="app-button-secondary disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="app-button-primary disabled:opacity-50"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(busy ? "createSkill.creating" : "createSkill.create")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
