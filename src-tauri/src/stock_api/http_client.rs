use std::time::Duration;
use tokio::sync::OnceCell;

static HTTP_CLIENT: OnceCell<reqwest::Client> = OnceCell::const_new();

pub async fn http_client() -> Result<&'static reqwest::Client, String> {
    HTTP_CLIENT
        .get_or_try_init(|| async {
            reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .timeout(Duration::from_secs(20))
                .build()
                .map_err(|e| format!("Client error: {}", e))
        })
        .await
}
