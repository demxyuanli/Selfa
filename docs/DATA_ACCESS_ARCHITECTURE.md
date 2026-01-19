# Data Access Architecture

## Overview

This document describes the data access architecture of the stock analyzer application, including API calls, caching mechanisms, and database operations.

## Architecture Layers

### 1. API Layer (`src-tauri/src/stock_api/`)

The API layer provides functions to fetch data from external stock data providers (EastMoney API).

#### Main API Functions

- **`fetch_stock_quote(symbol: &str)`** - Fetches real-time stock quote
  - Endpoint: `http://push2.eastmoney.com/api/qt/stock/get`
  - Returns: `StockQuote` (price, volume, market cap, PE ratio, etc.)
  - Timeout: 5 seconds

- **`fetch_time_series(symbol: &str)`** - Fetches daily K-line data
  - Endpoint: `http://push2his.eastmoney.com/api/qt/stock/kline/get`
  - Returns: `Vec<StockData>` (up to 1200 days)
  - Fields: date, open, high, low, close, volume

- **`fetch_stock_history(symbol: &str, period: &str)`** - Fetches historical K-line data by period
  - Endpoint: `http://push2his.eastmoney.com/api/qt/stock/kline/get`
  - Periods: 5m, 30m, 60m, 120m, 5d, 1d, 1w, 1mo, 1y, 2y, 5y
  - Returns: `Vec<StockData>` (varies by period)

- **`search_stocks_by_query(query: &str)`** - Searches stocks by symbol or name
  - Endpoint: `http://push2.eastmoney.com/api/qt/suggest`
  - Returns: `Vec<StockInfo>` (symbol, name, exchange)

- **`fetch_all_a_stocks()`** - Fetches all A-share stocks list
  - Endpoint: `http://push2.eastmoney.com/api/qt/clist/get`
  - Returns: `Vec<StockInfo>` (complete stock list for cache)

### 2. Cache Layer (`src-tauri/src/cache.rs`)

In-memory cache using **moka** library - a high-performance caching library for Rust.

#### Cache Structure

```rust
pub struct StockCache {
    quotes: Cache<String, StockQuote>,      // TTL: 30 seconds
    time_series: Cache<String, Vec<StockData>>, // TTL: 60 seconds
    history: Cache<String, Vec<StockData>>,     // TTL: 300 seconds
    
    // Write queues for batch database writes
    quote_write_queue: Arc<RwLock<HashMap<String, StockQuote>>>,
    time_series_write_queue: Arc<RwLock<HashMap<String, Vec<StockData>>>>,
    history_write_queue: Arc<RwLock<HashMap<String, (String, Vec<StockData>)>>>,
}
```

**Library**: `moka` v0.12 with `future` feature for async support

#### Cache TTL Configuration

- **Quotes**: 30 seconds (frequently updated real-time data)
- **Time Series**: 60 seconds (daily data, less frequent updates)
- **History**: 300 seconds (5 minutes, historical data changes rarely)

#### Cache Operations

- **Read**: `cache.get(key).await` - Returns `Option<T>` (None if expired or missing)
- **Write**: `cache.insert(key, value).await` - Stores value with TTL + adds to write queue
- **Automatic Cleanup**: moka automatically handles expired entries (no manual cleanup needed)

### 3. Database Layer (`src-tauri/src/database.rs`)

SQLite database for persistent storage.

#### Database Tables

1. **`stocks`** - Stock basic information
   - Fields: id, symbol, name, exchange, group_id, sort_order, visible
   
2. **`stock_groups`** - Stock groups/categories
   - Fields: id, name, created_at, updated_at

3. **`stock_time_series`** - Daily K-line data
   - Fields: id, symbol, date, open, high, low, close, volume, created_at
   - Index: (symbol, date)

4. **`stock_kline`** - Historical K-line data by period
   - Fields: id, symbol, period, date, open, high, low, close, volume, created_at, updated_at
   - Index: (symbol, period, date)

5. **`stock_quotes`** - Stock quotes snapshot
   - Fields: symbol, name, price, change, change_percent, volume, market_cap, pe_ratio, turnover, high, low, open, previous_close, updated_at

6. **`stock_cache`** - Stock search cache (all A-shares)
   - Fields: symbol, name, exchange, updated_at
   - Index: name (for fast search)

7. **`stock_tags`** - Stock tags
   - Fields: id, name, color, created_at, updated_at

8. **`stock_tag_relations`** - Many-to-many relation between stocks and tags

9. **`price_alerts`** - Price alert settings
   - Fields: id, symbol, threshold_price, direction, enabled, triggered

10. **`portfolio_positions`** - Portfolio positions
    - Fields: id, symbol, name, quantity, avg_cost, current_price

11. **`portfolio_transactions`** - Portfolio transaction history
    - Fields: id, symbol, transaction_type, quantity, price, amount, commission, transaction_date, notes

## Data Access Flow

### 1. Get Stock Quote (`get_stock_quote`)

```
Request
  ↓
Check Memory Cache (TTL: 30s)
  ├─ Hit → Return cached quote
  └─ Miss → Call API (fetch_stock_quote)
            ├─ Success → Update cache + Add to write queue → Return
            └─ Error → Return error
```

**Note**: Database is not checked for quotes (real-time data only in cache/API)

### 2. Get Time Series (`get_time_series`)

```
Request
  ↓
Check Memory Cache (TTL: 60s)
  ├─ Hit → Return cached data
  └─ Miss → Call API (fetch_time_series)
            ├─ Success → Update cache + Add to write queue → Return
            └─ Error → Check Database
                        ├─ Found → Update cache → Return
                        └─ Not Found → Return error/empty
```

### 3. Get Stock History (`get_stock_history`)

```
Request
  ↓
Check Memory Cache (TTL: 300s)
  ├─ Hit → Return cached data
  └─ Miss → Get latest date from Database
            ↓
            Call API (fetch_stock_history)
            ├─ Success → Merge with DB data (only new records) → Update cache + Add to write queue → Return
            └─ Error → Return DB data (if available)
```

### 4. Search Stocks (`search_stocks`)

```
Request
  ↓
Search Database Cache (stock_cache table)
  ├─ Found → Return results
  └─ Not Found → Call API (search_stocks_by_query) → Return
```

**Note**: Stock cache table is updated periodically (every 24 hours) via `refresh_stock_cache`

### 5. Get All Favorites Quotes (`get_all_favorites_quotes`)

```
Request
  ↓
Get stocks from Database (get_stocks_by_group)
  ↓
For each stock:
  ├─ Check Memory Cache
  │  ├─ Hit → Use cached quote
  │  └─ Miss → Fetch from API (concurrent tasks)
  │            └─ Update cache + Add to write queue
  ↓
Return combined results
```

## Background Tasks

### 1. Batch Database Write Task (Every 30 seconds)

```
Interval: 30 seconds
Process:
  1. Get pending quotes from write queue → Save to stock_quotes table
  2. Get pending time_series from write queue → Save to stock_time_series table
  3. Get pending history from write queue → Save to stock_kline table
```

**Purpose**: Reduce database write frequency, improve performance

### 2. Cache Cleanup Task (Every 5 minutes)

```
Interval: 300 seconds
Process:
  No-op (moka automatically handles expired entries)
```

**Note**: moka library automatically evicts expired entries, so manual cleanup is not needed. The task is kept for API compatibility but does nothing.

### 3. Stock Cache Refresh Task (Every 24 hours)

```
Interval: 24 hours
Process:
  1. Call fetch_all_a_stocks() API
  2. Update stock_cache table
  3. Used for fast stock search
```

**Purpose**: Keep stock search cache up-to-date

## Data Flow Diagram

```
┌─────────────┐
│   Frontend  │
│  (React)    │
└──────┬──────┘
       │ invoke Tauri command
       ↓
┌─────────────────────────────────────┐
│      Tauri Command Handler          │
│  (main.rs: get_stock_quote, etc.)   │
└──────┬──────────────────────────────┘
       │
       ├─────────────────┬──────────────────┐
       ↓                 ↓                  ↓
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│   Cache     │   │     API      │   │  Database   │
│  (Memory)   │   │  (External)  │   │  (SQLite)   │
└─────────────┘   └──────────────┘   └─────────────┘
       │                 │                  │
       │                 │                  │
       └─────────────────┴──────────────────┘
                         │
                         ↓
              ┌──────────────────────┐
              │  Background Tasks     │
              │  - Batch DB Write     │
              │  - Cache Cleanup      │
              │  - Cache Refresh      │
              └──────────────────────┘
```

## Key Design Principles

1. **Cache-First Strategy**: Always check memory cache first for fast response
2. **Graceful Degradation**: If API fails, fallback to database when available
3. **Batch Writes**: Reduce database I/O by batching writes every 30 seconds
4. **TTL Management**: Different TTL for different data types based on update frequency
5. **Concurrent Fetching**: Use async tasks for parallel API calls (e.g., favorites quotes)
6. **Incremental Updates**: For history data, only fetch new records after latest DB date

## Performance Considerations

- **Memory Cache**: Fast access, but limited by memory size
- **Database Cache**: Persistent, but slower than memory
- **API Calls**: Slowest, but provides most up-to-date data
- **Write Queue**: Reduces database lock contention
- **Indexes**: Database indexes on (symbol, date) for fast queries

## Error Handling

- **API Errors**: Logged, fallback to database if available
- **Database Errors**: Logged, return error to frontend
- **Cache Errors**: Silent (cache miss treated as no cache)

## Future Improvements

1. **Cache Size Limits**: Implement LRU eviction when cache grows too large
2. **Retry Logic**: Add exponential backoff for API failures
3. **Connection Pooling**: Optimize database connection management
4. **Compression**: Compress cached data to reduce memory usage
5. **Metrics**: Add metrics for cache hit/miss rates, API latency, etc.
