import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Loader2, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { editSkill, getSkillDocument, revealSkillFolder } from "../lib/tauri";
import type { ManagedSkill, SkillDocument } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { SkillMarkdown } from "./SkillMarkdown";
import { cn } from "../utils";

interface Props {
  skill: ManagedSkill;
  initialDoc?: SkillDocument | null;
  onClose: () => void;
  onSaved: (updatedName?: string) => Promise<void>;
}

export function parseSkillContent(
  raw: string,
  defaultName = "",
  defaultDesc = "",
) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) {
    return { name: defaultName, description: defaultDesc, body: raw };
  }
  const afterFirst = trimmed.slice(3);
  const closingIndex = afterFirst.indexOf("---");
  if (closingIndex === -1) {
    return { name: defaultName, description: defaultDesc, body: raw };
  }
  const yamlStr = afterFirst.slice(0, closingIndex);
  const body = afterFirst.slice(closingIndex + 3).replace(/^\r?\n/, "");

  let name = defaultName;
  let description = defaultDesc;

  const nameMatch = yamlStr.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  const descMatch = yamlStr.match(
    /^description:\s*(?:[|>-]\s*\n([\s\S]*?)(?=\n\S|\n*$)|(.+)$)/m,
  );
  if (descMatch) {
    if (descMatch[1]) {
      description = descMatch[1]
        .split("\n")
        .map((l) => l.replace(/^\s{2}/, ""))
        .join("\n")
        .trim();
    } else if (descMatch[2]) {
      description = descMatch[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return { name, description, body };
}

export function EditSkillDialog({ skill, initialDoc, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const parsed = parseSkillContent(
    initialDoc?.content ?? "",
    skill.name,
    skill.description ?? "",
  );

  const [name, setName] = useState(parsed.name || skill.name);
  const [description, setDescription] = useState(
    parsed.description || skill.description || "",
  );
  const [body, setBody] = useState(parsed.body);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const submitting = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const descInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialDoc) {
      getSkillDocument(skill.id)
        .then((doc) => {
          const p = parseSkillContent(
            doc.content,
            skill.name,
            skill.description ?? "",
          );
          if (p.name) setName(p.name);
          if (p.description) setDescription(p.description);
          setBody(p.body);
        })
        .catch(() => {});
    }
  }, [skill.id, initialDoc, skill.name, skill.description]);

  useEffect(() => {
    const previous = document.activeElement;
    descInput.current?.focus();
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

  const handleReveal = async () => {
    try {
      setRevealing(true);
      await revealSkillFolder(skill.id);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRevealing(false);
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
      setError(t(`editSkill.${validation}`));
      return;
    }
    submitting.current = true;
    dialog.current?.focus();
    setBusy(true);
    setError(null);
    try {
      await editSkill(skill.id, identifier, description.trim(), body.trim());
      toast.success(t("editSkill.success"));
      await onSaved(identifier);
      onClose();
    } catch (cause) {
      const message = getErrorMessage(cause, t("common.error"));
      if (message.includes("SKILL_EXISTS")) {
        setError(t("editSkill.exists"));
      } else {
        setError(message);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
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
        aria-labelledby="edit-skill-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div>
            <h2
              id="edit-skill-title"
              className="flex items-center gap-2 text-[17px] font-semibold text-primary"
            >
              <Pencil className="h-4 w-4 text-accent" />
              {t("editSkill.title")}
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              {t("editSkill.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReveal}
              disabled={revealing}
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-hover/70 px-2.5 py-1.5 text-[12px] text-muted hover:text-secondary transition-colors outline-none"
              title={t("editSkill.openFolder")}
            >
              {revealing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5" />
              )}
              {t("editSkill.openFolder")}
            </button>
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
                  htmlFor="edit-skill-name"
                  className="mb-1.5 block text-[13px] font-medium text-secondary"
                >
                  {t("editSkill.name")}
                </label>
                <input
                  id="edit-skill-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={64}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="app-input w-full font-mono"
                />
                <p className="mt-1 text-[12px] text-muted">
                  {t("editSkill.nameHint")}
                </p>
              </div>
              <div>
                <label
                  htmlFor="edit-skill-description"
                  className="mb-1.5 block text-[13px] font-medium text-secondary"
                >
                  {t("editSkill.description")}
                </label>
                <textarea
                  ref={descInput}
                  id="edit-skill-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  placeholder={t("editSkill.descriptionPlaceholder")}
                  className="app-input h-auto w-full resize-y py-2"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="edit-skill-body"
                    className="text-[13px] font-medium text-secondary"
                  >
                    {t("editSkill.body")}
                  </label>
                  <div
                    role="tablist"
                    aria-label={t("editSkill.body")}
                    className="app-segmented"
                  >
                    {[false, true].map((isPreview) => (
                      <button
                        key={String(isPreview)}
                        type="button"
                        role="tab"
                        aria-selected={preview === isPreview}
                        tabIndex={preview === isPreview ? 0 : -1}
                        onClick={() => setPreview(isPreview)}
                        className={cn(
                          "app-segmented-button",
                          preview === isPreview && "app-segmented-button-active",
                        )}
                      >
                        {t(isPreview ? "editSkill.preview" : "editSkill.edit")}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  {preview ? (
                    <div className="min-h-[280px] rounded-xl border border-border-subtle bg-background p-4">
                      <SkillMarkdown content={body} />
                    </div>
                  ) : (
                    <textarea
                      id="edit-skill-body"
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      rows={12}
                      spellCheck={false}
                      className="app-input h-auto min-h-[280px] w-full resize-y py-3 font-mono leading-6"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-[12px] text-muted">
                  {t("editSkill.bodyHint")}
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
              {t(busy ? "editSkill.saving" : "editSkill.save")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
