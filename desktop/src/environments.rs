use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum Environment {
    #[default]
    TEST,
    STAGE,
    PROD,
}
impl Environment {
    pub fn requires_vpki(self) -> bool {
        self != Self::TEST
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::TEST => "TEST",
            Self::STAGE => "STAGE",
            Self::PROD => "PROD",
        }
    }
    pub fn from_code(value: u8) -> Self {
        match value {
            1 => Self::STAGE,
            2 => Self::PROD,
            _ => Self::TEST,
        }
    }
    pub fn code(self) -> u8 {
        match self {
            Self::TEST => 0,
            Self::STAGE => 1,
            Self::PROD => 2,
        }
    }
}
pub fn valid_environment(value: &str) -> bool {
    matches!(value, "TEST" | "STAGE" | "PROD")
}
pub fn response_environment(value: &serde_json::Value, expected: Environment) -> bool {
    value.get("environment").and_then(serde_json::Value::as_str) == Some(expected.name())
}

pub fn production_action(command: &str) -> Option<&'static str> {
    Some(match command {
        "execute_send" => "Einreichung senden",
        "execute_reply" => "Antwort senden",
        "execute_receipt" => "Einreichung annehmen oder ablehnen",
        "execute_reply_receipt" => "Antwort annehmen oder ablehnen",
        "execute_destination_update" => "Destination ändern",
        "execute_destination_creation" => "Destination anlegen",
        "execute_destination_rotation" => "Schlüssel austauschen",
        "execute_destination_cleanup" => "Destination löschen",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_supported_remote_write_requires_production_confirmation() {
        for command in [
            "execute_send",
            "execute_reply",
            "execute_receipt",
            "execute_reply_receipt",
            "execute_destination_update",
            "execute_destination_creation",
            "execute_destination_rotation",
            "execute_destination_cleanup",
        ] {
            assert!(production_action(command).is_some());
        }
        for command in [
            "prepare_send",
            "prepare_destination_update",
            "load_destination",
            "generate_test_keys",
            "import_certified_keys",
            "case_workspace",
        ] {
            assert!(production_action(command).is_none());
        }
    }
    #[test]
    fn only_known_environments_and_exact_response_bindings_are_accepted() {
        for environment in [Environment::TEST, Environment::STAGE, Environment::PROD] {
            assert_eq!(Environment::from_code(environment.code()), environment);
            assert!(valid_environment(environment.name()));
            for other in [Environment::TEST, Environment::STAGE, Environment::PROD] {
                assert_eq!(
                    response_environment(&serde_json::json!({"environment":other}), environment),
                    other == environment
                );
            }
        }
        assert!(!valid_environment("LOCAL"));
        assert!(serde_json::from_str::<Environment>("\"https://localhost\"").is_err());
        assert!(!response_environment(
            &serde_json::json!({}),
            Environment::TEST
        ));
    }
}
