use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
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
    
    // Track last network fetch time for each symbol (for non-trading hours rate limiting)
    last_fetch_time: Arc<RwLock<HashMap<String, Instant>>>,
}

impl StockCache {
    pub fn new() -> Self {
        let quotes_cache = Cache::builder()
            .time_to_live(Duration::from_secs(30))
            .build();
        
        let time_series_cache = Cache::builder()
            .time_to_live(Duration::from_secs(60))
            .build();
        
        let history_cache = Cache::builder()
            .time_to_live(Duration::from_secs(300))
            .build();
        
        Self {
            quotes: quotes_cache,
            time_series: time_series_cache,
            history: history_cache,
            quote_write_queue: Arc::new(RwLock::new(HashMap::new())),
            time_series_write_queue: Arc::new(RwLock::new(HashMap::new())),
            history_write_queue: Arc::new(RwLock::new(HashMap::new())),
            last_fetch_time: Arc::new(RwLock::new(HashMap::new())),
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

    pub async fn cleanup_expired(&self) {
        // moka automatically handles expired entries, so this is a no-op
        // Kept for API compatibility
    }

    // Check if enough time has passed since last fetch (for non-trading hours rate limiting)
    pub async fn should_fetch_from_network(&self, symbol: &str, period: &str, min_interval_seconds: u64) -> bool {
        let key = format!("{}:{}", symbol, period);
        let last_fetch = self.last_fetch_time.read().await;
        
        if let Some(last_time) = last_fetch.get(&key) {
            let elapsed = last_time.elapsed();
            elapsed.as_secs() >= min_interval_seconds
        } else {
            // First fetch, allow immediately
            true
        }
    }

    // Record network fetch time
    pub async fn record_fetch_time(&self, symbol: &str, period: &str) {
        let key = format!("{}:{}", symbol, period);
        let mut last_fetch = self.last_fetch_time.write().await;
        last_fetch.insert(key, Instant::now());
    }
}

impl Default for StockCache {
    fn default() -> Self {
        Self::new()
    }
}
