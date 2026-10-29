use std::sync::Arc;
use tauri::State;

use crate::core::{
    create_skill::{create_skill_unlocked, edit_skill_unlocked, CreatedSkill},
    error::AppError,
    file_manager,
    repo_lock::RepoLock,
    skill_store::SkillStore,
};

#[tauri::command]
pub async fn create_skill(
    name: String,
    description: String,
    body: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<CreatedSkill, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = RepoLock::acquire_foreground("create skill").map_err(AppError::db)?;
        create_skill_unlocked(&store, &name, &description, &body).map_err(|error| {
            let message = format!("{error:#}");
            if [
                "INVALID_SKILL_NAME",
                "EMPTY_DESCRIPTION",
                "EMPTY_BODY",
                "BODY_FRONTMATTER",
                "SKILL_EXISTS:",
            ]
            .iter()
            .any(|code| message.starts_with(code))
            {
                AppError::invalid_input(message)
            } else {
                AppError::io(message)
            }
        })
    })
    .await?
}

#[tauri::command]
pub async fn edit_skill(
    skill_id: String,
    name: Option<String>,
    description: String,
    body: String,
    version: Option<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<CreatedSkill, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = RepoLock::acquire_foreground("edit skill").map_err(AppError::db)?;
        edit_skill_unlocked(
            &store,
            &skill_id,
            name.as_deref(),
            &description,
            &body,
            version.as_deref(),
        )
        .map_err(|error| {
            let message = format!("{error:#}");
            if [
                "SKILL_NOT_FOUND",
                "INVALID_SKILL_NAME",
                "EMPTY_DESCRIPTION",
                "EMPTY_BODY",
                "BODY_FRONTMATTER",
                "SKILL_EXISTS:",
            ]
            .iter()
            .any(|code| message.starts_with(code))
            {
                AppError::invalid_input(message)
            } else {
                AppError::io(message)
            }
        })
    })
    .await?
}

#[tauri::command]
pub async fn reveal_skill_folder(
    skill_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        let path = std::path::PathBuf::from(&skill.central_path);
        if !path.exists() {
            return Err(AppError::not_found("Skill folder does not exist"));
        }

        let status = file_manager::reveal_item(&path).map_err(AppError::io)?;
        if file_manager::exit_is_failure(status.success()) {
            return Err(AppError::io(format!(
                "File manager exited with status: {status}"
            )));
        }
        Ok(())
    })
    .await?
}
