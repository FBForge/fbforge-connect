//! Tauri adapter for the shared native write gate.
use crate::protocol::{ApiVersion, SessionResource};
use crate::write_gate::{Context, Effect};
use crate::{cases, profiles, EngineState};

struct DesktopContext<'a> {
    app: &'a tauri::AppHandle,
    state: &'a EngineState,
    version: ApiVersion,
    id: &'a str,
}
impl Context for DesktopContext<'_> {
    type Error = crate::command_error::CommandError;
    fn environment(&self) -> crate::environments::Environment {
        self.state.environment()
    }
    async fn request(&self, command: serde_json::Value) -> Result<SessionResource, Self::Error> {
        crate::engine::request_detailed(self.app, self.state, command).await
    }
    async fn effect(&self, effect: Effect<'_>) -> Result<(), &'static str> {
        let Self {
            app,
            state,
            version,
            id,
        } = *self;
        match effect {
            Effect::EnsureScanner => {
                crate::malware_scanner::ensure_local_default(app, state, version, id).await
            }
            Effect::ConfirmProduction(action) => {
                crate::environment_commands::confirm_production_action(app, action).await
            }
            Effect::RequireProfile => profiles::require_profile(state, version, id).await,
            Effect::CheckpointProfile => profiles::checkpoint(app, state, version, id).await,
            Effect::CheckpointCases => cases::checkpoint(app, state, version, id).await,
            Effect::ConfirmAttachments(count) => {
                crate::environment_commands::confirm_attachment_review(app, count).await
            }
            Effect::ConfirmSchema => crate::environment_commands::confirm_schema_review(app).await,
            Effect::MarkRunning(attempt) => {
                crate::profile_workspace::mark_running(app, state, version, id, attempt).await
            }
            Effect::Journal(data) => {
                crate::profile_workspace::journal(app, state, version, id, data).await
            }
            Effect::InvalidateEngine => {
                *state.process.lock().await = None;
                Ok(())
            }
            Effect::RecordCaseError(failure) => {
                let mut errors = state.case_errors.lock().await;
                if let Some(code) = failure {
                    errors.insert(id.to_owned(), code);
                } else {
                    errors.remove(id);
                }
                Ok(())
            }
        }
    }
}
pub(crate) async fn resource_action(
    app: &tauri::AppHandle,
    state: &EngineState,
    version: ApiVersion,
    id: &str,
    command: serde_json::Value,
) -> Result<SessionResource, &'static str> {
    resource_action_detailed(app, state, version, id, command)
        .await
        .map_err(|failure| failure.code())
}
pub(crate) async fn resource_action_detailed(
    app: &tauri::AppHandle,
    state: &EngineState,
    version: ApiVersion,
    id: &str,
    command: serde_json::Value,
) -> Result<SessionResource, crate::command_error::CommandError> {
    crate::write_gate::run(
        &DesktopContext {
            app,
            state,
            version,
            id,
        },
        version,
        id,
        command,
    )
    .await
}
