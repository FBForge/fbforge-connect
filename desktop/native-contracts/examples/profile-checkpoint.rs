//! CI-only checkpoint bridge using the actual product vault. Not part of the desktop bundle.
//! Private archive JSON travels through pipes; the on-disk representation is always Windows DPAPI.
use fbforge_connect_native_contracts::{
    protocol::{ApiVersion, SessionRole},
    vault::{Profile, ProfileDefaults, Vault},
};
use std::{
    io::{Read, Write},
    path::PathBuf,
};

fn run() -> Result<(), &'static str> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 4 || !cfg!(windows) {
        return Err("invalid_input");
    }
    let vault = Vault::new(PathBuf::from(&args[2]));
    match args[1].as_str() {
        // Installation acceptance uses a native fixture, avoiding shell JSON/pipe encodings.
        // This mode never reads or writes actual OAuth credentials or private keys.
        "fixture" => vault.save(&installation_fixture(&args[3])),
        "save" => {
            let mut input = Vec::new();
            std::io::stdin()
                .take(8 * 1024 * 1024 + 1)
                .read_to_end(&mut input)
                .map_err(|_| "vault_unavailable")?;
            if input.len() > 8 * 1024 * 1024 {
                return Err("vault_limit");
            }
            let parsed = serde_json::from_slice::<Profile>(&input);
            input.fill(0);
            let profile = parsed.map_err(|_| "vault_invalid")?;
            if profile.profile_id != args[3] {
                return Err("invalid_input");
            }
            vault.save(&profile)
        }
        "load" => {
            let profile = vault.load(&args[3])?;
            let mut output = serde_json::to_vec(&profile.keys).map_err(|_| "vault_invalid")?;
            let result = std::io::stdout()
                .write_all(&output)
                .map_err(|_| "vault_unavailable");
            output.fill(0);
            result
        }
        _ => Err("invalid_input"),
    }
}
fn installation_fixture(id: &str) -> Profile {
    Profile {
        version: 1,
        profile_id: id.to_owned(),
        name: "CI TEST Profil".into(),
        api_version: ApiVersion::V3,
        role: SessionRole::OnlineService,
        client_id: "ci-checkpoint-only".into(),
        client_secret: "not-an-oauth-credential".into(),
        keys: vec![],
        defaults: ProfileDefaults {
            source_destination: None,
            receiver_destination: Some("33333333-3333-4333-8333-333333333333".into()),
        },
    }
}
fn main() {
    if let Err(code) = run() {
        // Only static vault/protocol error codes; never profile input or OS diagnostics.
        eprintln!("protected_checkpoint_failed:{code}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installation_fixture_obeys_product_validation_and_has_no_private_keys() {
        let profile = installation_fixture("11111111-1111-4111-8111-111111111111");
        profile.validate().unwrap();
        assert_eq!(profile.name, "CI TEST Profil");
        assert!(profile.keys.is_empty());
        assert!(installation_fixture("../outside").validate().is_err());
    }
}
