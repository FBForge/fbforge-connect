use crate::{environments::Environment, EngineState};
use std::sync::atomic::Ordering;
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[tauri::command]
pub async fn select_environment(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
    environment: Environment,
) -> Result<Environment, &'static str> {
    let mut process = state.process.try_lock().map_err(|_| "engine_busy")?;
    if state.updating.load(Ordering::Acquire) {
        return Err("update_activity_pending");
    }
    if state.environment() == environment {
        return Ok(environment);
    }
    // EOF closes all session-owned streams and removes plaintext temporary copies before switching.
    if let Some(previous) = process.take() {
        previous.shutdown().await?;
    }
    state.forget_closed_sessions().await;
    state
        .selected_environment
        .store(environment.code(), Ordering::Release);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!(
            "FBForge Connect · FIT-Connect {}",
            environment.name()
        ));
    }
    Ok(environment)
}

pub async fn confirm_production_action(
    app: &tauri::AppHandle,
    action: &'static str,
) -> Result<(), &'static str> {
    let window = app
        .get_webview_window("main")
        .ok_or("resource_unavailable")?;
    let app = app.clone();
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().message(format!("{action}\n\nSie arbeiten in PROD. Diese Aktion verändert echte Daten bei FIT-Connect. Auch eine Testeinreichung in PROD ist eine produktive Übertragung.\n\nPrüfen Sie Zugang, Destination und Inhalt in der Zusammenfassung. Möchten Sie diese Aktion jetzt in PROD ausführen?"))
            .parent(&window)
            .title("PROD – Produktive Aktion bestätigen")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("In PROD ausführen".into(), "Abbrechen".into()))
            .blocking_show()
    }).await.map_err(|_| "resource_unavailable")?;
    if confirmed {
        Ok(())
    } else {
        Err("content_cancelled")
    }
}

pub async fn confirm_schema_review(app: &tauri::AppHandle) -> Result<(), &'static str> {
    let window = app
        .get_webview_window("main")
        .ok_or("resource_unavailable")?;
    let app = app.clone();
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().message("Die Fachdaten weichen vom angegebenen Schema ab. Entschlüsselung und Integrität wurden geprüft. Die Schemaabweichungen bleiben bestehen.\n\nHaben Sie die angezeigten Daten und Fehler geprüft und möchten Sie diese Nachricht trotzdem annehmen?")
            .parent(&window).title("Trotz Schemaabweichungen annehmen?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Trotz Abweichungen annehmen".into(), "Abbrechen".into()))
            .blocking_show()
    }).await.map_err(|_| "resource_unavailable")?;
    if confirmed {
        Ok(())
    } else {
        Err("content_cancelled")
    }
}

pub async fn confirm_attachment_review(
    app: &tauri::AppHandle,
    count: u64,
) -> Result<(), &'static str> {
    let window = app
        .get_webview_window("main")
        .ok_or("resource_unavailable")?;
    let app = app.clone();
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().message(format!("Der Virenscan hat {count} Anlage(n) gesperrt. Diese Dateien werden nicht geöffnet, exportiert oder als nutzbare Vorgangskopie gespeichert. Eventuelle Schemaabweichungen bleiben ebenfalls bestehen.\n\nSie nehmen die Nachricht insgesamt an. FIT-Connect erhält Problemhinweise mit den betroffenen Anlagenkennungen. Benötigte Anlagen müssen Sie gegebenenfalls erneut anfordern.\n\nNachricht mit diesen Anlagenproblemen ausdrücklich annehmen?"))
            .parent(&window).title("Mit gesperrten Anlagen annehmen?").kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Mit Anlagenproblemen annehmen".into(), "Abbrechen".into())).blocking_show()
    }).await.map_err(|_| "resource_unavailable")?;
    if confirmed {
        Ok(())
    } else {
        Err("content_cancelled")
    }
}
