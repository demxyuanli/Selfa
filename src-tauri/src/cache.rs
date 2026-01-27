use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use moka::future::Cache;
use crate::stock_api::{StockData, StockQuote};

pub struct StockCache {
    quotes: Cache<String, StockQuote>,
    time_series: Cache<String, Vec<StockData>>,
    history: Cache<String, Vec<StockData>>,
    
    quote_write_queue: Arc<RwLock<HashMap<String, StockQuote>>>,
    time_series_write_queue: Arc<RwLock<HashMap<String, Vec<StockData>>>>,
    history_write_queue: Arc<RwLock<HashMap<String, (String, Vec<StockData>)>>>,
    
    last_fetch_ts: Arc<RwLock<HashMap<String, u64>>>,
    fetch_state_write_queue: Arc<RwLock<HashMap<String, u64>>>,
}

impl StockCache {
    pub fn new() -> Self {
        let quotes_cache = Cache::builder()
            .time_to_live(Duration::from_secs(65))
            .build();
        
        let time_series_cache = Cache::builder()
            .time_to_live(Duration::from_secs(65))
            .build();
        
        let history_cache = Cache::builder()
            .time_to_live(Duration::from_secs(6 * 60 * 60))
            .build();
        
        Self {
            quotes: quotes_cache,
            time_series: time_series_cache,
            history: history_cache,
            quote_write_queue: Arc::new(RwLock::new(HashMap::new())),
            time_series_write_queue: Arc::new(RwLock::new(HashMap::new())),
            history_write_queue: Arc::new(RwLock::new(HashMap::new())),
            last_fetch_ts: Arc::new(RwLock::new(HashMap::new())),
            fetch_state_write_queue: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_quote(&self, symbol: &str) -> Option<StockQuote> {
        self.quotes.get(symbol).await
    }

    pub async fn set_quote(&self, symbol: String, quote: StockQuote) {
        self.quotes.insert(symbol.clone(), quote.clone()).await;
        
        let mut queue = self.quote_write_queue.write().await;
        queue.insert(symbol, quote);
    }

    pub async fn get_time_series(&self, symbol: &str) -> Option<Vec<StockData>> {
        self.time_series.get(symbol).await
    }

    pub async fn get_batch_time_series(&self, symbols: &[String]) -> HashMap<String, Vec<StockData>> {
        let mut result = HashMap::new();
        for symbol in symbols {
            if let Some(data) = self.time_series.get(symbol).await {
                result.insert(symbol.clone(), data);
            }
        }
        result
    }

    pub async fn set_time_series(&self, symbol: String, data: Vec<StockData>) {
        self.time_series.insert(symbol.clone(), data.clone()).await;
        
        let mut queue = self.time_series_write_queue.write().await;
        queue.insert(symbol, data);
    }

    pub async fn get_history(&self, symbol: &str, period: &str) -> Option<Vec<StockData>> {
        let key = format!("{}:{}", symbol, period);
        self.history.get(&key).await
    }

    pub async fn set_history(&self, symbol: String, period: String, data: Vec<StockData>) {
        let key = format!("{}:{}", symbol, period);
        self.history.insert(key.clone(), data.clone()).await;
        
        let mut queue = self.history_write_queue.write().await;
        queue.insert(key, (period, data));
    }

    pub async fn get_pending_quotes(&self) -> HashMap<String, StockQuote> {
        let mut queue = self.quote_write_queue.write().await;
        std::mem::take(&mut *queue)
    }

    pub async fn get_pending_time_series(&self) -> HashMap<String, Vec<StockData>> {
        let mut queue = self.time_series_write_queue.write().await;
        std::mem::take(&mut *queue)
    }

    pub async fn get_pending_history(&self) -> HashMap<String, (String, Vec<StockData>)> {
        let mut queue = self.history_write_queue.write().await;
        std::mem::take(&mut *queue)
    }

    pub async fn get_pending_fetch_state_updates(&self) -> HashMap<String, u64> {
        let mut queue = self.fetch_state_write_queue.write().await;
        std::mem::take(&mut *queue)
    }

    pub async fn initialize_fetch_state(&self, state: HashMap<String, u64>) {
        let mut last_fetch = self.last_fetch_ts.write().await;
        for (k, v) in state {
            last_fetch.insert(k, v);
        }
    }

    pub async fn cleanup_expired(&self) {
        // moka automatically handles expired entries, so this is a no-op
        // Kept for API compatibility
    }

    fn now_unix_seconds() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    pub async fn should_fetch_from_network_with_policy(
        &self,
        symbol: &str,
        period: &str,
        min_interval_seconds: u64,
        require_minute_boundary: bool,
    ) -> bool {
        let key = format!("{}:{}", symbol, period);
        let now_ts = Self::now_unix_seconds();
        let last_ts = {
            let last_fetch = self.last_fetch_ts.read().await;
            last_fetch.get(&key).copied()
        };

        match (require_minute_boundary, last_ts) {
            (true, None) => true,
            (true, Some(ts)) => (now_ts / 60) > (ts / 60),
            (false, None) => true,
            (false, Some(ts)) => now_ts.saturating_sub(ts) >= min_interval_seconds,
        }
    }

    // Record network fetch time
    pub async fn record_fetch_time(&self, symbol: &str, period: &str) {
        let key = format!("{}:{}", symbol, period);
        let now_ts = Self::now_unix_seconds();
        let mut last_fetch = self.last_fetch_ts.write().await;
        last_fetch.insert(key.clone(), now_ts);
        let mut queue = self.fetch_state_write_queue.write().await;
        queue.insert(key, now_ts);
    }
}

impl Default for StockCache {
    fn default() -> Self {
        Self::new()
    }
}
