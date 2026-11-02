//! Installation preflight shared with native regression tests. No engine shutdown before consent and durable keys.
use std::future::Future;
pub(crate) trait Context: Sync {
    fn idle(&self) -> impl Future<Output = bool> + Send;
    fn confirm(&self, version: &str) -> impl Future<Output = Result<bool, &'static str>> + Send;
    fn checkpoint(&self) -> impl Future<Output = Result<(), &'static str>> + Send;
}
pub(crate) async fn prepare(context: &impl Context, version: &str) -> Result<(), &'static str> {
    if !context.idle().await {
        return Err("update_activity_pending");
    }
    if !context.confirm(version).await? {
        return Err("update_cancelled");
    }
    context.checkpoint().await
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    struct Fake {
        events: Mutex<Vec<String>>,
        busy: bool,
        confirm: Result<bool, &'static str>,
        checkpoint: Result<(), &'static str>,
    }
    impl Context for Fake {
        async fn idle(&self) -> bool {
            self.events.lock().unwrap().push("idle".into());
            !self.busy
        }
        async fn confirm(&self, version: &str) -> Result<bool, &'static str> {
            self.events
                .lock()
                .unwrap()
                .push(format!("confirm:{version}"));
            self.confirm
        }
        async fn checkpoint(&self) -> Result<(), &'static str> {
            self.events.lock().unwrap().push("checkpoint".into());
            self.checkpoint
        }
    }
    #[tokio::test]
    async fn busy_work_cancelled_consent_and_failed_checkpoints_never_authorize_shutdown_or_install(
    ) {
        for (busy, confirm, checkpoint, error, expected) in [
            (
                true,
                Ok(true),
                Ok(()),
                Some("update_activity_pending"),
                vec!["idle"],
            ),
            (
                false,
                Ok(false),
                Ok(()),
                Some("update_cancelled"),
                vec!["idle", "confirm:0.4.0"],
            ),
            (
                false,
                Err("update_unavailable"),
                Ok(()),
                Some("update_unavailable"),
                vec!["idle", "confirm:0.4.0"],
            ),
            (
                false,
                Ok(true),
                Err("vault_unavailable"),
                Some("vault_unavailable"),
                vec!["idle", "confirm:0.4.0", "checkpoint"],
            ),
            (
                false,
                Ok(true),
                Ok(()),
                None,
                vec!["idle", "confirm:0.4.0", "checkpoint"],
            ),
        ] {
            let fake = Fake {
                events: Mutex::new(vec![]),
                busy,
                confirm,
                checkpoint,
            };
            let mut installed = false;
            let result = async {
                prepare(&fake, "0.4.0").await?;
                installed = true;
                Ok::<_, &'static str>(())
            }
            .await;
            assert_eq!(result.err(), error);
            assert_eq!(installed, error.is_none());
            assert_eq!(*fake.events.lock().unwrap(), expected);
        }
    }
}
