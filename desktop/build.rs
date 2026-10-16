fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["probe_engine", "open_session", "check_session", "close_session",
                "load_send_destination", "load_send_schema", "read_send_schema", "list_destinations", "load_destination", "import_key", "loaded_keys", "discard_keys",
                "begin_content", "append_content", "discard_content", "prepare_send", "execute_send", "cancel_send", "send_state",
                "reply_target", "prepare_reply", "execute_reply", "cancel_reply", "reply_state",
                "list_submissions", "load_submission", "verify_submission", "list_received_contents", "read_received_content", "discard_received",
                "verify_reply", "list_received_reply_contents", "read_received_reply_content", "discard_received_reply",
                "prepare_receipt", "execute_receipt", "cancel_receipt", "receipt_state",
                "load_event_log", "list_event_log", "read_event_log", "discard_event_log", "list_replies", "list_reply_channels"]),
        ),
    ).expect("Tauri build configuration failed");
}
