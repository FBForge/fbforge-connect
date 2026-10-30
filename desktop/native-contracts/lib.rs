//! Protocol and storage tests runnable without WebView/GTK build dependencies.
#[path = "../src/protocol.rs"]
pub mod protocol;
#[path = "../src/vault.rs"]
pub mod vault;

#[path = "../src/case_store.rs"]
pub mod case_store;

#[path = "../src/documentation_links.rs"]
pub mod documentation_links;

#[path = "../src/test_library.rs"]
pub mod test_library;

#[path = "../src/environments.rs"]
pub mod environments;

#[path = "../src/message_export_store.rs"]
pub mod message_export_store;

#[path = "../src/message_export_stream.rs"]
pub mod message_export_stream;

#[path = "../src/profile_versions.rs"]
pub mod profile_versions;

#[path = "../src/update_policy.rs"]
pub mod update_policy;

#[path = "../src/profile_workspace_store.rs"]
pub mod profile_workspace_store;

#[path = "../src/scanner_package.rs"]
pub mod scanner_package;

#[path = "../src/scanner_process.rs"]
pub mod scanner_process;

#[path = "../src/scanner_runtime.rs"]
pub mod scanner_runtime;

#[path = "../src/scanner_install.rs"]
pub mod scanner_install;

#[path = "../src/file_save_store.rs"]
pub mod file_save_store;
