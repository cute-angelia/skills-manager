use std::sync::Arc;
use tauri::State;

use crate::core::{
    create_skill::{create_skill_unlocked, CreatedSkill},
    error::AppError,
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
