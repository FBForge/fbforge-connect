//! Versioned portable encryption. Passwords and private payloads never enter diagnostic records.
use ring::{
    aead, pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use std::num::NonZeroU32;
const MAGIC: &[u8] = b"FBForge Connect destination backup v1\n";
const ITERATIONS: u32 = 600_000;
pub const MAX_PLAIN: usize = 4 * 1024 * 1024;
pub const MAX_FILE: usize = MAX_PLAIN + 256;

pub fn random_id() -> Result<String, &'static str> {
    let mut bytes = [0u8; 16];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| "backup_unavailable")?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let h: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    ))
}
fn key(password: &str, salt: &[u8]) -> Result<aead::LessSafeKey, &'static str> {
    if password.chars().count() < 12
        || password.len() > 1024
        || password.chars().any(char::is_control)
    {
        return Err("backup_password_invalid");
    }
    let mut derived = [0u8; 32];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(ITERATIONS).unwrap(),
        salt,
        password.as_bytes(),
        &mut derived,
    );
    let value =
        aead::UnboundKey::new(&aead::AES_256_GCM, &derived).map_err(|_| "backup_unavailable");
    derived.fill(0);
    value.map(aead::LessSafeKey::new)
}
pub fn encrypt(plain: &[u8], password: &str) -> Result<Vec<u8>, &'static str> {
    if plain.is_empty() || plain.len() > MAX_PLAIN {
        return Err("backup_invalid");
    }
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    let rng = SystemRandom::new();
    rng.fill(&mut salt).map_err(|_| "backup_unavailable")?;
    rng.fill(&mut nonce).map_err(|_| "backup_unavailable")?;
    let key = key(password, &salt)?;
    let mut header = MAGIC.to_vec();
    header.extend_from_slice(&salt);
    header.extend_from_slice(&nonce);
    let mut cipher = plain.to_vec();
    let outcome = key.seal_in_place_append_tag(
        aead::Nonce::assume_unique_for_key(nonce),
        aead::Aad::from(&header),
        &mut cipher,
    );
    if outcome.is_err() {
        cipher.fill(0);
        return Err("backup_unavailable");
    }
    header.extend_from_slice(&cipher);
    cipher.fill(0);
    Ok(header)
}
pub fn decrypt(file: &[u8], password: &str) -> Result<Vec<u8>, &'static str> {
    let header = MAGIC.len() + 28;
    if file.len() > MAX_FILE || file.len() <= header + 16 || !file.starts_with(MAGIC) {
        return Err("backup_invalid");
    }
    let key = key(password, &file[MAGIC.len()..MAGIC.len() + 16])?;
    let nonce: [u8; 12] = file[MAGIC.len() + 16..header]
        .try_into()
        .map_err(|_| "backup_invalid")?;
    let mut plain = file[header..].to_vec();
    match key.open_in_place(
        aead::Nonce::assume_unique_for_key(nonce),
        aead::Aad::from(&file[..header]),
        &mut plain,
    ) {
        Ok(value) => {
            let size = value.len();
            plain.truncate(size);
            Ok(plain)
        }
        Err(_) => {
            plain.fill(0);
            Err("backup_unlock_failed")
        }
    }
}
