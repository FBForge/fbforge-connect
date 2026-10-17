//! CI-only checkpoint bridge using the actual product vault. Not part of the desktop bundle.
//! Private archive JSON travels through pipes; the on-disk representation is always Windows DPAPI.
use fit_connect_native_contracts::vault::{Profile, Vault};
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
fn main() {
    if let Err(code) = run() {
        // Only fixed symbolic codes escape this helper; never echo input or serde errors.
        eprintln!("protected_checkpoint_failed:{code}");
        std::process::exit(1);
    }
}
