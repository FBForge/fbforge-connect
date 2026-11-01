//! Keep cancellation responsive while waiting for headers as well as response bodies.
use std::{
    future::Future,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
pub async fn wait<T>(
    cancelled: &AtomicBool,
    operation: impl Future<Output = T>,
) -> Result<T, &'static str> {
    tokio::pin!(operation);
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err("update_cancelled");
        }
        tokio::select! {
            value = &mut operation => return if cancelled.load(Ordering::Acquire) { Err("update_cancelled") } else { Ok(value) },
            _ = tokio::time::sleep(Duration::from_millis(50)) => {}
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn cancelling_a_stalled_headers_or_body_future_drops_it_promptly() {
        for _phase in ["headers", "body"] {
            let cancelled = AtomicBool::new(false);
            let task = async {
                tokio::time::sleep(Duration::from_millis(70)).await;
                cancelled.store(true, Ordering::Release);
            };
            let read = wait(&cancelled, std::future::pending::<()>());
            let (_, result) =
                tokio::join!(task, tokio::time::timeout(Duration::from_millis(300), read));
            assert_eq!(result.unwrap(), Err("update_cancelled"));
        }
    }
    #[tokio::test]
    async fn pre_cancelled_requests_do_not_start_and_completed_requests_return_their_result() {
        assert_eq!(
            wait(&AtomicBool::new(true), async { panic!("must not start") }).await,
            Err::<(), _>("update_cancelled")
        );
        assert_eq!(wait(&AtomicBool::new(false), async { 42 }).await, Ok(42));
    }
}
