#[cfg(windows)]
use super::MAX_FILE;
use std::path::Path;
#[cfg(not(windows))]
pub(crate) mod platform {
    use super::*;
    pub fn transform_with_purpose(_: &[u8], _: bool, _: &[u8]) -> Result<Vec<u8>, &'static str> {
        Err("vault_unsupported")
    }
    pub fn encrypt(_: &[u8]) -> Result<Vec<u8>, &'static str> {
        Err("vault_unsupported")
    }
    pub fn decrypt(_: &[u8]) -> Result<Vec<u8>, &'static str> {
        Err("vault_unsupported")
    }
    pub fn replace(_: &Path, _: &Path) -> Result<(), &'static str> {
        Err("vault_unsupported")
    }
}
#[cfg(windows)]
pub(crate) mod platform {
    use super::*;
    use std::{ffi::c_void, os::windows::ffi::OsStrExt, ptr};
    #[repr(C)]
    struct Blob {
        size: u32,
        data: *mut u8,
    }
    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            input: *const Blob,
            description: *const u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const Blob,
            description: *mut *mut u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    pub fn transform_with_purpose(
        bytes: &[u8],
        encrypt: bool,
        purpose: &[u8],
    ) -> Result<Vec<u8>, &'static str> {
        if bytes.is_empty() || bytes.len() > MAX_FILE {
            return Err("vault_invalid");
        }
        let input = Blob {
            size: bytes.len() as u32,
            data: bytes.as_ptr() as *mut u8,
        };
        let entropy = Blob {
            size: purpose.len() as u32,
            data: purpose.as_ptr() as *mut u8,
        };
        let mut output = Blob {
            size: 0,
            data: ptr::null_mut(),
        };
        // UI forbidden; absence of LOCAL_MACHINE keeps the vault bound to this Windows user.
        let success = unsafe {
            if encrypt {
                CryptProtectData(
                    &input,
                    ptr::null(),
                    &entropy,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    ptr::null_mut(),
                    &entropy,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut output,
                )
            }
        };
        if success == 0 {
            return Err("vault_unavailable");
        }
        let result = if output.data.is_null() || output.size as usize > MAX_FILE {
            Err("vault_invalid")
        } else {
            Ok(unsafe { std::slice::from_raw_parts(output.data, output.size as usize) }.to_vec())
        };
        if !output.data.is_null() {
            unsafe {
                std::slice::from_raw_parts_mut(output.data, output.size as usize).fill(0);
                LocalFree(output.data.cast());
            }
        }
        result
    }
    pub fn encrypt(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        transform_with_purpose(bytes, true, b"FIT-Connect Test-Client / user profile / v1")
    }
    pub fn decrypt(bytes: &[u8]) -> Result<Vec<u8>, &'static str> {
        transform_with_purpose(bytes, false, b"FIT-Connect Test-Client / user profile / v1")
    }
    pub fn replace(source: &Path, destination: &Path) -> Result<(), &'static str> {
        let from: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        // REPLACE_EXISTING | WRITE_THROUGH, source and destination reside in the same directory.
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 1 | 8) } == 0 {
            Err("vault_unavailable")
        } else {
            Ok(())
        }
    }
}

pub use platform::*;
