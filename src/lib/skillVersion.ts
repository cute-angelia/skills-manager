export function parseSkillContent(
  raw: string,
  defaultName = "",
  defaultDesc = "",
) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) {
    return { name: defaultName, description: defaultDesc, body: raw, version: "1.0.0", updatedAt: null };
  }
  const afterFirst = trimmed.slice(3);
  const closingIndex = afterFirst.indexOf("---");
  if (closingIndex === -1) {
    return { name: defaultName, description: defaultDesc, body: raw, version: "1.0.0", updatedAt: null };
  }
  const yamlStr = afterFirst.slice(0, closingIndex);
  const body = afterFirst.slice(closingIndex + 3).replace(/^\r?\n/, "");

  let name = defaultName;
  let description = defaultDesc;
  let version = "1.0.0";
  let updatedAt: string | null = null;

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

  const versionMatch = yamlStr.match(/^version:\s*(.+)$/m);
  if (versionMatch) {
    version = versionMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  const updatedMatch = yamlStr.match(/^updated_at:\s*(.+)$/m);
  if (updatedMatch) {
    updatedAt = updatedMatch[1].trim().replace(/^['"]|['"]$/g, "");
  }

  return { name, description, body, version, updatedAt };
}

export function bumpVersion(current: string): string {
  const cleaned = current.trim().replace(/^v/i, "");
  const parts = cleaned.split(".");
  let major = parseInt(parts[0], 10);
  let minor = parseInt(parts[1], 10);
  let patch = parseInt(parts[2], 10);

  if (isNaN(major)) major = 1;
  if (isNaN(minor)) minor = 0;
  if (isNaN(patch)) patch = 0;

  patch += 1;
  if (patch > 99) {
    patch = 0;
    minor += 1;
    if (minor > 99) {
      minor = 0;
      major += 1;
    }
  }

  return `${major}.${minor}.${patch}`;
}
