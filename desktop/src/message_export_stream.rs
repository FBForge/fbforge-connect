//! Streaming export shared by the native command and platform-independent contract tests.
use crate::{
    message_export_store::{self as store, ExportDirectory},
    protocol::valid_session_id,
};
use serde_json::{json, Value};
use std::{future::Future, io::Write, path::Path};

pub async fn export<F, Fut>(
    parent: &Path,
    prefix: &str,
    message_id: &str,
    local: bool,
    environment: &str,
    mut read: F,
) -> Result<Value, &'static str>
where
    F: FnMut(Option<String>, usize) -> Fut,
    Fut: Future<Output = Result<Value, &'static str>>,
{
    if !valid_session_id(message_id)
        || !["Einreichung", "Antwort"].contains(&prefix)
        || !crate::environments::valid_environment(environment)
    {
        return Err("invalid_input");
    }
    let mut parts = vec![];
    let minimum = if local { 1 } else { 2 };
    let mut expected_total = None;
    for offset in (0..42).step_by(2) {
        let data = read(None, offset).await?;
        if data
            .get("blockedAttachmentCount")
            .is_some_and(|count| count.as_u64().is_none_or(|n| n > 0))
        {
            return Err("message_content_blocked");
        }
        let total = data["total"]
            .as_u64()
            .filter(|n| *n >= minimum && *n <= 42)
            .ok_or("engine_protocol_error")? as usize;
        if data["offset"] != offset || expected_total.is_some_and(|expected| expected != total) {
            return Err("engine_protocol_error");
        }
        expected_total = Some(total);
        let page = data["parts"].as_array().ok_or("engine_protocol_error")?;
        if page.len() != 2.min(total.saturating_sub(offset)) {
            return Err("engine_protocol_error");
        }
        parts.extend(page.clone());
        if parts.len() == total {
            break;
        }
    }
    if parts.iter().any(|part| part["kind"] == "scan-report") {
        return Err("message_content_blocked");
    }
    let parts: Vec<_> = parts
        .into_iter()
        .filter(|part| part["kind"] != "schema")
        .collect();
    if parts.is_empty()
        || parts.len() > 41
        || parts.iter().filter(|p| p["kind"] == "metadata").count() > 1
        || (!local && parts.iter().filter(|p| p["kind"] == "metadata").count() != 1)
        || parts.iter().filter(|p| p["kind"] == "data").count() > 1
    {
        return Err("engine_protocol_error");
    }
    let mut bytes = 0;
    let mut ids = std::collections::HashSet::new();
    for part in &parts {
        let id = part["contentId"]
            .as_str()
            .filter(|id| valid_session_id(id))
            .ok_or("engine_protocol_error")?;
        let size = part["totalBytes"]
            .as_u64()
            .filter(|n| *n <= store::FILE_LIMIT)
            .ok_or("content_limit")?;
        if !ids.insert(id)
            || !matches!(
                part["kind"].as_str(),
                Some("metadata" | "data" | "attachment")
            )
        {
            return Err("engine_protocol_error");
        }
        bytes += size;
        if bytes > store::MESSAGE_LIMIT {
            return Err("content_limit");
        }
    }
    // Validate the complete native page above before classifying a transport-only record.
    // Missing plaintext is a normal local state; malformed parts remain protocol errors.
    if !parts.iter().any(|part| part["kind"] == "data") {
        return Err(if local {
            "message_content_missing"
        } else {
            "engine_protocol_error"
        });
    }
    let mut directory = ExportDirectory::new(parent, &format!("{prefix}-{}", message_id))?;
    let mut files = vec![];
    for (index, part) in parts.iter().enumerate() {
        let size = part["totalBytes"].as_u64().ok_or("engine_protocol_error")? as usize;
        let content = part["contentId"].as_str().ok_or("engine_protocol_error")?;
        let name = match part["kind"].as_str() {
            Some("metadata") => "metadata.json".into(),
            Some("data") => match part["mimeType"].as_str() {
                Some("application/json") => "data.json",
                Some("application/xml" | "text/xml") => "data.xml",
                _ => "data.bin",
            }
            .into(),
            _ => store::attachment_name(index + 1, part["fileName"].as_str()),
        };
        let mut file = directory.create(&name)?;
        for offset in (0..size).step_by(store::CHUNK_SIZE) {
            let data = read(Some(content.to_string()), offset).await?;
            let expected = store::CHUNK_SIZE.min(size - offset);
            if data["contentId"] != content
                || data["byteOffset"] != offset
                || data["totalBytes"] != size
                || data["complete"] != (offset + expected == size)
            {
                return Err("engine_protocol_error");
            }
            let mut chunk =
                store::decode_chunk(data["chunk"].as_str().ok_or("engine_protocol_error")?)?;
            if chunk.len() != expected {
                chunk.fill(0);
                return Err("engine_protocol_error");
            }
            let result = file.write_all(&chunk);
            chunk.fill(0);
            result.map_err(|_| "export_failed")?;
        }
        file.sync_all().map_err(|_| "export_failed")?;
        files.push(json!({"file":name,"originalName":part["fileName"],"kind":part["kind"],"mimeType":part["mimeType"],"contentId":part["contentId"],"bytes":size}));
    }
    let path = directory.finish(&json!({"format":"FBForge Connect message export v1","environment":environment,"source":if local{"local-copy"}else{"verified-received-content"},"messageId":message_id,"files":files}))?;
    Ok(json!({"directory":path.to_string_lossy(),"fileCount":parts.len(),"totalBytes":bytes}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        task::{Context, Poll, Waker},
    };
    fn ready<T>(future: impl Future<Output = T>) -> T {
        let mut future = std::pin::pin!(future);
        match future
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
        {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("fixture must resolve synchronously"),
        }
    }
    fn id(n: usize) -> String {
        format!("{n:08}-1111-4111-8111-111111111111")
    }
    fn parts() -> Vec<Value> {
        vec![
            json!({"contentId":id(1),"kind":"metadata","fileName":"metadata.json","mimeType":"application/json","totalBytes":2}),
            json!({"contentId":id(2),"kind":"data","fileName":"data.json","mimeType":"application/json","totalBytes":7}),
            json!({"contentId":id(3),"kind":"attachment","fileName":"../../CON:binary.bin","mimeType":"application/octet-stream","totalBytes":3}),
        ]
    }
    fn response(parts: &[Value], content: Option<String>, offset: usize) -> Value {
        if let Some(content) = content {
            let part = parts
                .iter()
                .find(|part| part["contentId"] == content)
                .unwrap();
            let chunk = match part["kind"].as_str().unwrap() {
                "metadata" => "e30=",
                "data" => "eyJhIjoxfQ==",
                _ => "QQBC",
            };
            json!({"contentId":content,"byteOffset":offset,"totalBytes":part["totalBytes"],"chunk":chunk,"complete":true})
        } else {
            json!({"offset":offset,"total":parts.len(),"parts":parts.iter().skip(offset).take(2).collect::<Vec<_>>()})
        }
    }
    #[test]
    fn original_metadata_data_and_binary_bytes_are_saved_only_with_a_complete_manifest() {
        let parent = std::env::temp_dir();
        let root = store::reserve(&parent, "fbforge-stream-test").unwrap();
        let parts = parts();
        let result = ready(export(
            &root,
            "Einreichung",
            &id(5),
            false,
            "TEST",
            |content, offset| std::future::ready(Ok(response(&parts, content, offset))),
        ))
        .unwrap();
        let path = Path::new(result["directory"].as_str().unwrap());
        assert_eq!(fs::read(path.join("metadata.json")).unwrap(), b"{}");
        assert_eq!(fs::read(path.join("data.json")).unwrap(), b"{\"a\":1}");
        let manifest: Value =
            serde_json::from_slice(&fs::read(path.join("export.json")).unwrap()).unwrap();
        let attachment = manifest["files"][2]["file"].as_str().unwrap();
        assert_eq!(fs::read(path.join(attachment)).unwrap(), b"A\0B");
        assert_eq!(manifest["files"][2]["originalName"], "../../CON:binary.bin");
        assert_eq!(result["fileCount"], 3);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_or_mixed_chunks_never_leave_an_apparently_complete_export() {
        for problem in ["size", "offset", "bytes", "failure", "catalog"] {
            let root = store::reserve(&std::env::temp_dir(), "fbforge-broken-stream").unwrap();
            let parts = parts();
            let result = ready(export(
                &root,
                "Antwort",
                &id(6),
                false,
                "PROD",
                |content, offset| {
                    let mut result = response(&parts, content.clone(), offset);
                    if content.as_deref() == Some(&id(2)) {
                        match problem {
                            "size" => result["totalBytes"] = 99.into(),
                            "offset" => result["byteOffset"] = 1.into(),
                            "bytes" => result["chunk"] = "AA==".into(),
                            "failure" => return std::future::ready(Err("export_failed")),
                            _ => (),
                        }
                    }
                    if problem == "catalog" && content.is_none() && offset > 0 {
                        result["total"] = 2.into();
                    }
                    std::future::ready(Ok(result))
                },
            ));
            assert!(result.is_err(), "{problem}");
            assert_eq!(fs::read_dir(&root).unwrap().count(), 0, "{problem}");
            fs::remove_dir_all(root).unwrap();
        }
    }
    #[test]
    fn a_historical_copy_exports_available_bytes_and_reports_its_local_origin() {
        let root = store::reserve(&std::env::temp_dir(), "fbforge-local-export").unwrap();
        let parts = vec![parts()[1].clone()];
        let result = ready(export(
            &root,
            "Antwort",
            &id(7),
            true,
            "STAGE",
            |content, offset| std::future::ready(Ok(response(&parts, content, offset))),
        ))
        .unwrap();
        let path = Path::new(result["directory"].as_str().unwrap());
        assert_eq!(fs::read(path.join("data.json")).unwrap(), b"{\"a\":1}");
        assert!(!path.join("metadata.json").exists());
        let manifest: Value =
            serde_json::from_slice(&fs::read(path.join("export.json")).unwrap()).unwrap();
        assert_eq!(manifest["source"], "local-copy");
        assert_eq!(manifest["environment"], "STAGE");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn transport_only_case_is_not_a_protocol_error_and_creates_no_files() {
        let root = store::reserve(&std::env::temp_dir(), "fbforge-transport-only").unwrap();
        let parts = vec![parts()[0].clone()];
        let result = ready(export(
            &root,
            "Einreichung",
            &id(7),
            true,
            "TEST",
            |content, offset| std::future::ready(Ok(response(&parts, content, offset))),
        ));
        assert_eq!(result.unwrap_err(), "message_content_missing");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
}
