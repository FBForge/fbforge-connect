//! Fixed URLs shared by the launcher and isolated native contract tests.
pub fn documentation_url(topic: &str) -> Result<String, &'static str> {
    match topic {
        "start" | "connection" | "send" | "receive" | "replies" | "cases" | "attachments"
        | "processes" | "destinations" | "events" | "diagnostics" | "problems"
        | "accessibility" => Ok(format!("https://fbforge.de/connect/hilfe/0.2/{topic}")),
        _ => Err("invalid_input"),
    }
}

#[cfg(test)]
mod tests {
    use super::documentation_url;
    #[test]
    fn only_known_chapters_can_be_opened() {
        assert_eq!(
            documentation_url("receive").unwrap(),
            "https://fbforge.de/connect/hilfe/0.2/receive"
        );
        for invalid in [
            "https://example.org",
            "../secret",
            "start?token=secret",
            "file:///tmp/test",
            "__proto__",
            "Start",
            "",
        ] {
            assert!(documentation_url(invalid).is_err());
        }
    }
}
