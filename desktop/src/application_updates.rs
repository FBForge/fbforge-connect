//! Native-owned update identity, verified bytes and explicit installation permission.
use crate::update_state::{Pending, Status as UpdateStatus};
use crate::{update_policy as policy, update_transport, EngineState};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

pub const PUBLIC_KEY: &str = include_str!("../update-public-key.txt");

#[tauri::command]
pub async fn open_update_download() -> Result<(), &'static str> {
    tokio::task::spawn_blocking(|| {
        crate::documentation::launch("https://github.com/FBForge/fbforge-connect/releases/latest")
    })
    .await
    .map_err(|_| "update_unavailable")?
}

pub struct ApplicationUpdates {
    pending: Mutex<Pending<Update>>,
    cancel: AtomicBool,
}
impl Default for ApplicationUpdates {
    fn default() -> Self {
        Self {
            pending: Mutex::new(Pending::new(
                policy::public_key(PUBLIC_KEY).is_ok(),
                cfg!(all(windows, target_arch = "x86_64")),
            )),
            cancel: AtomicBool::new(false),
        }
    }
}
impl ApplicationUpdates {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Pending<Update>>, &'static str> {
        self.pending.lock().map_err(|_| "update_unavailable")
    }
}

#[tauri::command]
pub fn application_update_status(
    updates: State<'_, ApplicationUpdates>,
) -> Result<UpdateStatus, &'static str> {
    Ok(updates.lock()?.status.clone())
}

#[tauri::command]
pub async fn check_application_update(
    app: tauri::AppHandle,
    updates: State<'_, ApplicationUpdates>,
) -> Result<UpdateStatus, &'static str> {
    updates.lock()?.begin_check()?;
    let result = async {
        let raw = update_transport::manifest().await?;
        if !policy::manifest(&raw, &app.package_info().version.to_string())? {
            return Ok(None);
        }
        app.updater_builder()
            .target("windows-x86_64")
            .pubkey(PUBLIC_KEY.trim())
            .timeout(Duration::from_secs(600))
            .version_comparator(|current, release| {
                release.version.pre.is_empty() && release.version > current
            })
            .build()
            .map_err(|_| "update_manifest_invalid")?
            .restore_update(raw)
            .map_err(|_| "update_manifest_invalid")
    }
    .await;
    updates.lock()?.checked(result.map(|release| {
        release.map(|release| {
            let version = release.version.clone();
            let notes = release.body.clone().unwrap_or_default();
            (release, version, notes)
        })
    }))
}

#[tauri::command]
pub async fn download_application_update(
    updates: State<'_, ApplicationUpdates>,
    version: String,
) -> Result<UpdateStatus, &'static str> {
    let release = updates.lock()?.begin_download(&version)?;
    updates.cancel.store(false, Ordering::Release);
    let result = async {
        let bytes = update_transport::package(
            release.download_url.as_str(),
            &updates.cancel,
            |done, total| {
                if let Ok(mut pending) = updates.lock() {
                    pending.status.downloaded = done;
                    pending.status.total = total;
                }
            },
        )
        .await?;
        if updates.cancel.load(Ordering::Acquire) {
            return Err("update_cancelled");
        }
        policy::verify(&bytes, &release.signature, PUBLIC_KEY, &version)?;
        release
            .verify(&bytes)
            .map_err(|_| "update_signature_invalid")?;
        if updates.cancel.load(Ordering::Acquire) {
            return Err("update_cancelled");
        }
        Ok(bytes)
    }
    .await;
    updates.lock()?.downloaded(result)
}

#[tauri::command]
pub fn cancel_application_update(updates: State<'_, ApplicationUpdates>) {
    updates.cancel.store(true, Ordering::Release);
}

async fn confirm_install(app: &tauri::AppHandle, version: &str) -> Result<bool, &'static str> {
    let window = app.get_webview_window("main").ok_or("update_unavailable")?;
    let app = app.clone();
    let version = version.to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().message(format!("FBForge Connect {version} wurde heruntergeladen und seine Signatur geprüft.\n\nSpeichern oder exportieren Sie offene Entwürfe und nur für diese Sitzung geladene Schlüssel vor dem Update. Nicht gespeicherte Inhalte dieser Sitzung gehen beim Beenden verloren. Gespeicherte Profile und Vorgänge bleiben erhalten.\n\nJetzt die Anwendung beenden und den Installer starten?"))
            .parent(&window).title("Update installieren?").kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Installieren und neu starten".into(), "Zurück zur Anwendung".into()))
            .blocking_show()
    }).await.map_err(|_| "update_unavailable")
}

#[tauri::command]
pub async fn install_application_update(
    app: tauri::AppHandle,
    engine: State<'_, EngineState>,
    updates: State<'_, ApplicationUpdates>,
    exports: State<'_, crate::message_exports::MessageExports>,
    version: String,
) -> Result<UpdateStatus, &'static str> {
    let release = updates.lock()?.begin_install(&version)?;
    let result = async {
        crate::update_install::prepare(
            &InstallContext {
                app: &app,
                engine: &engine,
                exports: &exports,
            },
            &version,
        )
        .await?;
        let mut process = engine
            .process
            .try_lock()
            .map_err(|_| "update_activity_pending")?;
        if exports.active().await
            || crate::local_scanner::busy(&app)
            || app.state::<crate::file_saves::FileSaves>().active()
        {
            return Err("update_activity_pending");
        }
        engine.updating.store(true, Ordering::Release);
        if let Some(child) = process.take() {
            let shutdown = child.shutdown().await;
            // The process is gone even on shutdown failure. Stale checkpoint bindings
            // would otherwise prevent reconnecting after an installer launch failure.
            engine.forget_closed_sessions().await;
            shutdown.map_err(|_| "update_engine_shutdown_failed")?;
        }
        let bytes = updates.lock()?.take_install_bytes()?;
        // Windows' official updater starts NSIS /UPDATE and exits after successful launch.
        // A failed launch keeps the application open; its sessions must be reconnected.
        let result = tokio::task::spawn_blocking(move || release.install(bytes))
            .await
            .map_err(|_| "update_install_failed")?;
        result.map_err(|_| "update_install_failed")
    }
    .await;
    engine.updating.store(false, Ordering::Release);
    updates.lock()?.installed(result)
}

struct InstallContext<'a> {
    app: &'a tauri::AppHandle,
    engine: &'a EngineState,
    exports: &'a crate::message_exports::MessageExports,
}
impl crate::update_install::Context for InstallContext<'_> {
    async fn idle(&self) -> bool {
        self.engine.process.try_lock().is_ok()
            && !self.exports.active().await
            && !crate::local_scanner::busy(self.app)
            && !self.app.state::<crate::file_saves::FileSaves>().active()
    }
    async fn confirm(&self, version: &str) -> Result<bool, &'static str> {
        confirm_install(self.app, version).await
    }
    async fn checkpoint(&self) -> Result<(), &'static str> {
        let Self { app, engine, .. } = *self;
        let profiles: Vec<_> = engine
            .profiles
            .lock()
            .await
            .iter()
            .map(|(id, binding)| (id.clone(), binding.api))
            .collect();
        for (id, api) in profiles {
            crate::profiles::checkpoint(app, engine, api, &id).await?;
        }
        Ok(())
    }
}
