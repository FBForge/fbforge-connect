//! Normal window close follows the same checkpoint rules as an updater restart.
use crate::engine::EngineState;
use std::sync::atomic::Ordering;
use tauri::{Manager, State};
#[tauri::command]
pub async fn close_application(
    app: tauri::AppHandle,
    engine: State<'_, EngineState>,
) -> Result<(), &'static str> {
    if crate::test_library_command::busy()
        || engine.updating.load(Ordering::Acquire)
        || engine.process.try_lock().is_err()
        || app
            .state::<crate::message_exports::MessageExports>()
            .active()
            .await
        || app.state::<crate::file_saves::FileSaves>().active()
        || crate::local_scanner::busy(&app)
    {
        return Err("application_activity_pending");
    }
    let profiles: Vec<_> = engine
        .profiles
        .lock()
        .await
        .iter()
        .map(|(id, binding)| (id.clone(), binding.api))
        .collect();
    for (id, api) in profiles {
        crate::profiles::checkpoint(&app, &engine, api, &id).await?;
    }
    let _process = engine
        .process
        .try_lock()
        .map_err(|_| "application_activity_pending")?;
    if app
        .state::<crate::message_exports::MessageExports>()
        .active()
        .await
        || app.state::<crate::file_saves::FileSaves>().active()
        || crate::local_scanner::busy(&app)
    {
        return Err("application_activity_pending");
    }
    engine.updating.store(true, Ordering::Release);
    drop(_process);
    app.exit(0);
    Ok(())
}
