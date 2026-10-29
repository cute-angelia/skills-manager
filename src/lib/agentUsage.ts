import { useEffect, useState } from "react";

export const AGENT_ENABLE_COUNTS_KEY = "skills-manager:agent-enable-counts";

export type AgentEnableCounts = Record<string, number>;

const listeners = new Set<(counts: AgentEnableCounts) => void>();

export function getAgentEnableCounts(): AgentEnableCounts {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return {};
    }
    const raw = window.localStorage.getItem(AGENT_ENABLE_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result: AgentEnableCounts = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          result[k] = v;
        }
      }
      return result;
    }
  } catch {
    // ignore parse / storage errors
  }
  return {};
}

export function recordAgentEnable(agentKey: string): AgentEnableCounts {
  if (!agentKey) return getAgentEnableCounts();
  const current = getAgentEnableCounts();
  const next: AgentEnableCounts = {
    ...current,
    [agentKey]: (current[agentKey] || 0) + 1,
  };

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(AGENT_ENABLE_COUNTS_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage write errors
  }

  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch {
      // ignore listener error
    }
  });

  return next;
}

export function clearAgentEnableCounts(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(AGENT_ENABLE_COUNTS_KEY);
    }
  } catch {
    // ignore
  }
  const empty: AgentEnableCounts = {};
  listeners.forEach((listener) => {
    try {
      listener(empty);
    } catch {
      // ignore
    }
  });
}

/**
 * Sorts tools descending by their enable count.
 * Maintains stable sort order when counts are equal.
 */
export function sortToolsByUsage<T extends { key: string }>(
  tools: T[],
  counts: AgentEnableCounts
): T[] {
  return [...tools].sort((a, b) => {
    const countA = counts[a.key] || 0;
    const countB = counts[b.key] || 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return 0;
  });
}

export function useAgentEnableCounts(): [AgentEnableCounts, (agentKey: string) => void] {
  const [counts, setCounts] = useState<AgentEnableCounts>(() => getAgentEnableCounts());

  useEffect(() => {
    const handleUpdate = (newCounts: AgentEnableCounts) => {
      setCounts(newCounts);
    };
    listeners.add(handleUpdate);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === AGENT_ENABLE_COUNTS_KEY) {
        setCounts(getAgentEnableCounts());
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }

    return () => {
      listeners.delete(handleUpdate);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, []);

  return [counts, recordAgentEnable];
}
