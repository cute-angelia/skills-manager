use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::fs;

use super::{
    central_repo, content_hash, skill_metadata,
    skill_store::{SkillRecord, SkillStore},
    sync_metadata,
};

#[derive(Debug, Serialize)]
pub struct CreatedSkill {
    pub skill_id: String,
    pub name: String,
}

/// The caller holds the foreground repository lock.
pub fn create_skill_unlocked(
    store: &SkillStore,
    name: &str,
    description: &str,
    body: &str,
) -> Result<CreatedSkill> {
    let name = name.trim();
    let description = description.trim();
    let body = body.trim();
    let reserved = matches!(name, "con" | "prn" | "aux" | "nul")
        || (name.len() == 4
            && (name.starts_with("com") || name.starts_with("lpt"))
            && matches!(name.as_bytes()[3], b'1'..=b'9'));
    if name.is_empty()
        || name.len() > 64
        || reserved
        || !name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        || !name.as_bytes()[0].is_ascii_alphanumeric()
        || !name.as_bytes()[name.len() - 1].is_ascii_alphanumeric()
    {
        bail!("INVALID_SKILL_NAME");
    }
    if description.is_empty() {
        bail!("EMPTY_DESCRIPTION");
    }
    if body.is_empty() {
        bail!("EMPTY_BODY");
    }
    if body
        .lines()
        .next()
        .is_some_and(|line| line.trim_end() == "---")
    {
        bail!("BODY_FRONTMATTER");
    }
    let dir = central_repo::skills_dir().join(name);
    if store.get_all_skills()?.iter().any(|skill| {
        skill.name.eq_ignore_ascii_case(name) || skill.central_path == dir.to_string_lossy()
    }) {
        bail!("SKILL_EXISTS: {name}");
    }
    // create_dir, not create_dir_all: existing files and dangling symlinks are
    // collisions too, and nothing already at this destination belongs to us.
    fs::create_dir(&dir).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            anyhow::anyhow!("SKILL_EXISTS: {name}")
        } else {
            error.into()
        }
    })?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut inserted = false;
    let outcome = (|| -> Result<()> {
        #[derive(Serialize)]
        struct Frontmatter<'a> {
            name: &'a str,
            description: &'a str,
            version: &'a str,
            updated_at: &'a str,
        }
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let yaml = serde_yaml::to_string(&Frontmatter {
            name,
            description,
            version: "1.0.0",
            updated_at: &now_str,
        })?;
        fs::write(dir.join("SKILL.md"), format!("---\n{yaml}---\n\n{body}\n"))?;
        let now = chrono::Utc::now().timestamp_millis();
        let record = SkillRecord {
            id: id.clone(),
            name: name.to_string(),
            description: Some(description.to_string()),
            source_type: "local".to_string(),
            source_ref: None,
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            remote_revision: None,
            central_path: dir.to_string_lossy().into_owned(),
            content_hash: Some(content_hash::hash_directory(&dir)?),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        };
        store.insert_skill(&record)?;
        inserted = true;
        sync_metadata::ensure_skill_metadata_unlocked(store, &id)?;
        Ok(())
    })();
    if let Err(error) = outcome {
        // Stop on a failed rollback rather than deleting files still referenced
        // by a database record. Only this creation's UUID/directory are touched.
        if inserted {
            store.delete_skill(&id).with_context(|| {
                format!("Creation failed ({error:#}); could not roll back record {id}")
            })?;
        }
        let meta = sync_metadata::metadata_dir()
            .join("skills")
            .join(format!("{id}.json"));
        if meta.symlink_metadata().is_ok() {
            fs::remove_file(&meta).with_context(|| {
                format!(
                    "Creation failed ({error:#}); could not remove {}",
                    meta.display()
                )
            })?;
        }
        // The shared metadata writer can fail after creating its atomic-write
        // temporary file. Remove only temporaries bearing this new UUID.
        if let Ok(entries) = fs::read_dir(sync_metadata::metadata_dir().join("skills")) {
            let prefix = format!("{id}.json.tmp.");
            for entry in entries {
                let entry = entry?;
                if entry.file_name().to_string_lossy().starts_with(&prefix) {
                    fs::remove_file(entry.path()).with_context(|| {
                        format!(
                            "Creation failed ({error:#}); could not remove temporary metadata {}",
                            entry.path().display()
                        )
                    })?;
                }
            }
        }
        fs::remove_dir_all(&dir).with_context(|| {
            format!(
                "Creation failed ({error:#}); could not remove {}",
                dir.display()
            )
        })?;
        return Err(error);
    }
    Ok(CreatedSkill {
        skill_id: id,
        name: name.to_string(),
    })
}

/// Edit an existing skill's name, description, and Markdown instructions.
/// The caller holds the foreground repository lock.
pub fn edit_skill_unlocked(
    store: &SkillStore,
    skill_id: &str,
    new_name: Option<&str>,
    description: &str,
    body: &str,
    version: Option<&str>,
) -> Result<CreatedSkill> {
    let skill = store
        .get_skill_by_id(skill_id)?
        .ok_or_else(|| anyhow::anyhow!("SKILL_NOT_FOUND"))?;

    let description = description.trim();
    let body = body.trim();

    if description.is_empty() {
        bail!("EMPTY_DESCRIPTION");
    }
    if body.is_empty() {
        bail!("EMPTY_BODY");
    }
    if body
        .lines()
        .next()
        .is_some_and(|line| line.trim_end() == "---")
    {
        bail!("BODY_FRONTMATTER");
    }

    let target_name = match new_name {
        Some(n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => skill.name.clone(),
    };

    let name_changed = target_name != skill.name;
    let old_dir = std::path::PathBuf::from(&skill.central_path);
    let existing_meta = skill_metadata::parse_skill_md(&old_dir);

    let target_version = match version {
        Some(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => {
            let current_ver = existing_meta.version.as_deref().unwrap_or("1.0.0");
            skill_metadata::bump_version(current_ver)
        }
    };
    let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let new_dir = if name_changed {
        let reserved = matches!(target_name.as_str(), "con" | "prn" | "aux" | "nul")
            || (target_name.len() == 4
                && (target_name.starts_with("com") || target_name.starts_with("lpt"))
                && matches!(target_name.as_bytes()[3], b'1'..=b'9'));
        if target_name.is_empty()
            || target_name.len() > 64
            || reserved
            || !target_name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            || !target_name.as_bytes()[0].is_ascii_alphanumeric()
            || !target_name.as_bytes()[target_name.len() - 1].is_ascii_alphanumeric()
        {
            bail!("INVALID_SKILL_NAME");
        }

        let dir = central_repo::skills_dir().join(&target_name);
        if store.get_all_skills()?.iter().any(|s| {
            s.id != skill_id
                && (s.name.eq_ignore_ascii_case(&target_name)
                    || s.central_path == dir.to_string_lossy())
        }) {
            bail!("SKILL_EXISTS: {target_name}");
        }

        if old_dir.exists() && old_dir != dir {
            fs::rename(&old_dir, &dir)?;
        }
        dir
    } else {
        old_dir
    };

    #[derive(Serialize)]
    struct Frontmatter<'a> {
        name: &'a str,
        description: &'a str,
        version: &'a str,
        updated_at: &'a str,
    }
    let yaml = serde_yaml::to_string(&Frontmatter {
        name: &target_name,
        description,
        version: &target_version,
        updated_at: &now_str,
    })?;
    fs::create_dir_all(&new_dir)?;
    fs::write(new_dir.join("SKILL.md"), format!("---\n{yaml}---\n\n{body}\n"))?;

    let now = chrono::Utc::now().timestamp_millis();
    let new_hash = content_hash::hash_directory(&new_dir)?;

    let mut record = skill;
    record.name = target_name.to_string();
    record.description = Some(description.to_string());
    record.central_path = new_dir.to_string_lossy().into_owned();
    record.content_hash = Some(new_hash);
    record.updated_at = now;

    store.upsert_skill(&record)?;
    sync_metadata::ensure_skill_metadata_unlocked(store, skill_id)?;

    Ok(CreatedSkill {
        skill_id: skill_id.to_string(),
        name: target_name.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{central_repo, content_hash};
    use std::fs;

    struct Library {
        _lock: std::sync::MutexGuard<'static, ()>,
        _temp: tempfile::TempDir,
        store: SkillStore,
    }

    impl Library {
        fn new() -> Self {
            let lock = central_repo::test_base_dir_lock();
            let temp = tempfile::tempdir().unwrap();
            central_repo::set_test_base_dir_override(Some(temp.path().to_path_buf()));
            fs::create_dir_all(central_repo::skills_dir()).unwrap();
            let store = SkillStore::new(&temp.path().join("test.db")).unwrap();
            Self {
                _lock: lock,
                _temp: temp,
                store,
            }
        }
    }

    impl Drop for Library {
        fn drop(&mut self) {
            central_repo::set_test_base_dir_override(None);
        }
    }

    #[test]
    fn creates_valid_yaml_and_local_only_record_without_deployment() {
        let lib = Library::new();
        let description = "会议: \"总结\"\n包含下一步";
        let created = create_skill_unlocked(
            &lib.store,
            "meeting-summary",
            description,
            "# Steps\n\n- Read notes",
        )
        .unwrap();
        let dir = central_repo::skills_dir().join("meeting-summary");
        let doc = fs::read_to_string(dir.join("SKILL.md")).unwrap();
        let (_, rest) = doc.split_once("---\n").unwrap();
        let (yaml, body) = rest.split_once("\n---\n").unwrap();
        let meta: serde_yaml::Value = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(meta["name"].as_str(), Some("meeting-summary"));
        assert_eq!(meta["description"].as_str(), Some(description));
        assert_eq!(body.trim(), "# Steps\n\n- Read notes");
        let record = lib
            .store
            .get_skill_by_id(&created.skill_id)
            .unwrap()
            .unwrap();
        assert_eq!(record.source_type, "local");
        assert!(record.source_ref.is_none());
        assert_eq!(record.update_status, "local_only");
        assert_eq!(
            record.content_hash,
            Some(content_hash::hash_directory(&dir).unwrap())
        );
        assert!(lib.store.get_all_targets().unwrap().is_empty());
        let meta_path = central_repo::skills_dir()
            .join(".skills-manager/skills")
            .join(format!("{}.json", created.skill_id));
        assert!(meta_path.is_file());
        assert!(!central_repo::skills_dir()
            .join(".skills-manager/scenario-skills")
            .exists());
    }

    #[test]
    fn rejects_invalid_names_empty_inputs_and_nested_frontmatter() {
        let lib = Library::new();
        for name in [
            "",
            "../escape",
            "Upper",
            "a/b",
            "a\\b",
            "-name",
            "name-",
            ".",
            "名",
            "has space",
            "con",
            "nul",
            "com1",
        ] {
            assert!(
                create_skill_unlocked(&lib.store, name, "Description", "Body").is_err(),
                "accepted {name}"
            );
        }
        assert!(create_skill_unlocked(&lib.store, &"a".repeat(65), "Description", "Body").is_err());
        for (description, body) in [
            (" ", "Body"),
            ("Description", "\n "),
            ("Description", "---\nname: nested\n---\nBody"),
            ("Description", "---\r\nname: nested"),
        ] {
            assert!(create_skill_unlocked(&lib.store, "valid", description, body).is_err());
        }
        assert!(lib.store.get_all_skills().unwrap().is_empty());
        assert_eq!(fs::read_dir(central_repo::skills_dir()).unwrap().count(), 0);
    }

    #[test]
    fn refuses_existing_directory_and_record_without_overwriting() {
        let lib = Library::new();
        let dir = central_repo::skills_dir().join("taken");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("keep.txt"), "original").unwrap();
        let err = create_skill_unlocked(&lib.store, "taken", "Description", "Body").unwrap_err();
        assert!(err.to_string().contains("SKILL_EXISTS"));
        assert_eq!(
            fs::read_to_string(dir.join("keep.txt")).unwrap(),
            "original"
        );
        let created =
            create_skill_unlocked(&lib.store, "registered", "Description", "Body").unwrap();
        fs::rename(
            central_repo::skills_dir().join("registered"),
            central_repo::skills_dir().join("moved"),
        )
        .unwrap();
        assert!(
            create_skill_unlocked(&lib.store, "registered", "New", "Changed")
                .unwrap_err()
                .to_string()
                .contains("SKILL_EXISTS")
        );
        assert!(lib
            .store
            .get_skill_by_id(&created.skill_id)
            .unwrap()
            .is_some());
    }

    #[test]
    fn refuses_existing_file_and_accepts_boundary_length_names() {
        let lib = Library::new();
        let path = central_repo::skills_dir().join("taken-file");
        fs::write(&path, "keep").unwrap();
        assert!(
            create_skill_unlocked(&lib.store, "taken-file", "Description", "Body")
                .unwrap_err()
                .to_string()
                .contains("SKILL_EXISTS")
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "keep");
        create_skill_unlocked(&lib.store, "a", "Description", "Body").unwrap();
        create_skill_unlocked(&lib.store, &"b".repeat(64), "Description", "Body").unwrap();
    }

    #[test]
    fn metadata_failure_cleans_up_only_the_new_skill() {
        let lib = Library::new();
        let existing = create_skill_unlocked(&lib.store, "existing", "Keep", "Original").unwrap();
        let metadata = central_repo::skills_dir().join(".skills-manager/skills");
        fs::rename(&metadata, metadata.with_extension("saved")).unwrap();
        fs::write(&metadata, "blocked").unwrap();
        assert!(create_skill_unlocked(&lib.store, "failed", "Description", "Body").is_err());
        assert!(!central_repo::skills_dir().join("failed").exists());
        assert_eq!(lib.store.get_all_skills().unwrap().len(), 1);
        assert!(lib
            .store
            .get_skill_by_id(&existing.skill_id)
            .unwrap()
            .is_some());
        assert_eq!(fs::read_to_string(metadata).unwrap(), "blocked");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_dangling_symlink_destinations() {
        let lib = Library::new();
        let target = lib._temp.path().join("nonexistent");
        let destination = central_repo::skills_dir().join("linked");
        std::os::unix::fs::symlink(&target, &destination).unwrap();
        assert!(
            create_skill_unlocked(&lib.store, "linked", "Description", "Body")
                .unwrap_err()
                .to_string()
                .contains("SKILL_EXISTS")
        );
        assert_eq!(fs::read_link(destination).unwrap(), target);
        assert!(!target.exists());
    }

    #[test]
    fn edits_skill_content_and_updates_hash_and_metadata() {
        let lib = Library::new();
        let created = create_skill_unlocked(
            &lib.store,
            "orig-skill",
            "Old description",
            "# Old body",
        )
        .unwrap();

        let updated = edit_skill_unlocked(
            &lib.store,
            &created.skill_id,
            None,
            "New description",
            "# New body\n\n- Updated instruction",
            None,
        )
        .unwrap();

        assert_eq!(updated.name, "orig-skill");
        let skill = lib.store.get_skill_by_id(&created.skill_id).unwrap().unwrap();
        assert_eq!(skill.description.as_deref(), Some("New description"));
        let md = fs::read_to_string(central_repo::skills_dir().join("orig-skill/SKILL.md")).unwrap();
        assert!(md.contains("description: New description"));
        assert!(md.contains("version: 1.0.1"));
        assert!(md.contains("updated_at:"));
        assert!(md.contains("# New body"));
    }

    #[test]
    fn edits_skill_name_renames_directory_and_accepts_custom_version() {
        let lib = Library::new();
        let created = create_skill_unlocked(
            &lib.store,
            "before-rename",
            "Desc",
            "# Body",
        )
        .unwrap();

        let updated = edit_skill_unlocked(
            &lib.store,
            &created.skill_id,
            Some("after-rename"),
            "Updated Desc",
            "# Updated Body",
            Some("2.0.0"),
        )
        .unwrap();

        assert_eq!(updated.name, "after-rename");
        assert!(!central_repo::skills_dir().join("before-rename").exists());
        assert!(central_repo::skills_dir().join("after-rename").exists());
        let skill = lib.store.get_skill_by_id(&created.skill_id).unwrap().unwrap();
        assert_eq!(skill.name, "after-rename");
        let md = fs::read_to_string(central_repo::skills_dir().join("after-rename/SKILL.md")).unwrap();
        assert!(md.contains("version: 2.0.0"));
    }
}
