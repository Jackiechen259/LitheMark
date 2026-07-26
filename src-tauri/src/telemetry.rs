pub fn init() {
    if tracing_subscriber::fmt::try_init().is_err() {
        tracing::debug!("tracing subscriber was already initialized");
    }
}
