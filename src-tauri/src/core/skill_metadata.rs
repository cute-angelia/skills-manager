use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct SkillMeta {
    pub name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub updated_at: Option<String>,
}

fn read_named_file_exact(dir: &Path, target_name: &str) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        if !entry.file_type().ok()?.is_file() {
            continue;
        }
        if entry.file_name().to_string_lossy() == target_name {
            return std::fs::read_to_string(entry.path()).ok();
        }
    }
    None
}

fn has_named_file_exact(dir: &Path, target_name: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry.file_type().map(|ft| ft.is_file()).unwrap_or(false)
            && entry.file_name().to_string_lossy() == target_name
    })
}

pub fn parse_skill_md(dir: &Path) -> SkillMeta {
    parse_skill_md_with_candidates(dir, &["SKILL.md", "skill.md"])
}

fn parse_skill_md_with_candidates(dir: &Path, candidates: &[&str]) -> SkillMeta {
    for candidate in candidates {
        if let Some(content) = read_named_file_exact(dir, candidate) {
            return parse_frontmatter(&content);
        }
    }
    SkillMeta {
        name: None,
        description: None,
        version: None,
        updated_at: None,
    }
}

fn parse_frontmatter(content: &str) -> SkillMeta {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return SkillMeta {
            name: None,
            description: None,
            version: None,
            updated_at: None,
        };
    }

    let rest = &trimmed[3..];
    if let Some(end) = rest.find("---") {
        let yaml_str = &rest[..end];
        if let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(yaml_str) {
            let name = yaml
                .get("name")
                .and_then(|v| match v {
                    serde_yaml::Value::String(s) => Some(s.clone()),
                    _ => None,
                });
            let description = yaml
                .get("description")
                .and_then(|v| match v {
                    serde_yaml::Value::String(s) => Some(s.clone()),
                    _ => None,
                });
            let version = yaml
                .get("version")
                .and_then(|v| match v {
                    serde_yaml::Value::String(s) => Some(s.clone()),
                    serde_yaml::Value::Number(n) => Some(n.to_string()),
                    _ => None,
                });
            let updated_at = yaml
                .get("updated_at")
                .and_then(|v| match v {
                    serde_yaml::Value::String(s) => Some(s.clone()),
                    serde_yaml::Value::Number(n) => Some(n.to_string()),
                    _ => None,
                });
            return SkillMeta {
                name,
                description,
                version,
                updated_at,
            };
        }
    }

    SkillMeta {
        name: None,
        description: None,
        version: None,
        updated_at: None,
    }
}

/// Increments version according to the rule:
/// Format is `X.Y.Z` (major.minor.patch).
/// Increments Z (patch). If Z > 99, Z resets to 0 and Y (minor) increments.
/// If Y > 99, Y resets to 0 and X (major) increments.
pub fn bump_version(current: &str) -> String {
    let cleaned = current.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let parts: Vec<&str> = cleaned.split('.').collect();

    let mut major: u64 = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(1);
    let mut minor: u64 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let mut patch: u64 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

    patch += 1;
    if patch > 99 {
        patch = 0;
        minor += 1;
        if minor > 99 {
            minor = 0;
            major += 1;
        }
    }

    format!("{major}.{minor}.{patch}")
}

/// Ensure destination skill has `version` and `updated_at` in its frontmatter.
/// Default values if missing: version = "1.0.0", updated_at = current local time.
pub fn ensure_skill_frontmatter_metadata(dir: &Path) -> anyhow::Result<()> {
    let candidate = if dir.join("SKILL.md").is_file() {
        dir.join("SKILL.md")
    } else if dir.join("skill.md").is_file() {
        dir.join("skill.md")
    } else {
        return Ok(());
    };

    let content = match std::fs::read_to_string(&candidate) {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };

    let trimmed = content.trim_start();
    let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if trimmed.starts_with("---") {
        let rest = &trimmed[3..];
        if let Some(end) = rest.find("---") {
            let yaml_str = &rest[..end];
            let body = rest[end + 3..].trim_start_matches("\r\n").trim_start_matches('\n');
            let mut val: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap_or(serde_yaml::Value::Mapping(Default::default()));

            if let serde_yaml::Value::Mapping(ref mut map) = val {
                let ver_key = serde_yaml::Value::String("version".to_string());
                let upd_key = serde_yaml::Value::String("updated_at".to_string());

                let mut modified = false;
                let need_ver = !map.contains_key(&ver_key)
                    || map.get(&ver_key).map_or(true, |v| {
                        match v {
                            serde_yaml::Value::String(s) => s.trim().is_empty(),
                            serde_yaml::Value::Null => true,
                            _ => false,
                        }
                    });
                if need_ver {
                    map.insert(ver_key, serde_yaml::Value::String("1.0.0".to_string()));
                    modified = true;
                }

                let need_upd = !map.contains_key(&upd_key)
                    || map.get(&upd_key).map_or(true, |v| {
                        match v {
                            serde_yaml::Value::String(s) => s.trim().is_empty(),
                            serde_yaml::Value::Null => true,
                            _ => false,
                        }
                    });
                if need_upd {
                    map.insert(upd_key, serde_yaml::Value::String(now_str));
                    modified = true;
                }

                if modified {
                    let new_yaml = serde_yaml::to_string(&val)?;
                    let new_content = format!("---\n{new_yaml}---\n\n{body}\n");
                    std::fs::write(&candidate, new_content)?;
                }
            }
            return Ok(());
        }
    }

    // No frontmatter found, create a minimal one
    let name = infer_skill_name(dir);
    let new_content = format!(
        "---\nname: {name}\ndescription: ''\nversion: '1.0.0'\nupdated_at: '{now_str}'\n---\n\n{content}\n"
    );
    std::fs::write(&candidate, new_content)?;
    Ok(())
}

/// Skill directory marker files used across the application.
const SKILL_DIR_MARKERS: &[&str] = &["SKILL.md", "skill.md"];

/// Check whether a directory looks like a valid skill directory
/// (contains at least one recognised marker file).
pub fn is_valid_skill_dir(dir: &Path) -> bool {
    dir.is_dir()
        && SKILL_DIR_MARKERS
            .iter()
            .any(|name| has_named_file_exact(dir, name))
}

/// Characters that are invalid in Windows file/directory names.
const WINDOWS_RESERVED: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Reserved Windows device names that cannot be used as file/directory names.
const WINDOWS_RESERVED_BASENAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Sanitize a skill name so it is safe to use as a single directory component
/// on all major platforms (macOS, Linux, Windows).
///
/// Security-focused with cross-platform safety:
/// - Strips path traversal (`../`) via `Path::file_name()`
/// - Rejects bare `.` and `..`
/// - Replaces control characters with `_` (preserves position for near-injectivity)
/// - Replaces Windows-reserved characters (`<>:"/\|?*`) with `_`
/// - Trims leading/trailing whitespace and dots (Windows rejects trailing dots)
///
/// Returns `None` if the result would be empty or unsafe.
pub fn sanitize_skill_name(name: &str) -> Option<String> {
    // Take only the last path component — strips any leading `../` sequences.
    let last = std::path::Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())?;

    // Reject bare `.` and `..` (file_name() returns None for `..` on most
    // platforms, but be explicit for cross-platform safety).
    if last == ".." || last == "." {
        return None;
    }

    // Replace control characters and Windows-reserved characters with `_`.
    // Using replacement instead of removal preserves character positions,
    // making the mapping nearly injective (distinct inputs → distinct outputs).
    let clean: String = last
        .chars()
        .map(|c| {
            if c.is_control() || WINDOWS_RESERVED.contains(&c) {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Trim whitespace and trailing dots (Windows ignores trailing dots/spaces
    // in directory names, which would cause silent mismatches).
    let trimmed = clean.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        None
    } else {
        let reserved = trimmed
            .split('.')
            .next()
            .map(|base| base.to_ascii_uppercase())
            .map(|upper| WINDOWS_RESERVED_BASENAMES.contains(&upper.as_str()))
            .unwrap_or(false);

        if reserved {
            Some(format!("_{}", trimmed))
        } else {
            Some(trimmed.to_string())
        }
    }
}

pub fn infer_skill_name(dir: &Path) -> String {
    let meta = parse_skill_md(dir);
    if let Some(name) = meta.name {
        if let Some(sanitized) = sanitize_skill_name(&name) {
            return sanitized;
        }
    }
    dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown-skill".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    // ── parse_frontmatter ──

    #[test]
    fn parse_frontmatter_full() {
        let content = "---\nname: my-skill\ndescription: A great skill\n---\n# Content";
        let meta = parse_frontmatter(content);
        assert_eq!(meta.name.as_deref(), Some("my-skill"));
        assert_eq!(meta.description.as_deref(), Some("A great skill"));
    }

    #[test]
    fn parse_frontmatter_name_only() {
        let content = "---\nname: test-skill\n---\n";
        let meta = parse_frontmatter(content);
        assert_eq!(meta.name.as_deref(), Some("test-skill"));
        assert_eq!(meta.description, None);
    }

    #[test]
    fn parse_frontmatter_no_frontmatter() {
        let content = "# Just markdown\nNo frontmatter here.";
        let meta = parse_frontmatter(content);
        assert_eq!(meta.name, None);
        assert_eq!(meta.description, None);
    }

    #[test]
    fn parse_frontmatter_empty_string() {
        let meta = parse_frontmatter("");
        assert_eq!(meta.name, None);
    }

    #[test]
    fn parse_frontmatter_invalid_yaml() {
        let content = "---\n: : broken yaml\n---\n";
        let meta = parse_frontmatter(content);
        // Should not panic, just return None
        assert_eq!(meta.name, None);
    }

    #[test]
    fn parse_frontmatter_extra_fields_ignored() {
        let content = "---\nname: foo\nauthor: bar\nversion: 1.0\n---\n";
        let meta = parse_frontmatter(content);
        assert_eq!(meta.name.as_deref(), Some("foo"));
    }

    // ── parse_skill_md (filesystem) ──

    #[test]
    fn parse_skill_md_reads_skill_md() {
        let tmp = tempdir().unwrap();
        fs::write(
            tmp.path().join("SKILL.md"),
            "---\nname: from-skill\ndescription: desc\n---\n",
        )
        .unwrap();

        let meta = parse_skill_md(tmp.path());
        assert_eq!(meta.name.as_deref(), Some("from-skill"));
        assert_eq!(meta.description.as_deref(), Some("desc"));
    }

    #[test]
    fn parse_skill_md_reads_lowercase_skill_md() {
        let tmp = tempdir().unwrap();
        fs::write(
            tmp.path().join("skill.md"),
            "---\nname: from-lowercase\ndescription: desc\n---\n",
        )
        .unwrap();

        let meta = parse_skill_md(tmp.path());
        assert_eq!(meta.name.as_deref(), Some("from-lowercase"));
        assert_eq!(meta.description.as_deref(), Some("desc"));
    }

    #[test]
    fn parse_skill_md_ignores_claude_md() {
        let tmp = tempdir().unwrap();
        fs::write(
            tmp.path().join("CLAUDE.md"),
            "---\nname: from-claude\n---\n",
        )
        .unwrap();

        let meta = parse_skill_md(tmp.path());
        assert_eq!(meta.name, None);
    }

    #[test]
    fn parse_skill_md_prefers_skill_md_when_claude_md_is_present() {
        let tmp = tempdir().unwrap();
        fs::write(tmp.path().join("SKILL.md"), "---\nname: from-skill\n---\n").unwrap();
        fs::write(
            tmp.path().join("CLAUDE.md"),
            "---\nname: from-claude\n---\n",
        )
        .unwrap();

        let meta = parse_skill_md(tmp.path());
        assert_eq!(meta.name.as_deref(), Some("from-skill"));
    }

    #[test]
    fn parse_skill_md_empty_dir() {
        let tmp = tempdir().unwrap();
        let meta = parse_skill_md(tmp.path());
        assert_eq!(meta.name, None);
        assert_eq!(meta.description, None);
    }

    // ── is_valid_skill_dir ──

    #[test]
    fn is_valid_skill_dir_with_skill_md() {
        let tmp = tempdir().unwrap();
        fs::write(tmp.path().join("SKILL.md"), "content").unwrap();
        assert!(is_valid_skill_dir(tmp.path()));
    }

    #[test]
    fn is_valid_skill_dir_accepts_lowercase_skill_md() {
        let tmp = tempdir().unwrap();
        fs::write(tmp.path().join("skill.md"), "content").unwrap();
        assert!(is_valid_skill_dir(tmp.path()));
    }

    #[test]
    fn is_valid_skill_dir_ignores_readme_only_dirs() {
        let tmp = tempdir().unwrap();
        fs::write(tmp.path().join("README.md"), "content").unwrap();
        assert!(!is_valid_skill_dir(tmp.path()));
    }

    #[test]
    fn is_valid_skill_dir_ignores_claude_only_dirs() {
        let tmp = tempdir().unwrap();
        fs::write(tmp.path().join("CLAUDE.md"), "content").unwrap();
        assert!(!is_valid_skill_dir(tmp.path()));
    }

    #[test]
    fn is_valid_skill_dir_empty() {
        let tmp = tempdir().unwrap();
        assert!(!is_valid_skill_dir(tmp.path()));
    }

    #[test]
    fn is_valid_skill_dir_file_not_dir() {
        let tmp = tempdir().unwrap();
        let file = tmp.path().join("not-a-dir");
        fs::write(&file, "content").unwrap();
        assert!(!is_valid_skill_dir(&file));
    }

    // ── sanitize_skill_name ──

    #[test]
    fn sanitize_normal_name() {
        assert_eq!(sanitize_skill_name("my-skill"), Some("my-skill".into()));
    }

    #[test]
    fn sanitize_strips_path_traversal() {
        assert_eq!(
            sanitize_skill_name("../../../../.bashrc"),
            Some(".bashrc".into())
        );
    }

    #[test]
    fn sanitize_rejects_dotdot() {
        assert_eq!(sanitize_skill_name(".."), None);
        assert_eq!(sanitize_skill_name("."), None);
    }

    #[test]
    fn sanitize_preserves_spaces_and_unicode() {
        assert_eq!(
            sanitize_skill_name("my skill (v2)"),
            Some("my skill (v2)".into())
        );
        assert_eq!(sanitize_skill_name("技能-测试"), Some("技能-测试".into()));
    }

    #[test]
    fn sanitize_distinct_inputs_produce_distinct_outputs() {
        // "a b" and "a-b" must NOT collapse to the same name.
        let a = sanitize_skill_name("a b");
        let b = sanitize_skill_name("a-b");
        assert_ne!(a, b);
    }

    #[test]
    fn sanitize_replaces_control_chars_with_underscore() {
        // Replace rather than remove, so "a\x00b" → "a_b" not "ab"
        assert_eq!(sanitize_skill_name("a\x00b\x07c"), Some("a_b_c".into()));
    }

    #[test]
    fn sanitize_replaces_windows_reserved_chars() {
        assert_eq!(
            sanitize_skill_name("foo:bar*baz"),
            Some("foo_bar_baz".into())
        );
        assert_eq!(sanitize_skill_name("a<b>c"), Some("a_b_c".into()));
    }

    #[test]
    fn sanitize_trims_whitespace_and_trailing_dots() {
        assert_eq!(sanitize_skill_name("  foo  "), Some("foo".into()));
        assert_eq!(sanitize_skill_name("bar..."), Some("bar".into()));
    }

    #[test]
    fn sanitize_rejects_empty_after_cleaning() {
        assert_eq!(sanitize_skill_name("   "), None);
        assert_eq!(sanitize_skill_name("..."), None);
    }

    #[test]
    fn sanitize_control_only_input_produces_underscores() {
        // Control chars become `_`, not removed — so result is non-empty.
        assert_eq!(sanitize_skill_name("\x00\x01"), Some("__".into()));
    }

    #[test]
    fn sanitize_avoids_windows_reserved_device_names() {
        assert_eq!(sanitize_skill_name("CON"), Some("_CON".into()));
        assert_eq!(sanitize_skill_name("nul.txt"), Some("_nul.txt".into()));
        assert_eq!(sanitize_skill_name("Com1"), Some("_Com1".into()));
    }

    // ── infer_skill_name ──

    #[test]
    fn infer_skill_name_from_metadata() {
        let tmp = tempdir().unwrap();
        let skill_dir = tmp.path().join("directory-name");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: metadata-name\n---\n",
        )
        .unwrap();

        assert_eq!(infer_skill_name(&skill_dir), "metadata-name");
    }

    #[test]
    fn infer_skill_name_falls_back_to_dirname() {
        let tmp = tempdir().unwrap();
        let skill_dir = tmp.path().join("my-cool-skill");
        fs::create_dir_all(&skill_dir).unwrap();

        assert_eq!(infer_skill_name(&skill_dir), "my-cool-skill");
    }

    // ── bump_version ──

    #[test]
    fn bump_version_basic() {
        assert_eq!(bump_version("1.0.0"), "1.0.1");
        assert_eq!(bump_version("1.0.1"), "1.0.2");
        assert_eq!(bump_version("1.0.98"), "1.0.99");
    }

    #[test]
    fn bump_version_overflow_to_minor() {
        assert_eq!(bump_version("1.0.99"), "1.1.0");
        assert_eq!(bump_version("1.1.99"), "1.2.0");
    }

    #[test]
    fn bump_version_overflow_to_major() {
        assert_eq!(bump_version("1.99.99"), "2.0.0");
        assert_eq!(bump_version("0.99.99"), "1.0.0");
    }

    #[test]
    fn bump_version_with_v_prefix_or_short() {
        assert_eq!(bump_version("v1.0.0"), "1.0.1");
        assert_eq!(bump_version("V1.0.0"), "1.0.1");
        assert_eq!(bump_version("1.0"), "1.0.1");
        assert_eq!(bump_version("invalid"), "1.0.1");
    }

    // ── ensure_skill_frontmatter_metadata ──

    #[test]
    fn ensure_skill_frontmatter_fills_missing() {
        let tmp = tempdir().unwrap();
        let skill_dir = tmp.path().join("test-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: test-skill\ndescription: A test\n---\n\n# Body\n",
        )
        .unwrap();

        ensure_skill_frontmatter_metadata(&skill_dir).unwrap();

        let meta = parse_skill_md(&skill_dir);
        assert_eq!(meta.version.as_deref(), Some("1.0.0"));
        assert!(meta.updated_at.is_some());
    }

    #[test]
    fn ensure_skill_frontmatter_preserves_existing() {
        let tmp = tempdir().unwrap();
        let skill_dir = tmp.path().join("test-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: test-skill\nversion: 2.3.4\nupdated_at: '2026-01-01 00:00:00'\n---\n\n# Body\n",
        )
        .unwrap();

        ensure_skill_frontmatter_metadata(&skill_dir).unwrap();

        let meta = parse_skill_md(&skill_dir);
        assert_eq!(meta.version.as_deref(), Some("2.3.4"));
        assert_eq!(meta.updated_at.as_deref(), Some("2026-01-01 00:00:00"));
    }
}
