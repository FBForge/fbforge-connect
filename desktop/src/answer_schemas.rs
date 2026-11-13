use crate::{
    answer_schema_model::{self, AnswerSchema},
    profiles,
    protocol::{valid_session_id, ApiVersion},
    EngineState,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;
#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    List {},
    Read {
        uri: String,
    },
    Save {
        entry: AnswerSchema,
        expected_revision: Option<String>,
    },
    Delete {
        uri: String,
        expected_revision: String,
    },
}
#[tauri::command]
pub async fn profile_answer_schemas(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    api_version: ApiVersion,
    session_id: String,
    action: Action,
) -> Result<Value, &'static str> {
    if !valid_session_id(&session_id) {
        return Err("invalid_input");
    }
    let _guard = crate::profile_workspace::WORKSPACE_LOCK.lock().await;
    let bindings = state.profiles.lock().await;
    let Some(binding) = bindings.get(&session_id) else {
        return match action {
            Action::List {} => Ok(json!([])),
            Action::Read { .. } => Ok(Value::Null),
            _ => Err("vault_profile_required"),
        };
    };
    if binding.api != api_version || binding.error.is_some() {
        return Err("vault_pending");
    }
    let store = profiles::vault(&app)?;
    let mut profile = store.load(&binding.profile_id)?;
    if profile.environment != state.environment() || profile.api_version != api_version {
        return Err("environment_mismatch");
    }
    match action {
        Action::List {} => {
            return Ok(json!(profile
                .answer_schemas
                .iter()
                .map(AnswerSchema::summary)
                .collect::<Vec<_>>()))
        }
        Action::Read { uri } => {
            return Ok(profile
                .answer_schemas
                .iter()
                .find(|s| s.uri == uri)
                .map_or(Value::Null, |s| json!(s)))
        }
        Action::Save {
            entry,
            expected_revision,
        } => {
            answer_schema_model::save(
                &mut profile.answer_schemas,
                entry,
                expected_revision.as_deref(),
            )?;
        }
        Action::Delete {
            uri,
            expected_revision,
        } => {
            if !profile
                .answer_schemas
                .iter()
                .any(|s| s.uri == uri && s.revision == expected_revision)
            {
                return Err("schema_library_conflict");
            }
            profile.answer_schemas.retain(|s| s.uri != uri);
        }
    }
    store.save(&profile)?;
    Ok(json!(profile
        .answer_schemas
        .iter()
        .map(AnswerSchema::summary)
        .collect::<Vec<_>>()))
}
