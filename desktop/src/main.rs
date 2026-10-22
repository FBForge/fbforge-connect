#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod documentation;
mod documentation_links;
mod test_library;
mod test_library_command;
use documentation::open_documentation;
mod case_store;
mod cases;
mod profile_backup;
use cases::case_workspace;
mod profiles;
mod protocol;
mod vault;
use profile_backup::{export_profile_backup, import_profile_backup, import_profile_backup_file};
use profiles::{
    forget_profile, get_profile_defaults, list_profiles, open_saved_profile, profile_status,
    save_profile_defaults, save_profile_state, update_profile,
};
mod commands;
mod engine;
mod write_policy;
use engine::{request, EngineState};
use std::time::Duration;
use tauri::Manager;
use write_policy::resource_action;

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![
            test_library_command::test_library,
            open_documentation,
            case_workspace,
            update_profile,
            export_profile_backup,
            import_profile_backup,
            import_profile_backup_file,
            commands::destinations::search_process_destinations,
            commands::destination_cleanup::prepare_destination_cleanup,
            commands::destination_cleanup::execute_destination_cleanup,
            commands::destination_cleanup::cancel_destination_cleanup,
            commands::destination_cleanup::destination_cleanup_state,
            commands::destination_rotation::prepare_destination_rotation,
            commands::destination_rotation::execute_destination_rotation,
            commands::destination_rotation::cancel_destination_rotation,
            commands::destination_rotation::destination_rotation_state,
            commands::keys::generate_test_keys,
            commands::keys::list_generated_keys,
            commands::keys::list_key_inventory,
            commands::keys::remove_key_inventory_item,
            commands::destination_creation::prepare_destination_creation,
            commands::destination_creation::execute_destination_creation,
            commands::destination_creation::cancel_destination_creation,
            commands::destination_creation::destination_creation_state,
            commands::destination_creation::reconcile_destination_creation,
            commands::keys::use_generated_keys,
            list_profiles,
            get_profile_defaults,
            save_profile_defaults,
            forget_profile,
            open_saved_profile,
            profile_status,
            save_profile_state,
            commands::destinations::load_managed_destination,
            commands::destinations::prepare_destination_update,
            commands::destinations::execute_destination_update,
            commands::destinations::cancel_destination_update,
            commands::destinations::destination_update_state,
            commands::sessions::probe_engine,
            commands::sessions::open_session,
            commands::sessions::check_session,
            commands::sessions::close_session,
            commands::send::load_send_destination,
            commands::send::load_send_schema,
            commands::send::validate_send_data,
            commands::send::read_send_schema,
            commands::replies::load_reply_schema,
            commands::replies::read_reply_schema,
            commands::event_log::load_reply_event_log,
            commands::event_log::load_case_event_log,
            commands::event_log::list_case_event_log,
            commands::reply_receipts::prepare_reply_receipt,
            commands::reply_receipts::execute_reply_receipt,
            commands::reply_receipts::cancel_reply_receipt,
            commands::reply_receipts::reply_receipt_state,
            commands::receive::read_received_schema,
            commands::reply_receive::read_received_reply_schema,
            commands::destinations::list_destinations,
            commands::destinations::load_destination,
            commands::keys::import_key,
            commands::keys::loaded_keys,
            commands::keys::discard_keys,
            commands::content::begin_content,
            commands::content::append_content,
            commands::content::discard_content,
            commands::send::prepare_send,
            commands::send::execute_send,
            commands::send::cancel_send,
            commands::send::send_state,
            commands::replies::reply_target,
            commands::replies::prepare_reply,
            commands::replies::execute_reply,
            commands::replies::cancel_reply,
            commands::replies::reply_state,
            commands::receive::list_submissions,
            commands::receive::load_submission,
            commands::receive::verify_submission,
            commands::receive::list_received_contents,
            commands::receive::read_received_content,
            commands::receive::discard_received,
            commands::reply_receive::verify_reply,
            commands::reply_receive::list_received_reply_contents,
            commands::reply_receive::read_received_reply_content,
            commands::reply_receive::discard_received_reply,
            commands::receipts::prepare_receipt,
            commands::receipts::execute_receipt,
            commands::receipts::cancel_receipt,
            commands::receipts::receipt_state,
            commands::event_log::load_event_log,
            commands::event_log::list_event_log,
            commands::event_log::read_event_log,
            commands::event_log::discard_event_log,
            commands::reply_receive::list_replies,
            commands::reply_receive::list_reply_channels
        ])
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_, url| {
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (matches!(url.scheme(), "http" | "https")
                            && url.host_str() == Some("tauri.localhost"))
                        || (cfg!(debug_assertions)
                            && url.scheme() == "http"
                            && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
                            && url.port() == Some(1420))
                })
                .build(),
        )
        .build(tauri::generate_context!())
        .expect("Desktop startup failed");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app.state::<EngineState>();
            tauri::async_runtime::block_on(async {
                if let Ok(mut process) =
                    tokio::time::timeout(Duration::from_secs(2), state.process.lock()).await
                {
                    if let Some(child) = process.take() {
                        let _ = child.shutdown().await;
                    }
                }
            });
        }
    });
}
