import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/TitleBar";
import ToolBar from "./components/ToolBar";
import LeftSidebar from "./components/LeftSidebar";
import RightSidebar from "./components/RightSidebar";
import Workspace from "./components/Workspace";
import StatusBar from "./components/StatusBar";
import SettingsDialog from "./components/SettingsDialog";
import PriceAlertDialog from "./components/PriceAlertDialog";
import "./App.css";

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap?: number;
  high: number;
  low: number;
  open: number;
  previous_close: number;
}

interface StockTab {
  id: string;
  symbol: string;
  name: string;
  quote: StockQuote | null;
  type?: "stock" | "heatmap" | "portfolio";
}

function App() {
  const { t } = useTranslation();
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [tabs, setTabs] = useState<StockTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);

  useEffect(() => {
    const heatmapTab: StockTab = {
      id: "tab-heatmap",
      symbol: "",
      name: t("favorites.heatmap"),
      quote: null,
      type: "heatmap",
    };
    setTabs([heatmapTab]);
    setActiveTabId(heatmapTab.id);
  }, [t]);

  const handlePortfolioClick = () => {
    const existingTab = tabs.find(tab => tab.type === "portfolio");
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    const portfolioTab: StockTab = {
      id: "tab-portfolio",
      symbol: "",
      name: t("portfolio.title"),
      quote: null,
      type: "portfolio",
    };
    setTabs([...tabs, portfolioTab]);
    setActiveTabId(portfolioTab.id);
  };

  const handleStockSelect = async (symbol: string, name: string) => {
    const existingTab = tabs.find(tab => tab.symbol === symbol);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    setLoading(true);
    try {
      const quote: StockQuote = await invoke("get_stock_quote", { symbol });
      const newTab: StockTab = {
        id: `tab-${Date.now()}`,
        symbol,
        name,
        quote,
        type: "stock",
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newTab.id);
    } catch (err) {
      console.error("Error loading stock:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseTab = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.type === "heatmap") {
      return;
    }
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  const handleStockRemove = (symbol: string) => {
    // Close all tabs related to the removed stock
    const newTabs = tabs.filter(tab => tab.symbol !== symbol);
    setTabs(newTabs);
    if (activeTabId && !newTabs.find(tab => tab.id === activeTabId)) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  const handleMenuAction = async (action: string) => {
    const appWindow = getCurrentWindow();
    
    switch (action) {
      case "file:exit":
        await appWindow.close();
        break;
      case "view:refresh":
        if (activeTabId) {
          const activeTab = tabs.find(tab => tab.id === activeTabId);
          if (activeTab) {
            setLoading(true);
            try {
              const quote: StockQuote = await invoke("get_stock_quote", {
                symbol: activeTab.symbol,
              });
              setTabs(
                tabs.map((tab) =>
                  tab.id === activeTabId ? { ...tab, quote } : tab
                )
              );
            } catch (err) {
              console.error("Error refreshing stock:", err);
            } finally {
              setLoading(false);
            }
          }
        }
        break;
      case "view:leftSidebar":
        setLeftSidebarVisible(!leftSidebarVisible);
        break;
      case "view:rightSidebar":
        setRightSidebarVisible(!rightSidebarVisible);
        break;
      case "view:toolbar":
        setToolbarVisible(!toolbarVisible);
        break;
      case "view:fullscreen":
        const isFullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFullscreen);
        break;
      case "analysis:priceAlert":
        setPriceAlertOpen(true);
        break;
      case "portfolio:open":
        handlePortfolioClick();
        break;
      case "help:about":
        alert("Stock Analyzer v1.0.0\nA multi-language stock data viewer and analyzer");
        break;
      default:
        console.log("Unknown action:", action);
    }
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const appWindow = getCurrentWindow();
      
      if (e.key === "F5") {
        e.preventDefault();
        if (activeTabId) {
          const activeTab = tabs.find(tab => tab.id === activeTabId);
          if (activeTab) {
            setLoading(true);
            try {
              const quote: StockQuote = await invoke("get_stock_quote", {
                symbol: activeTab.symbol,
              });
              setTabs(
                tabs.map((tab) =>
                  tab.id === activeTabId ? { ...tab, quote } : tab
                )
              );
            } catch (err) {
              console.error("Error refreshing stock:", err);
            } finally {
              setLoading(false);
            }
          }
        }
      } else if (e.key === "F11") {
        e.preventDefault();
        const isFullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFullscreen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTabId, tabs]);

  useEffect(() => {
    const checkAlerts = async () => {
      try {
        const triggeredAlerts = await invoke<Array<{
          id: number;
          symbol: string;
          threshold_price: number;
          direction: string;
          enabled: boolean;
          triggered: boolean;
        }>>("check_price_alerts");
        
        if (triggeredAlerts && triggeredAlerts.length > 0) {
          triggeredAlerts.forEach(alert => {
            const direction = alert.direction === "above" ? t("priceAlert.above") : t("priceAlert.below");
            const message = `${alert.symbol} ${t("priceAlert.triggered")}: ${direction} ${alert.threshold_price.toFixed(2)}`;
            window.alert(message);
          });
        }
      } catch (err) {
        console.error("Error checking price alerts:", err);
      }
    };

    const interval = setInterval(checkAlerts, 60000);
    checkAlerts();

    return () => clearInterval(interval);
  }, [t]);

  return (
    <div className="app">
      <TitleBar
        onMenuAction={handleMenuAction}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      {toolbarVisible && <ToolBar />}
      <div className="app-main">
        <LeftSidebar
          visible={leftSidebarVisible}
          onToggle={() => setLeftSidebarVisible(!leftSidebarVisible)}
          onStockSelect={handleStockSelect}
          onStockRemove={handleStockRemove}
        />
        <Workspace
          tabs={tabs}
          activeTabId={activeTabId}
          onTabChange={setActiveTabId}
          onCloseTab={handleCloseTab}
          loading={loading}
        />
        <RightSidebar
          visible={rightSidebarVisible}
          onToggle={() => setRightSidebarVisible(!rightSidebarVisible)}
        />
      </div>
      <StatusBar />
      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PriceAlertDialog
        isOpen={priceAlertOpen}
        onClose={() => setPriceAlertOpen(false)}
        symbol={
          tabs.find(tab => tab.id === activeTabId)?.symbol ||
          undefined
        }
        currentPrice={
          tabs.find(tab => tab.id === activeTabId)?.quote?.price ||
          undefined
        }
      />
    </div>
  );
}

export default App;
