//! Bounded, session-bound key archive transfer. No private item enters the WebView.
use crate::protocol::{ApiVersion, SessionResource};
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ArchiveItem {
    offset: usize,
    total: usize,
    item: Option<Value>,
}
pub(crate) async fn read<F, Fut>(
    api: ApiVersion,
    session: &str,
    mut request: F,
) -> Result<Vec<Value>, &'static str>
where
    F: FnMut(Value) -> Fut,
    Fut: Future<Output = Result<SessionResource, &'static str>>,
{
    let mut keys = vec![];
    let mut expected = None;
    for offset in 0..=176 {
        let response: SessionResource = request(serde_json::json!({"command":"export_session_item", "apiVersion":api,"sessionId":session,"offset":offset})).await?;
        if !response.validate(api, session) {
            return Err("engine_protocol_error");
        }
        let page: ArchiveItem =
            serde_json::from_value(response.data).map_err(|_| "engine_protocol_error")?;
        if page.offset != offset
            || page.total > 176
            || expected.is_some_and(|total| total != page.total)
        {
            return Err("engine_protocol_error");
        }
        expected = Some(page.total);
        if offset == page.total {
            if page.item.is_some() {
                return Err("engine_protocol_error");
            }
            return Ok(keys);
        }
        let item = page.item.ok_or("engine_protocol_error")?;
        if !item.is_object() {
            return Err("engine_protocol_error");
        }
        keys.push(item);
    }
    Err("engine_protocol_error")
}

#[cfg(test)]
#[path = "profile_archive_tests.rs"]
mod tests;
