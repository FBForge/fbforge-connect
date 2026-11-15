//! A Keychain key with an immutable public identity in Application Support.
//! Creating another key after losing the original is deliberately forbidden.
use core_foundation::data::CFData;
use ring::rand::{SecureRandom, SystemRandom};
use security_framework::{
    item::{ItemAddOptions, ItemAddValue, ItemClass},
    passwords::{delete_generic_password, generic_password, PasswordOptions},
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::Path,
    sync::{Mutex, OnceLock},
};
static ID: OnceLock<[u8; 32]> = OnceLock::new();
static ROOT: OnceLock<std::path::PathBuf> = OnceLock::new();
static INITIALIZE: Mutex<()> = Mutex::new(());
const SERVICE: &str = "de.fbforge.connect.vault.v1";
fn account(id: &[u8; 32]) -> String {
    id.iter().map(|v| format!("{v:02x}")).collect()
}
fn failure(error: security_framework::base::Error) -> &'static str {
    match error.code() {
        -25300 => "vault_key_missing",
        -25293 | -25308 => "vault_locked",
        -128 | -25291 => "vault_access_denied",
        _ => "vault_unavailable",
    }
}
fn key(id: &[u8; 32]) -> Result<Vec<u8>, &'static str> {
    let mut key = generic_password(PasswordOptions::new_generic_password(SERVICE, &account(id)))
        .map_err(failure)?;
    if key.len() != 32 {
        key.fill(0);
        return Err("vault_invalid");
    }
    Ok(key)
}
pub fn initialize(directory: &Path) -> Result<(), &'static str> {
    let _ = ROOT.set(directory.to_path_buf());
    let _guard = INITIALIZE.lock().map_err(|_| "vault_unavailable")?;
    if ID.get().is_some() {
        return Ok(());
    }
    let path = directory.join("vault-key-v1.id");
    let id = if path.try_exists().map_err(|_| "vault_unavailable")? {
        let data = super::super::read_bounded(&path, 32)?;
        data.try_into().map_err(|_| "vault_invalid")?
    } else {
        // A missing identity is safe to create only in a fresh, empty application directory.
        fs::create_dir_all(directory).map_err(|_| "vault_unavailable")?;
        if fs::read_dir(directory)
            .map_err(|_| "vault_unavailable")?
            .next()
            .is_some()
        {
            return Err("vault_key_missing");
        }
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
            .map_err(|_| "vault_unavailable")?;
        let mut id = [0; 32];
        let mut secret = [0; 32];
        let rng = SystemRandom::new();
        rng.fill(&mut id).map_err(|_| "vault_unavailable")?;
        rng.fill(&mut secret).map_err(|_| "vault_unavailable")?;
        let result = ItemAddOptions::new(ItemAddValue::Data {
            class: ItemClass::generic_password(),
            data: CFData::from_buffer(&secret),
        })
        .set_service(SERVICE)
        .set_account_name(account(&id))
        .set_label("FBForge Connect – lokaler Schutzschlüssel")
        .add();
        secret.fill(0);
        result.map_err(failure)?;
        let temp = directory.join(format!(".vault-{}.pending", account(&id)));
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&temp)
                .map_err(|_| "vault_unavailable")?;
            file.write_all(&id).map_err(|_| "vault_unavailable")?;
            file.sync_all().map_err(|_| "vault_unavailable")?;
            // hard_link creates the identity atomically and never replaces a competing writer.
            fs::hard_link(&temp, &path).map_err(|_| "vault_unavailable")?;
            fs::File::open(directory)
                .and_then(|f| f.sync_all())
                .map_err(|_| "vault_unavailable")?;
            Ok(())
        })();
        let _ = fs::remove_file(&temp);
        if let Err(error) = result {
            // Do not delete a key after its identity was linked, even if directory sync failed.
            if !path.exists() {
                let _ = delete_generic_password(SERVICE, &account(&id));
            }
            return Err(error);
        }
        id
    };
    let mut secret = key(&id)?;
    secret.fill(0);
    ID.set(id).map_err(|_| "vault_unavailable")
}
fn identity() -> Result<&'static [u8; 32], &'static str> {
    #[cfg(test)]
    if ID.get().is_none() {
        initialize(
            &std::env::temp_dir().join(format!("fbforge-keychain-tests-{}", std::process::id())),
        )?;
    }
    if ID.get().is_none() {
        if let Some(root) = ROOT.get() {
            initialize(root)?;
        }
    }
    ID.get().ok_or("vault_unavailable")
}
pub fn transform_with_purpose(
    bytes: &[u8],
    encrypt: bool,
    purpose: &[u8],
) -> Result<Vec<u8>, &'static str> {
    let id = identity()?;
    let mut secret = key(id)?;
    let result = super::super::payload::transform(bytes, encrypt, purpose, &secret, id);
    secret.fill(0);
    result
}
pub fn encrypt(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
    transform_with_purpose(bytes, true, b"FIT-Connect Test-Client / user profile / v1")
}
pub fn decrypt(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
    transform_with_purpose(bytes, false, b"FIT-Connect Test-Client / user profile / v1")
}
pub fn replace(source: &Path, destination: &Path) -> Result<(), &'static str> {
    fs::rename(source, destination).map_err(|_| "vault_unavailable")?;
    if let Some(parent) = destination.parent() {
        fs::File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(|_| "vault_unavailable")?;
    }
    Ok(())
}
