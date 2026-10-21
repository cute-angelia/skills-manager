import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { AgentIcon } from "./AgentIcon";
import { EditAgentPathDialog } from "./EditAgentPathDialog";

export interface AgentToggleItem {
  key: string;
  displayName: string;
  enabled: boolean;
  isAvailable: boolean;
  disabled?: boolean;
  badgeLabel?: string | null;
}

interface Props {
  items: AgentToggleItem[];
  togglingKey?: string | null;
  onToggle: (key: string, enabled: boolean) => void;
  className?: string;
}

export function AgentToggleSection({
  items,
  togglingKey,
  onToggle,
  className,
}: Props) {
  const { t } = useTranslation();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ key: string; displayName: string } | null>(null);

  const availableItems = items.filter((item) => item.isAvailable);
  const unavailableItems = items.filter((item) => !item.isAvailable);
  const enabledAvailableCount = availableItems.filter((item) => item.enabled).length;

  return (
    <div className={cn("rounded-xl border border-border-subtle", className)}>
      <div className="border-b border-border-subtle px-6 py-2.5">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-medium text-secondary">{t("mySkills.agentTogglesTitle")}</span>
            <span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[12px] text-muted">
              {t("mySkills.syncSummary", {
                synced: enabledAvailableCount,
                total: availableItems.length,
              })}
            </span>
          </div>
        </div>

        {availableItems.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-3">
            {availableItems.map((item) => (
              <AgentToggle
                key={item.key}
                item={item}
                loading={togglingKey === item.key}
                onToggle={onToggle}
                onEditAgent={(item) =>
                  setEditingAgent({ key: item.key, displayName: item.displayName })
                }
              />
            ))}
          </div>
        )}

        {unavailableItems.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowUnavailable((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-secondary"
            >
              {showUnavailable ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>{t("mySkills.agentUnavailableCount", { count: unavailableItems.length })}</span>
            </button>
            {showUnavailable && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 md:grid-cols-3">
                {unavailableItems.map((item) => (
                  <AgentToggle
                    key={item.key}
                    item={item}
                    loading={togglingKey === item.key}
                    onToggle={onToggle}
                    onEditAgent={(item) =>
                      setEditingAgent({ key: item.key, displayName: item.displayName })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <EditAgentPathDialog
        open={Boolean(editingAgent)}
        agentKey={editingAgent?.key ?? null}
        agentDisplayName={editingAgent?.displayName}
        onClose={() => setEditingAgent(null)}
      />
    </div>
  );
}

function AgentToggle({
  item,
  loading,
  onToggle,
  onEditAgent,
}: {
  item: AgentToggleItem;
  loading: boolean;
  onToggle: (key: string, enabled: boolean) => void;
  onEditAgent: (item: AgentToggleItem) => void;
}) {
  const disabled = Boolean(item.disabled || loading);
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors",
        item.enabled ? "border-border bg-surface" : "border-border-subtle bg-bg-secondary",
        !disabled && "hover:bg-surface-hover",
        disabled && "opacity-55"
      )}
      title={item.badgeLabel ?? undefined}
    >
      <button
        type="button"
        onClick={() => onToggle(item.key, !item.enabled)}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-2 outline-none text-left"
      >
        <span className="shrink-0">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
          ) : item.enabled ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted" />
          )}
        </span>
        <AgentIcon
          agentKey={item.key}
          displayName={item.displayName}
          className="h-5 w-5 rounded-[4px]"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-secondary">
          {item.displayName}
        </span>
        {item.badgeLabel && (
          <span className="shrink-0 rounded-full border border-border-subtle bg-bg-secondary px-1.5 py-0.5 text-[11px] text-muted">
            {item.badgeLabel}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditAgent(item);
        }}
        className="shrink-0 rounded p-1 text-muted hover:text-accent hover:bg-surface outline-none opacity-40 transition-opacity group-hover:opacity-100 focus:opacity-100"
        title="编辑配置"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
