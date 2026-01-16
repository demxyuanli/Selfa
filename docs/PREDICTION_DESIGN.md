# Stock Prediction Feature Design

## 1. Interface Location (界面位置)

### 1.1 Main Location
- **Position**: Below the AnalysisToolbar, as a collapsible panel
- **Trigger**: Click "预测" button in AnalysisToolbar
- **Layout**: 
  - Upper section: Prediction settings and parameters
  - Middle section: Prediction chart (overlay on K-line chart or separate chart)
  - Lower section: Prediction results table with confidence scores

### 1.2 Alternative Location
- **Option 1**: Right sidebar panel (when expanded)
- **Option 2**: Modal dialog triggered from AnalysisToolbar
- **Option 3**: Bottom panel below K-line chart (similar to period selector)

### 1.3 Recommended Layout
```
┌─────────────────────────────────────────┐
│ AnalysisToolbar [预测] [指标] [趋势]    │
├─────────────────────────────────────────┤
│ Prediction Panel (when active)         │
│ ┌─────────────────────────────────────┐ │
│ │ Method: [Linear Regression ▼]      │ │
│ │ Period: [5 days] [10 days] [30 days]│ │
│ │ [Generate Prediction]               │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Prediction Chart (overlay)          │ │
│ │ K-line + Predicted trend line       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Prediction Results Table            │ │
│ │ Date | Price | Confidence | Signal │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## 2. Algorithm Scheme (算法方案)

### 2.1 Linear Regression (线性回归)
- **Description**: Simple linear regression based on historical prices
- **Input**: Last N days of closing prices
- **Output**: Predicted price for next M days
- **Formula**: y = ax + b
- **Pros**: Fast, simple, interpretable
- **Cons**: Limited accuracy for non-linear trends

### 2.2 Moving Average Extrapolation (移动平均外推)
- **Description**: Extend MA lines to predict future trend
- **Input**: MA5, MA10, MA20, MA60 values
- **Output**: Predicted MA values and price range
- **Method**: Linear extrapolation of MA lines
- **Pros**: Based on proven technical indicators
- **Cons**: Assumes trend continuation

### 2.3 ARIMA Model (自回归积分滑动平均模型)
- **Description**: Time series forecasting model
- **Input**: Historical price series
- **Output**: Forecasted prices with confidence intervals
- **Parameters**: p (AR), d (differencing), q (MA)
- **Pros**: Handles trends and seasonality
- **Cons**: Requires parameter tuning, computationally intensive

### 2.4 Technical Indicator Based Prediction (基于技术指标预测)
- **Description**: Combine multiple indicators for prediction
- **Input**: RSI, MACD, Volume, Price patterns
- **Output**: Buy/Sell/Hold signal with price target
- **Rules**:
  - RSI < 30: Potential buy signal
  - RSI > 70: Potential sell signal
  - MACD crossover: Trend change signal
  - Volume increase: Confirmation signal
- **Pros**: Uses multiple signals, interpretable
- **Cons**: May generate false signals

### 2.5 Polynomial Regression (多项式回归)
- **Description**: Non-linear curve fitting
- **Input**: Historical prices
- **Output**: Predicted prices with curve
- **Degree**: 2-4 (quadratic to quartic)
- **Pros**: Captures non-linear patterns
- **Cons**: Overfitting risk

### 2.6 Weighted Moving Average (加权移动平均)
- **Description**: Recent prices have more weight
- **Input**: Historical prices with weights
- **Output**: Predicted next price
- **Formula**: WMA = Σ(price[i] × weight[i]) / Σ(weight[i])
- **Pros**: Emphasizes recent trends
- **Cons**: Sensitive to recent volatility

## 3. Implementation Priority

### Phase 1 (Basic)
1. Linear Regression
2. Moving Average Extrapolation
3. Technical Indicator Based Prediction

### Phase 2 (Advanced)
4. Polynomial Regression
5. ARIMA Model (simplified)

### Phase 3 (Future)
6. LSTM Neural Network (requires ML framework)
7. Ensemble Methods (combine multiple models)

## 4. Output Format

### 4.1 Prediction Data Structure
```typescript
interface PredictionResult {
  date: string;
  predictedPrice: number;
  confidence: number; // 0-100
  signal: "buy" | "sell" | "hold";
  upperBound: number; // Confidence interval
  lowerBound: number;
  method: string;
}
```

### 4.2 Display Format
- **Chart**: Overlay predicted line on K-line chart
- **Table**: Show predictions with confidence scores
- **Summary**: Overall trend (Bullish/Bearish/Neutral)

## 5. Risk Warning
- All predictions are for reference only
- Past performance does not guarantee future results
- Users should make investment decisions based on comprehensive analysis
