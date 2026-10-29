use serde::{Deserialize, Serialize};

pub const MAX_FRAME_BYTES: usize = 65_536;

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Debug)]
pub enum ApiVersion {
    #[serde(rename = "v2")]
    V2,
    #[serde(rename = "v3")]
    V3,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProbeResult {
    pub api_version: ApiVersion,
    pub sdk_version: String,
    pub environment: String,
    pub entrypoint: String,
    pub isolated: bool,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
pub enum SessionRole {
    #[serde(rename = "online-service")]
    OnlineService,
    #[serde(rename = "administrative-system")]
    AdministrativeSystem,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionSnapshot {
    pub session_id: String,
    pub api_version: ApiVersion,
    pub role: SessionRole,
    pub environment: String,
    pub connected: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionResource {
    pub api_version: ApiVersion,
    pub session_id: String,
    pub environment: String,
    pub data: serde_json::Value,
}
impl SessionResource {
    pub fn validate(&self, version: ApiVersion, id: &str) -> bool {
        self.api_version == version
            && crate::environments::valid_environment(&self.environment)
            && self.session_id == id
            && valid_session_id(id)
            && self.data.is_object()
    }
}

pub enum EngineFailure {
    Fatal(&'static str),
    Remote(&'static str),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineResponse<T = ProbeResult> {
    pub protocol_version: u8,
    pub id: String,
    pub ok: bool,
    pub result: Option<T>,
    pub error: Option<String>,
}

impl<T> EngineResponse<T> {
    pub fn payload(self, id: &str) -> Result<T, EngineFailure> {
        if self.protocol_version != 1
            || self.id != id
            || (self.ok && self.error.is_some())
            || (!self.ok && self.result.is_some())
        {
            return Err(EngineFailure::Fatal("engine_protocol_error"));
        }
        if !self.ok {
            return Err(match self.error.as_deref() {
                Some("adapter_unavailable") => EngineFailure::Remote("adapter_unavailable"),
                Some("authentication_failed") => EngineFailure::Remote("authentication_failed"),
                Some("auth_unavailable") => EngineFailure::Remote("auth_unavailable"),
                Some("endpoint_blocked") => EngineFailure::Remote("endpoint_blocked"),
                Some("invalid_credentials") => EngineFailure::Remote("invalid_credentials"),
                Some("session_missing") => EngineFailure::Remote("session_missing"),
                Some("malware_detected") => EngineFailure::Remote("malware_detected"),
                Some("malware_scan_failed") => EngineFailure::Remote("malware_scan_failed"),
                Some("invalid_resource") => EngineFailure::Remote("invalid_resource"),
                Some("receive_response_invalid") => {
                    EngineFailure::Remote("receive_response_invalid")
                }
                Some("receive_message_mismatch") => {
                    EngineFailure::Remote("receive_message_mismatch")
                }
                Some("receive_message_changed") => EngineFailure::Remote("receive_message_changed"),
                Some("receive_attachments_invalid") => {
                    EngineFailure::Remote("receive_attachments_invalid")
                }
                Some("receive_key_mismatch") => EngineFailure::Remote("receive_key_mismatch"),
                Some("receive_payload_invalid") => EngineFailure::Remote("receive_payload_invalid"),
                Some("receive_metadata_invalid") => {
                    EngineFailure::Remote("receive_metadata_invalid")
                }
                Some("receive_metadata_schema_missing") => {
                    EngineFailure::Remote("receive_metadata_schema_missing")
                }
                Some("receive_metadata_schema_unsupported") => {
                    EngineFailure::Remote("receive_metadata_schema_unsupported")
                }
                Some("receive_filename_invalid") => {
                    EngineFailure::Remote("receive_filename_invalid")
                }
                Some("destination_conflict") => EngineFailure::Remote("destination_conflict"),
                Some("destination_update_locked") => {
                    EngineFailure::Remote("destination_update_locked")
                }
                Some("destination_no_keys") => EngineFailure::Remote("destination_no_keys"),
                Some("resource_denied") => EngineFailure::Remote("resource_denied"),
                Some("resource_missing") => EngineFailure::Remote("resource_missing"),
                Some("case_limit") => EngineFailure::Remote("case_limit"),
                Some("resource_unavailable") => EngineFailure::Remote("resource_unavailable"),
                Some("verification_failed") => EngineFailure::Remote("verification_failed"),
                Some("schema_consent_required") => EngineFailure::Remote("schema_consent_required"),
                Some("schema_required") => EngineFailure::Remote("schema_required"),
                Some("schema_id_mismatch") => EngineFailure::Remote("schema_id_mismatch"),
                Some("data_schema_invalid") => EngineFailure::Remote("data_schema_invalid"),
                Some("schema_unavailable") => EngineFailure::Remote("schema_unavailable"),
                Some("schema_tls_error") => EngineFailure::Remote("schema_tls_error"),
                Some("schema_network_error") => EngineFailure::Remote("schema_network_error"),
                Some("schema_http_error") => EngineFailure::Remote("schema_http_error"),
                Some("schema_archive_invalid") => EngineFailure::Remote("schema_archive_invalid"),
                Some("key_rejected") => EngineFailure::Remote("key_rejected"),
                Some("key_missing") => EngineFailure::Remote("key_missing"),
                Some("test_certificate_required") => {
                    EngineFailure::Remote("test_certificate_required")
                }
                Some("vpki_certificate_required") => {
                    EngineFailure::Remote("vpki_certificate_required")
                }
                Some("certificate_status_unknown") => {
                    EngineFailure::Remote("certificate_status_unknown")
                }
                Some("environment_mismatch") => EngineFailure::Remote("environment_mismatch"),
                Some("invalid_input") => EngineFailure::Remote("invalid_input"),
                Some("content_limit") => EngineFailure::Remote("content_limit"),
                Some("invalid_submission") => EngineFailure::Remote("invalid_submission"),
                Some("reply_metadata_required") => EngineFailure::Remote("reply_metadata_required"),
                Some("data_format_invalid") => EngineFailure::Remote("data_format_invalid"),
                Some("reply_channel_missing") => EngineFailure::Remote("reply_channel_missing"),
                Some("send_locked") => EngineFailure::Remote("send_locked"),
                _ => EngineFailure::Fatal("engine_protocol_error"),
            });
        }
        self.result
            .ok_or(EngineFailure::Fatal("engine_protocol_error"))
    }
}

pub fn valid_session_id(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

impl SessionSnapshot {
    pub fn validate(
        &self,
        version: ApiVersion,
        role: Option<SessionRole>,
        id: Option<&str>,
        connected: bool,
    ) -> bool {
        self.api_version == version
            && crate::environments::valid_environment(&self.environment)
            && self.connected == connected
            && valid_session_id(&self.session_id)
            && role.map_or(true, |r| r == self.role)
            && id.map_or(true, |id| id == self.session_id)
    }
}

impl ProbeResult {
    pub fn validate(&self, version: ApiVersion) -> bool {
        let expected = match version {
            ApiVersion::V2 => "3.5.2",
            ApiVersion::V3 => "4.0.0",
        };
        self.api_version == version
            && crate::environments::valid_environment(&self.environment)
            && self.isolated
            && self.sdk_version == expected
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(version: ApiVersion) -> EngineResponse {
        EngineResponse {
            protocol_version: 1,
            id: "op-1".into(),
            ok: true,
            error: None,
            result: Some(ProbeResult {
                api_version: version,
                sdk_version: "3.5.2".into(),
                environment: "TEST".into(),
                entrypoint: "public.class".into(),
                isolated: true,
            }),
        }
    }
    #[test]
    fn validates_identity_version_and_environment() {
        assert!(response(ApiVersion::V2)
            .payload("op-1")
            .is_ok_and(|value| value.validate(ApiVersion::V2) && !value.validate(ApiVersion::V3)));
        assert!(matches!(
            response(ApiVersion::V2).payload("other"),
            Err(EngineFailure::Fatal("engine_protocol_error"))
        ));
        let mut prod = response(ApiVersion::V2);
        prod.result.as_mut().unwrap().environment = "LOCAL".into();
        assert!(prod
            .payload("op-1")
            .is_ok_and(|value| !value.validate(ApiVersion::V2)));
    }
    #[test]
    fn unknown_errors_never_escape_to_renderer() {
        let mut error = response(ApiVersion::V2);
        error.ok = false;
        error.result = None;
        error.error = Some("synthetic-secret".into());
        assert!(matches!(
            error.payload("op-1"),
            Err(EngineFailure::Fatal("engine_protocol_error"))
        ));
    }
    #[test]
    fn only_two_api_values_are_accepted() {
        assert!(serde_json::from_str::<ApiVersion>("\"prod\"").is_err());
        assert!(serde_json::from_str::<ApiVersion>("\"v1\"").is_err());
    }
    #[test]
    fn session_responses_are_bound_to_api_role_and_id() {
        let session = SessionSnapshot {
            session_id: "00000000-0000-4000-8000-000000000001".into(),
            api_version: ApiVersion::V2,
            role: SessionRole::OnlineService,
            environment: "TEST".into(),
            connected: true,
        };
        assert!(session.validate(
            ApiVersion::V2,
            Some(SessionRole::OnlineService),
            Some(&session.session_id),
            true
        ));
        assert!(!session.validate(ApiVersion::V3, None, None, true));
        assert!(!session.validate(
            ApiVersion::V2,
            Some(SessionRole::AdministrativeSystem),
            None,
            true
        ));
        assert!(!session.validate(ApiVersion::V2, None, Some("other"), true));
        assert!(!session.validate(ApiVersion::V2, None, None, false));
    }
    #[test]
    fn safe_auth_errors_are_remote_but_mixed_payloads_are_protocol_errors() {
        let authentication = EngineResponse::<SessionSnapshot> {
            protocol_version: 1,
            id: "op-1".into(),
            ok: false,
            result: None,
            error: Some("authentication_failed".into()),
        };
        assert!(matches!(
            authentication.payload("op-1"),
            Err(EngineFailure::Remote("authentication_failed"))
        ));
        let mut mixed = response(ApiVersion::V2);
        mixed.error = Some("authentication_failed".into());
        assert!(matches!(
            mixed.payload("op-1"),
            Err(EngineFailure::Fatal("engine_protocol_error"))
        ));
    }
    #[test]
    fn resource_responses_require_test_api_and_session_binding() {
        let id = "00000000-0000-4000-8000-000000000001";
        let mut resource = SessionResource {
            api_version: ApiVersion::V2,
            session_id: id.into(),
            environment: "TEST".into(),
            data: serde_json::json!({"keys":[]}),
        };
        assert!(resource.validate(ApiVersion::V2, id));
        assert!(!resource.validate(ApiVersion::V3, id));
        assert!(!resource.validate(ApiVersion::V2, "00000000-0000-4000-8000-000000000002"));
        resource.environment = "LOCAL".into();
        assert!(!resource.validate(ApiVersion::V2, id));
        resource.environment = "TEST".into();
        resource.data = serde_json::Value::Null;
        assert!(!resource.validate(ApiVersion::V2, id));
    }
    #[test]
    fn expected_resource_failures_do_not_destroy_unrelated_sessions() {
        for code in [
            "resource_denied",
            "resource_missing",
            "resource_unavailable",
            "invalid_resource",
            "receive_response_invalid",
            "receive_message_mismatch",
            "receive_message_changed",
            "receive_attachments_invalid",
            "receive_key_mismatch",
            "receive_payload_invalid",
            "receive_metadata_invalid",
            "receive_metadata_schema_missing",
            "receive_metadata_schema_unsupported",
            "receive_filename_invalid",
            "key_rejected",
            "key_missing",
            "test_certificate_required",
            "invalid_input",
            "content_limit",
            "case_limit",
            "verification_failed",
            "schema_required",
            "schema_id_mismatch",
            "data_schema_invalid",
            "schema_unavailable",
            "reply_channel_missing",
            "schema_consent_required",
            "schema_tls_error",
            "schema_network_error",
            "schema_http_error",
            "schema_archive_invalid",
            "data_format_invalid",
        ] {
            let response = EngineResponse::<SessionResource> {
                protocol_version: 1,
                id: "op-1".into(),
                ok: false,
                result: None,
                error: Some(code.into()),
            };
            assert!(
                matches!(response.payload("op-1"), Err(EngineFailure::Remote(value)) if value == code)
            );
        }
    }
}
