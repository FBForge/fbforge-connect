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
