//! Bounded public destination documents and cryptographic random identifiers.
use ring::rand::{SecureRandom, SystemRandom};
pub const MAX_PLAIN: usize = 4 * 1024 * 1024;
pub const MAX_FILE: usize = MAX_PLAIN;
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
