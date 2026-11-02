//! Native-owned update transitions. Only verified bytes may enter `downloaded`.
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub configured: bool,
    pub supported: bool,
    pub phase: &'static str,
    pub version: Option<String>,
    pub notes: String,
    pub downloaded: usize,
    pub total: Option<u64>,
}
pub(crate) struct Pending<R> {
    pub status: Status,
    release: Option<R>,
    bytes: Option<Vec<u8>>,
}
impl<R: Clone> Pending<R> {
    pub fn new(configured: bool, supported: bool) -> Self {
        Self {
            status: Status {
                configured,
                supported,
                phase: "idle",
                version: None,
                notes: String::new(),
                downloaded: 0,
                total: None,
            },
            release: None,
            bytes: None,
        }
    }
    pub fn begin_check(&mut self) -> Result<(), &'static str> {
        if !self.status.supported {
            return Err("update_platform_unsupported");
        }
        if !self.status.configured {
            return Err("update_not_configured");
        }
        if matches!(self.status.phase, "checking" | "downloading" | "installing") {
            return Err("update_busy");
        }
        *self = Self::new(self.status.configured, self.status.supported);
        self.status.phase = "checking";
        Ok(())
    }
    pub fn checked(
        &mut self,
        result: Result<Option<(R, String, String)>, &'static str>,
    ) -> Result<Status, &'static str> {
        self.status.phase = "idle";
        match result? {
            Some((release, version, notes)) => {
                self.release = Some(release);
                self.status.version = Some(version);
                self.status.notes = notes;
                self.status.phase = "available";
            }
            None => self.status.phase = "current",
        }
        Ok(self.status.clone())
    }
    pub fn begin_download(&mut self, version: &str) -> Result<R, &'static str> {
        let release = self.ready("available", version)?;
        self.status.phase = "downloading";
        self.status.downloaded = 0;
        self.status.total = None;
        Ok(release)
    }
    pub fn downloaded(
        &mut self,
        verified: Result<Vec<u8>, &'static str>,
    ) -> Result<Status, &'static str> {
        self.status.phase = "available";
        self.bytes = None;
        self.bytes = Some(verified?);
        self.status.phase = "downloaded";
        Ok(self.status.clone())
    }
    pub fn begin_install(&mut self, version: &str) -> Result<R, &'static str> {
        let release = self.ready("downloaded", version)?;
        if self.bytes.is_none() {
            return Err("update_not_ready");
        }
        self.status.phase = "installing";
        Ok(release)
    }
    pub fn take_install_bytes(&mut self) -> Result<Vec<u8>, &'static str> {
        if self.status.phase != "installing" {
            return Err("update_not_ready");
        }
        self.bytes.take().ok_or("update_not_ready")
    }
    pub fn installed(&mut self, result: Result<(), &'static str>) -> Result<Status, &'static str> {
        self.status.phase = if self.bytes.is_some() {
            "downloaded"
        } else {
            "available"
        };
        result?;
        Ok(self.status.clone())
    }
    fn ready(&self, phase: &str, version: &str) -> Result<R, &'static str> {
        if self.status.phase != phase || self.status.version.as_deref() != Some(version) {
            return Err("update_not_ready");
        }
        self.release.clone().ok_or("update_not_ready")
    }
}
#[cfg(test)]
#[path = "update_state_tests.rs"]
mod tests;
