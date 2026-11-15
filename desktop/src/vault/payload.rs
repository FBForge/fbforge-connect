//! Versioned authenticated macOS payloads. The key never crosses the native boundary.
use ring::{
    aead,
    rand::{SecureRandom, SystemRandom},
};
const MAGIC: &[u8] = b"FBForge macOS vault v1\0";
const LIMIT: usize = 8 * 1024 * 1024;
pub fn transform(
    bytes: &[u8],
    encrypt: bool,
    purpose: &[u8],
    key: &[u8],
    id: &[u8; 32],
) -> Result<Vec<u8>, &'static str> {
    if bytes.is_empty() || bytes.len() > LIMIT + 128 || purpose.is_empty() || purpose.len() > 4096 {
        return Err("vault_invalid");
    }
    let key = aead::UnboundKey::new(&aead::AES_256_GCM, key).map_err(|_| "vault_invalid")?;
    let key = aead::LessSafeKey::new(key);
    let mut aad = MAGIC.to_vec();
    aad.extend(id);
    aad.extend(purpose);
    if encrypt {
        if bytes.len() > LIMIT {
            return Err("vault_invalid");
        }
        let mut nonce = [0; 12];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| "vault_unavailable")?;
        let mut protected = bytes.to_vec();
        key.seal_in_place_append_tag(
            aead::Nonce::assume_unique_for_key(nonce),
            aead::Aad::from(&aad),
            &mut protected,
        )
        .map_err(|_| "vault_unavailable")?;
        let mut result = MAGIC.to_vec();
        result.extend(id);
        result.extend(nonce);
        result.extend(protected);
        Ok(result)
    } else {
        let start = MAGIC.len() + 32;
        if !bytes.starts_with(MAGIC)
            || bytes.len() <= start + 12 + 16
            || bytes.get(MAGIC.len()..start) != Some(id.as_slice())
        {
            return Err("vault_invalid");
        }
        let nonce: [u8; 12] = bytes[start..start + 12]
            .try_into()
            .map_err(|_| "vault_invalid")?;
        let mut protected = bytes[start + 12..].to_vec();
        let result = key
            .open_in_place(
                aead::Nonce::assume_unique_for_key(nonce),
                aead::Aad::from(&aad),
                &mut protected,
            )
            .map(|plain| plain.to_vec())
            .map_err(|_| "vault_invalid");
        protected.fill(0);
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authentication_binds_purpose_key_identity_and_every_payload_byte() {
        let key = [17; 32];
        let id = [31; 32];
        let plain = b"synthetic-private-marker";
        let protected = transform(plain, true, b"profile/TEST/v3", &key, &id).unwrap();
        assert_eq!(
            transform(&protected, false, b"profile/TEST/v3", &key, &id).unwrap(),
            plain
        );
        assert_ne!(
            protected,
            transform(plain, true, b"profile/TEST/v3", &key, &id).unwrap()
        );
        assert!(!protected.windows(plain.len()).any(|part| part == plain));
        for purpose in [
            b"profile/PROD/v3".as_slice(),
            b"profile/TEST/v2",
            b"other/TEST/v3",
        ] {
            assert!(transform(&protected, false, purpose, &key, &id).is_err());
        }
        assert!(transform(&protected, false, b"profile/TEST/v3", &[18; 32], &id).is_err());
        assert!(transform(&protected, false, b"profile/TEST/v3", &key, &[32; 32]).is_err());
        for i in 0..protected.len() {
            let mut changed = protected.clone();
            changed[i] ^= 1;
            assert!(transform(&changed, false, b"profile/TEST/v3", &key, &id).is_err());
        }
        assert!(transform(plain, false, b"profile", &key, &id).is_err());
        assert!(transform(&[], true, b"profile", &key, &id).is_err());
        assert!(transform(&vec![0; LIMIT + 1], true, b"profile", &key, &id).is_err());
    }
}
