use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
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
}

impl Default for StockCache {
    fn default() -> Self {
        Self::new()
    }
}
