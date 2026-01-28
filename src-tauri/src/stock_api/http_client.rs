use std::time::Duration;
use tokio::sync::Mutex;
use std::sync::Arc;

static HTTP_CLIENT: tokio::sync::OnceCell<Arc<Mutex<Option<reqwest::Client>>>> = tokio::sync::OnceCell::const_new();

async fn create_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(20))
        .pool_idle_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(2)
        .build()
        .map_err(|e| format!("Client error: {}", e))
}

pub async fn http_client() -> Result<reqwest::Client, String> {
    let client_guard = HTTP_CLIENT.get_or_init(|| async {
        Arc::new(Mutex::new(None))
    }).await;
    
    let mut guard = client_guard.lock().await;
    if let Some(ref client) = *guard {
        Ok(client.clone())
    } else {
        let client = create_client().await?;
        *guard = Some(client.clone());
        Ok(client)
    }
}

pub async fn reset_http_client() {
    if let Some(client_guard) = HTTP_CLIENT.get() {
        let mut guard = client_guard.lock().await;
        *guard = None;
    }
}

pub fn is_connection_error(error: &str) -> bool {
    error.contains("connection closed") || 
    error.contains("Connection reset") ||
    error.contains("Broken pipe") ||
    error.contains("Network unreachable") ||
    error.contains("No route to host")
}
