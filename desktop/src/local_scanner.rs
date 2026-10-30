//! Narrow native component commands. Dialogs own all import paths; downloads use compiled URLs.
use crate::{
    scanner_package as package,
    scanner_runtime::{Runtime, Status},
};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Default)]
pub struct LocalScanner {
    runtime: Mutex<Option<Runtime>>,
    cached: Mutex<Option<Status>>,
    operation: Mutex<String>,
    error: Mutex<Option<String>>,
    busy: AtomicBool,
    cancel: std::sync::Arc<AtomicBool>,
    downloaded: AtomicU64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    #[serde(flatten)]
    status: Status,
    busy: bool,
    operation: String,
    error: Option<String>,
    downloaded_bytes: u64,
    download_total_bytes: u64,
}
fn view(state: &LocalScanner) -> Result<View, &'static str> {
    // A crashed daemon must not remain "ready" until the next configuration command.
    if let Ok(mut slot) = state.runtime.try_lock() {
        if let Some(runtime) = slot.as_mut() {
            if let Ok(mut cache) = state.cached.lock() {
                *cache = Some(runtime.status());
            }
        }
    }
    let cached = state.cached.lock().map_err(|_| "scanner_busy")?.clone();
    Ok(View {
        status: cached.unwrap_or(Status {
            installed: false,
            ready: false,
            enabled: false,
            automatic_updates: false,
            engine_version: package::component()?.version,
            database_version: None,
            database_created_at: None,
            database_age_days: None,
            last_update: None,
            update_failed: false,
        }),
        busy: state.busy.load(Ordering::SeqCst),
        operation: state.operation.lock().map_err(|_| "scanner_busy")?.clone(),
        error: state.error.lock().map_err(|_| "scanner_busy")?.clone(),
        downloaded_bytes: state.downloaded.load(Ordering::SeqCst),
        download_total_bytes: package::component()?.archive.bytes,
    })
}
fn phase(state: &LocalScanner, value: &str) {
    if let Ok(mut operation) = state.operation.lock() {
        *operation = value.into();
    }
}
async fn perform<T: Send + 'static>(
    app: tauri::AppHandle,
    label: &'static str,
    action: impl FnOnce(&tauri::AppHandle, &LocalScanner, &mut Runtime) -> Result<T, &'static str>
        + Send
        + 'static,
) -> Result<T, &'static str> {
    let state = app.state::<LocalScanner>();
    if state
        .busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("scanner_busy");
    }
    state.cancel.store(false, Ordering::SeqCst);
    state.downloaded.store(0, Ordering::SeqCst);
    phase(&state, label);
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<LocalScanner>();
        let mut slot = state.runtime.lock().map_err(|_| "scanner_busy")?;
        if slot.is_none() {
            let root = handle
                .path()
                .app_local_data_dir()
                .map_err(|_| "scanner_install_failed")?
                .join("scanner");
            let mut runtime = Runtime::open(root)?;
            runtime.cancel = state.cancel.clone();
            *slot = Some(runtime);
        }
        let runtime = slot.as_mut().ok_or("scanner_install_failed")?;
        let result = action(&handle, &state, runtime);
        if let Ok(mut cache) = state.cached.lock() {
            *cache = Some(runtime.status());
        }
        result
    })
    .await
    .map_err(|_| "scanner_install_failed")
    .and_then(|result| result);
    if let Ok(mut error) = state.error.lock() {
        *error = result.as_ref().err().map(|code| (*code).into());
    }
    phase(&state, "");
    state.busy.store(false, Ordering::SeqCst);
    result
}

pub async fn initialize(app: tauri::AppHandle) -> Result<(), &'static str> {
    perform(app, "initializing", |app, state, runtime| {
        let resource = app
            .path()
            .resource_dir()
            .map_err(|_| "scanner_install_failed")?
            .join("resources/scanner");
        runtime.adopt_bundled(&resource)?;
        if runtime
            .preferences
            .automatic_update_due(crate::scanner_runtime::now())
        {
            phase(state, "updating-database");
            let _ = runtime.refresh();
        }
        if runtime.preferences.enabled {
            phase(state, "starting");
            runtime.start()?;
        }
        Ok(())
    })
    .await
}
pub async fn enable(app: tauri::AppHandle) -> Result<u16, &'static str> {
    perform(app, "starting", |_, _, runtime| {
        runtime.enable(true)?.ok_or("scanner_start_failed")
    })
    .await
}

pub fn busy(app: &tauri::AppHandle) -> bool {
    app.state::<LocalScanner>().busy.load(Ordering::SeqCst)
}
pub fn enabled(app: &tauri::AppHandle) -> Result<bool, &'static str> {
    let state = app.state::<LocalScanner>();
    if state.busy.load(Ordering::SeqCst) {
        return Err("scanner_busy");
    }
    let cached = state.cached.lock().map_err(|_| "scanner_busy")?;
    cached
        .as_ref()
        .map(|value| value.enabled)
        .ok_or("scanner_configuration_invalid")
}

pub async fn disable(app: tauri::AppHandle) -> Result<(), &'static str> {
    perform(app, "stopping", |_, _, runtime| {
        runtime.enable(false)?;
        Ok(())
    })
    .await
}
pub fn owns_endpoint(app: &tauri::AppHandle, port: u16) -> bool {
    app.state::<LocalScanner>()
        .runtime
        .try_lock()
        .ok()
        .and_then(|mut slot| {
            slot.as_mut().map(|runtime| {
                runtime.status().ready
                    && runtime.preferences.enabled
                    && runtime.endpoint() == Some(port)
            })
        })
        .unwrap_or(false)
}
pub fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<LocalScanner>();
    state.cancel.store(true, Ordering::SeqCst);
    if let Ok(mut slot) = state.runtime.try_lock() {
        if let Some(runtime) = slot.as_mut() {
            runtime.stop();
        }
    };
}

#[tauri::command]
pub fn local_scanner_status(state: State<'_, LocalScanner>) -> Result<View, &'static str> {
    view(&state)
}
#[tauri::command]
pub fn cancel_local_scanner_operation(state: State<'_, LocalScanner>) {
    state.cancel.store(true, Ordering::SeqCst);
}
async fn approve(
    app: &tauri::AppHandle,
    notice: crate::scanner_consent::Confirmation,
) -> Result<(), &'static str> {
    let window = app
        .get_webview_window("main")
        .ok_or("resource_unavailable")?;
    let app = app.clone();
    let accepted = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(notice.message)
            .parent(&window)
            .title(notice.title)
            .kind(if notice.warning {
                MessageDialogKind::Warning
            } else {
                MessageDialogKind::Info
            })
            .buttons(MessageDialogButtons::OkCancelCustom(
                notice.button.into(),
                "Abbrechen".into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|_| "scanner_install_failed")?;
    if accepted {
        Ok(())
    } else {
        Err("content_cancelled")
    }
}
async fn pick_files(
    app: &tauri::AppHandle,
    title: &str,
    database: bool,
) -> Result<Vec<PathBuf>, &'static str> {
    let window = app
        .get_webview_window("main")
        .ok_or("resource_unavailable")?;
    let (app, title) = (app.clone(), title.to_string());
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file().set_parent(&window).set_title(title);
        let files = if database {
            dialog
                .add_filter("ClamAV-Datenbanken und Signaturen", &["cvd", "sign"])
                .blocking_pick_files()
        } else {
            dialog
                .add_filter("ClamAV-Komponentenpaket", &["zip"])
                .blocking_pick_file()
                .map(|file| vec![file])
        };
        files
            .ok_or("content_cancelled")?
            .into_iter()
            .map(|file| file.into_path().map_err(|_| "scanner_package_invalid"))
            .collect()
    })
    .await
    .map_err(|_| "scanner_install_failed")?
}

#[tauri::command]
pub async fn install_local_scanner(
    app: tauri::AppHandle,
    online: bool,
) -> Result<View, &'static str> {
    #[cfg(not(windows))]
    {
        let _ = online;
        return Err("scanner_unsupported");
    }
    #[cfg(windows)]
    {
        let paths = if online {
            approve(&app, crate::scanner_consent::download()).await?;
            vec![]
        } else {
            pick_files(&app, "Geprüftes ClamAV-Komponentenpaket auswählen", false).await?
        };
        perform(app.clone(), "installing", move |_, state, runtime| {
            if !online {
                return runtime.install_offline(&paths[0]);
            }
            let archive = runtime.root.join("engine-download.zip");
            let stage = runtime
                .root
                .join(format!("online-{}", crate::scanner_runtime::now()));
            let result = (|| {
                phase(state, "downloading");
                tauri::async_runtime::block_on(download_engine(&archive, state))?;
                package::unpack_upstream(&archive, &stage)?;
                phase(state, "updating-database");
                runtime.populate_stage(&stage)?;
                runtime.commit(stage.clone())
            })();
            let _ = std::fs::remove_file(archive);
            let _ = std::fs::remove_dir_all(stage);
            result
        })
        .await?;
        view(&app.state::<LocalScanner>())
    }
}
#[tauri::command]
pub async fn update_local_scanner_database(
    app: tauri::AppHandle,
    offline: bool,
) -> Result<View, &'static str> {
    let paths = if offline {
        pick_files(
            &app,
            "Drei CVD-Datenbanken und ihre drei .sign-Dateien auswählen",
            true,
        )
        .await?
    } else {
        approve(&app, crate::scanner_consent::update()).await?;
        vec![]
    };
    perform(app.clone(), "updating-database", move |_, _, runtime| {
        if offline {
            runtime.import_databases(&paths)
        } else {
            runtime.refresh()
        }
    })
    .await?;
    view(&app.state::<LocalScanner>())
}
#[tauri::command]
pub async fn local_scanner_preferences(
    app: tauri::AppHandle,
    automatic_updates: bool,
) -> Result<View, &'static str> {
    if automatic_updates {
        approve(&app, crate::scanner_consent::automatic_updates()).await?;
    }
    perform(app.clone(), "saving", move |_, _, runtime| {
        runtime.preferences.automatic_updates = automatic_updates;
        runtime.save()
    })
    .await?;
    view(&app.state::<LocalScanner>())
}
#[tauri::command]
pub async fn stop_local_scanner(app: tauri::AppHandle) -> Result<View, &'static str> {
    perform(app.clone(), "stopping", |_, _, runtime| {
        runtime.enable(false)?;
        Ok(())
    })
    .await?;
    view(&app.state::<LocalScanner>())
}

#[cfg(windows)]
async fn download_step<T>(
    future: impl std::future::Future<Output = Result<T, reqwest::Error>>,
    state: &LocalScanner,
) -> Result<T, &'static str> {
    let cancelled = async {
        while !state.cancel.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    tokio::select! {
        result = future => result.map_err(|_| "scanner_download_failed"),
        _ = cancelled => Err("content_cancelled"),
    }
}

#[cfg(windows)]
async fn download_engine(target: &Path, state: &LocalScanner) -> Result<(), &'static str> {
    use std::io::Write;
    let spec = package::component()?;
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.url().scheme() == "https" && attempt.previous().len() < 5 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| "scanner_download_failed")?;
    let mut response = download_step(client.get(&spec.archive.url).send(), state).await?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length != spec.archive.bytes)
    {
        return Err("scanner_download_failed");
    }
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|_| "scanner_install_failed")?;
    let mut total = 0u64;
    while let Some(chunk) = download_step(response.chunk(), state).await? {
        if state.cancel.load(Ordering::SeqCst) {
            return Err("content_cancelled");
        }
        total += chunk.len() as u64;
        if total > spec.archive.bytes {
            return Err("scanner_package_invalid");
        }
        output
            .write_all(&chunk)
            .map_err(|_| "scanner_install_failed")?;
        state.downloaded.store(total, Ordering::SeqCst);
    }
    if total != spec.archive.bytes {
        return Err("scanner_download_failed");
    }
    drop(output);
    package::check_file(target, spec.archive.bytes, &spec.archive.sha256)
}
