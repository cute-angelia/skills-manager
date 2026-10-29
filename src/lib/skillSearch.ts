/// Skill search treats `-`, `_`, unicode dashes, and whitespace alike, so "wrap up" finds
/// `wrap-up` (#510). Normalize both the query and each searched field to use `-` as delimiter.
export function normalizeSkillSearch(value: string) {
  if (!value) return "";
  const trimmed = value.trim();
  // If the string contains only separators and no alphanumeric/word characters, treat as empty
  if (!/[^\s\-_－—–‐−]/.test(trimmed)) {
    return "";
  }
  return trimmed
    .toLowerCase()
    .replace(/[\s\-_－—–‐−]+/g, "-");
}

/// `query` must already be normalized; an empty query matches everything.
export function skillSearchMatches(query: string, fields: (string | null | undefined)[]) {
  if (!query) return true;
  return fields.some((field) => {
    if (!field) return false;
    return normalizeSkillSearch(field).includes(query);
  });
}
