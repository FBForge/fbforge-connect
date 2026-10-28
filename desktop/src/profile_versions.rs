//! Reuse credentials across API versions without mixing their keys or case archives.
use crate::{
    protocol::ApiVersion,
    vault::{Profile, ProfileDefaults},
};

pub fn for_api(
    source: &Profile,
    api: ApiVersion,
    id: &str,
    existing: Option<Profile>,
) -> Result<Profile, &'static str> {
    source.validate()?;
    if api == source.api_version
        || id == source.profile_id
        || !crate::protocol::valid_session_id(id)
    {
        return Err("invalid_input");
    }
    let mut target = existing.unwrap_or_else(|| Profile {
        version: 1,
        environment: source.environment,
        profile_id: id.into(),
        name: source.name.clone(),
        api_version: api,
        role: source.role,
        client_id: source.client_id.clone(),
        client_secret: source.client_secret.clone(),
        keys: vec![],
        defaults: ProfileDefaults::default(),
    });
    if target.profile_id != id
        || target.api_version != api
        || target.role != source.role
        || target.environment != source.environment
        || target.client_id != source.client_id
    {
        return Err("vault_conflict");
    }
    target.client_secret = source.client_secret.clone();
    target.validate()?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{environments::Environment, protocol::SessionRole};
    fn source() -> Profile {
        Profile {
            version: 1,
            environment: Environment::TEST,
            profile_id: "11111111-1111-4111-8111-111111111111".into(),
            name: "Synthetic".into(),
            api_version: ApiVersion::V2,
            role: SessionRole::OnlineService,
            client_id: "synthetic-client".into(),
            client_secret: "synthetic-secret".into(),
            keys: vec![serde_json::json!({"synthetic":"v2-only"})],
            defaults: ProfileDefaults::default(),
        }
    }
    const TARGET: &str = "22222222-2222-4222-8222-222222222222";
    #[test]
    fn credentials_are_reused_without_copying_protocol_bound_keys() {
        let source = source();
        let mut copy = for_api(&source, ApiVersion::V3, TARGET, None).unwrap();
        assert_eq!(copy.client_secret, source.client_secret);
        assert_eq!(copy.client_id, source.client_id);
        assert!(copy.keys.is_empty());
        assert_eq!(source.keys.len(), 1);
        copy.keys.push(serde_json::json!({"synthetic":"v3-only"}));
        let updated = for_api(&source, ApiVersion::V3, TARGET, Some(copy)).unwrap();
        assert_eq!(updated.keys[0]["synthetic"], "v3-only");
        assert!(for_api(&source, ApiVersion::V2, TARGET, None).is_err());
        assert!(for_api(&source, ApiVersion::V3, &source.profile_id, None).is_err());
    }
    #[test]
    fn another_identity_or_environment_is_never_overwritten() {
        let source = source();
        for field in ["client", "environment"] {
            let mut other = for_api(&source, ApiVersion::V3, TARGET, None).unwrap();
            if field == "client" {
                other.client_id = "another-client".into();
            } else {
                other.environment = Environment::PROD;
            }
            assert!(for_api(&source, ApiVersion::V3, TARGET, Some(other)).is_err());
        }
    }
}
