import { useState, useEffect } from "react";
import { X, FolderOpen, RotateCcw, Loader2 } from "lucide-react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AgentIcon } from "./AgentIcon";
import * as api from "../lib/tauri";
import type { ToolInfo } from "../lib/tauri";

interface Props {
  open: boolean;
  agentKey: string | null;
  agentDisplayName?: string;
  initialTool?: ToolInfo | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function EditAgentPathDialog({
  open,
  agentKey,
  agentDisplayName,
  initialTool,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<ToolInfo | null>(initialTool ?? null);
  const [skillsDir, setSkillsDir] = useState("");
  const [projectSkillsDir, setProjectSkillsDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !agentKey) return;

    if (initialTool && initialTool.key === agentKey) {
      setTool(initialTool);
      setSkillsDir(initialTool.skills_dir);
      setProjectSkillsDir(initialTool.project_relative_skills_dir ?? "");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api
      .getToolStatus()
      .then((tools) => {
        if (cancelled) return;
        const found = tools.find((t) => t.key === agentKey);
        if (found) {
          setTool(found);
          setSkillsDir(found.skills_dir);
          setProjectSkillsDir(found.project_relative_skills_dir ?? "");
        }
      })
      .catch((e) => {
        if (!cancelled) toast.error(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, agentKey, initialTool]);

  if (!open || !agentKey) return null;

  const displayName = tool?.display_name || agentDisplayName || agentKey;

  const handleBrowse = async () => {
    try {
      const selected = await dialogOpen({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setSkillsDir(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetGlobalPath = async () => {
    if (!agentKey) return;
    try {
      await api.resetCustomToolPath(agentKey);
      const tools = await api.getToolStatus();
      const updated = tools.find((t) => t.key === agentKey);
      if (updated) {
        setTool(updated);
        setSkillsDir(updated.skills_dir);
      }
      toast.success(t("settings.pathReset"));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleResetProjectPath = async () => {
    if (!agentKey) return;
    try {
      await api.resetCustomToolProjectPath(agentKey);
      const tools = await api.getToolStatus();
      const updated = tools.find((t) => t.key === agentKey);
      if (updated) {
        setTool(updated);
        setProjectSkillsDir(updated.project_relative_skills_dir ?? "");
      }
      toast.success(t("settings.projectPathReset"));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSave = async () => {
    if (!agentKey) return;
    const trimmedGlobal = skillsDir.trim();
    if (!trimmedGlobal) {
      toast.error(t("settings.skillsPath") + " 不能为空");
      return;
    }
    setSaving(true);
    try {
      if (!tool || trimmedGlobal !== tool.skills_dir) {
        await api.setCustomToolPath(agentKey, trimmedGlobal);
      }
      const trimmedProject = projectSkillsDir.trim();
      const originalProject = tool?.project_relative_skills_dir ?? "";
      if (trimmedProject !== originalProject) {
        await api.setCustomToolProjectPath(agentKey, trimmedProject || null);
      }
      toast.success(t("settings.pathSaved"));
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-[480px] p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <AgentIcon
              agentKey={agentKey}
              displayName={displayName}
              className="h-6 w-6 rounded-md shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-primary truncate">
                {displayName}
              </h2>
              <p className="text-[11px] text-muted truncate">
                {t("settings.editAgentConfig")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-secondary p-1 rounded-md transition-colors outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex h-36 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Global skills path */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium text-tertiary">
                  {t("settings.skillsPath")}
                </label>
                {tool?.has_path_override && !tool.is_custom && (
                  <button
                    type="button"
                    onClick={handleResetGlobalPath}
                    className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline outline-none"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("settings.resetPath")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={skillsDir}
                  onChange={(e) => setSkillsDir(e.target.value)}
                  placeholder={t("settings.skillsPathPlaceholder")}
                  className="w-full bg-background border border-border-subtle rounded-lg px-3 py-2 text-[12px] font-mono text-secondary focus:outline-none focus:border-border transition-all placeholder-faint"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") onClose();
                  }}
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border-subtle bg-surface hover:bg-surface-hover text-[12px] text-secondary transition-colors outline-none"
                  title={t("settings.selectFolder")}
                >
                  <FolderOpen className="w-4 h-4 text-muted" />
                </button>
              </div>
              {tool?.has_path_override && !tool.is_custom && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  {t("settings.overridePathHint")}
                </p>
              )}
            </div>

            {/* Project-relative skills path */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium text-tertiary">
                  {t("settings.projectSkillsPath")}
                </label>
                {tool?.has_project_path_override && !tool.is_custom && (
                  <button
                    type="button"
                    onClick={handleResetProjectPath}
                    className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline outline-none"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("settings.resetPath")}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={projectSkillsDir}
                onChange={(e) => setProjectSkillsDir(e.target.value)}
                placeholder={t("settings.projectSkillsPathPlaceholder")}
                className="w-full bg-background border border-border-subtle rounded-lg px-3 py-2 text-[12px] font-mono text-secondary focus:outline-none focus:border-border transition-all placeholder-faint"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") onClose();
                }}
              />
              <p className="mt-1 text-[11px] text-muted leading-relaxed">
                {t("settings.projectSkillsPathDesc")}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-tertiary hover:text-secondary hover:bg-surface-hover transition-colors outline-none"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-dark hover:bg-accent text-white text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-accent-border outline-none"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
