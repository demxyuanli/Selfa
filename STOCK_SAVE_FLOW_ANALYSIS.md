# Stock Save Flow Analysis - 股票保存流程分析

## 1. 正常保存流程（用户主动添加）

### 1.1 前端流程
- **位置**: `src/components/LeftSidebar.tsx`
- **方法**: `handleAddToFavorites(stock: StockInfo)`
- **调用**: `invoke("add_stock_to_group", { stock, groupName: null })`
- **数据**: `StockInfo { symbol, name, exchange }` ✅ **正确传递完整信息**

### 1.2 搜索API返回
- **位置**: `src-tauri/src/stock_api.rs`
- **方法**: `search_stocks_by_query(query: &str)`
- **返回**: `Vec<StockInfo>`
- **字段映射**:
  - `Code` → `symbol`: ✅ 正确
  - `Name` → `name`: ✅ 正确
  - `Market` → `exchange`: ✅ 正确（1=SH, 其他=SZ）

### 1.3 后端保存
- **位置**: `src-tauri/src/database.rs`
- **方法**: `add_stock(&self, stock: &StockInfo, group_id: Option<i64>)`
- **保存字段**:
  - `symbol`: ✅ 从 `stock.symbol` 获取
  - `name`: ✅ 从 `stock.name` 获取
  - `exchange`: ✅ 从 `stock.exchange` 获取
- **逻辑**: 
  - 如果股票存在：更新 name, exchange, group_id，并设置 visible = 1
  - 如果股票不存在：插入新记录，visible = 1
- **状态**: ✅ **正确保存所有字段**

## 2. 自动创建流程（潜在问题）

### 2.1 自动创建场景
- **位置**: `src-tauri/src/database.rs`
- **方法**: `ensure_stock_exists(symbol: &str)`
- **调用位置**:
  - `save_time_series` - 保存分时数据时
  - `save_kline` - 保存K线数据时

### 2.2 问题分析
```rust
let name = match symbol {
    "000001" => "上证指数",
    "399001" => "深证成指",
    "399006" => "创业板指",
    _ => symbol,  // ⚠️ 普通股票使用 symbol 作为 name
};
```

**问题**: 
- 如果用户先获取了股票的 K线/分时数据（但没有先添加到收藏）
- `ensure_stock_exists` 会创建股票记录
- 此时 `name` 字段会被设置为 `symbol`（股票代码），而不是真实名称

### 2.3 影响范围
- **场景**: 首次通过 `get_stock_history` 或 `get_time_series` 获取数据时
- **结果**: 如果股票不存在，会自动创建，但 name = symbol
- **后续**: 如果用户之后通过正常方式添加股票，`add_stock` 会更新 name 为正确值

## 3. 对比分析问题（已修复）

### 3.1 问题描述
- **位置**: `src/components/CompareAnalysis.tsx`
- **问题**: 初始化当前股票时 `name: ""`（空字符串）
- **状态**: ✅ **已修复** - 现在接收 `currentName` 参数

## 4. 数据流程图

```
用户搜索股票
  ↓
search_stocks_by_query (API)
  ↓
返回 StockInfo { symbol, name, exchange } ✅
  ↓
前端调用 add_stock_to_group
  ↓
add_stock(&stock) ✅
  ↓
保存到数据库: symbol ✅, name ✅, exchange ✅

---

用户获取K线/分时数据
  ↓
save_kline / save_time_series
  ↓
ensure_stock_exists(symbol) ⚠️
  ↓
自动创建股票: symbol ✅, name = symbol ⚠️, exchange ✅
  ↓
后续用户添加股票
  ↓
add_stock 会更新 name ✅
```

## 5. 当前状态总结

| 保存路径 | Symbol | Name | Exchange | 状态 |
|---------|--------|------|----------|------|
| 用户搜索后添加 | ✅ | ✅ | ✅ | ✅ 正确 |
| 用户主动添加 | ✅ | ✅ | ✅ | ✅ 正确 |
| 自动创建（K线） | ✅ | ⚠️ | ✅ | ⚠️ Name 可能不正确 |
| 自动创建（分时） | ✅ | ⚠️ | ✅ | ⚠️ Name 可能不正确 |

## 6. 问题和解决方案

### 6.1 问题1: `ensure_stock_exists` 名称不正确
**问题**: 自动创建时 name = symbol
**影响**: 如果用户先获取数据再添加，初始名称是代码
**解决方案**: 
- 方案A: 修改 `ensure_stock_exists` 为异步方法，调用 `fetch_stock_quote` 获取名称
- 方案B: 在 `add_stock` 中总是更新名称（当前已实现）
- 方案C: 不允许自动创建，要求先添加股票

### 6.2 问题2: 对比分析中股票名称
**问题**: 已修复 ✅

## 7. 建议

1. ✅ **已实现**: `add_stock` 会更新已存在股票的 name
2. ⚠️ **可改进**: 考虑改进 `ensure_stock_exists` 以获取真实名称
3. ✅ **已验证**: 正常添加流程正确保存所有字段

## 8. 结论

**正常保存流程**: ✅ **完全正确** - symbol, name, exchange 都正确保存
**自动创建流程**: ⚠️ **部分正确** - name 初始可能不正确，但后续添加会修正

**总体评价**: 通过用户主动添加的方式保存股票时，所有字段都是正确的。如果通过自动创建，name 可能会暂时是代码，但后续添加时会自动更新为正确名称。
