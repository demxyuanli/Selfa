# Stock Analyzer

A multi-language stock data viewer and analyzer built with Tauri framework, supporting desktop and mobile platforms.

## Features

- Multi-language support (English, Chinese, Japanese)
- Real-time stock quotes
- Historical stock data with multiple time periods
- Interactive charts
- Technical analysis indicators (SMA, EMA, RSI, MACD)
- Responsive design for desktop and mobile

## Prerequisites

- Node.js (v18 or higher)
- Rust (latest stable version)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Tauri CLI (if not already installed):
```bash
npm install -g @tauri-apps/cli
```

## Development

Run the development server:
```bash
npm run dev
```

Or run with Tauri:
```bash
npm run tauri dev
```

## Build

Build for production:
```bash
npm run build
npm run tauri build
```

## Project Structure

- `src/` - Frontend React application
- `src-tauri/` - Rust backend
- `src/i18n/` - Internationalization files
- `src/components/` - React components

## Technologies

- Frontend: React, TypeScript, Chart.js
- Backend: Rust, Tauri
- Styling: CSS with responsive design
- i18n: i18next

