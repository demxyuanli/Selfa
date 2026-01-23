import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { getSettings } from "./utils/settings";
import { AlertProvider, useAlert } from "./contexts/AlertContext";
import SplashScreen from "./components/SplashScreen";
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
  type?: "stock" | "heatmap" | "dashboard" | "portfolio";
}

function AppContent() {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [tabs, setTabs] = useState<StockTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);

  // Helper to check if running in Tauri
  const isTauri = () => {
    return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  };

  // Default credentials
  const DEFAULT_USERNAME = "admin";
  const DEFAULT_PASSWORD = "admin";
  const USERS_STORAGE_KEY = "stock_analyzer_users";
  const AUTH_STORAGE_KEY = "stock_analyzer_auth";

  // Initialize default admin user if not exists and check authentication status
  useEffect(() => {
    const users = getStoredUsers();
    if (!users[DEFAULT_USERNAME]) {
      users[DEFAULT_USERNAME] = DEFAULT_PASSWORD;
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    }
    
    // Check if user is already authenticated
    const authStatus = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Clear authentication on window close (not on refresh)
  useEffect(() => {
    const clearAuth = () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    };

    // Handle Tauri window close event (only fires on actual close, not refresh)
    let tauriUnlisten: (() => void) | null = null;
    const setupTauriCloseListener = async () => {
      if (!isTauri()) return;
      
      try {
        const appWindow = getCurrentWindow();
        const unlistenPromise = appWindow.onCloseRequested(() => {
          // Clear auth but don't prevent close
          clearAuth();
          // Don't call event.preventDefault() - allow window to close normally
        });
        unlistenPromise.then((unlisten) => {
          tauriUnlisten = unlisten;
        }).catch((error) => {
          console.error("Failed to setup Tauri close listener:", error);
        });
      } catch (error) {
        console.error("Failed to setup Tauri close listener:", error);
      }
    };

    setupTauriCloseListener();

    return () => {
      if (tauriUnlisten) {
        tauriUnlisten();
      }
    };
  }, []);

  // Apply theme and font settings from settings
  useEffect(() => {
    const applySettings = () => {
      const settings = getSettings();
      const root = document.documentElement;
      // Apply theme
      if (settings.theme === "light") {
        root.setAttribute("data-theme", "light");
      } else {
        root.setAttribute("data-theme", "dark");
      }
      // Apply font settings
      root.style.setProperty("--font-family", settings.fontFamily);
      root.style.setProperty("--font-size", `${settings.fontSize}px`);
      root.style.setProperty("--number-font-family", settings.numberFontFamily);
    };

    // Apply settings on mount
    applySettings();

    // Listen for storage changes (when settings are saved)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "appSettings") {
        applySettings();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also listen for custom event (for same-window updates)
    const handleSettingsChange = () => {
      applySettings();
    };

    window.addEventListener("settingsChanged", handleSettingsChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("settingsChanged", handleSettingsChange);
    };
  }, []);

  const getStoredUsers = (): Record<string, string> => {
    try {
      const stored = localStorage.getItem(USERS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  const handleLogin = (username: string, password: string): boolean => {
    const users = getStoredUsers();
    if (users[username] === password) {
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
      return true;
    }
    return false;
  };

  const handleRegister = (username: string, password: string): boolean => {
    const users = getStoredUsers();
    if (users[username]) {
      return false; // Username already exists
    }
    users[username] = password;
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    return true;
  };

  useEffect(() => {
    const dashboardTab: StockTab = {
      id: "tab-dashboard",
      symbol: "",
      name: t("favorites.dashboard") || "自选股监控",
      quote: null,
      type: "dashboard",
    };
    setTabs([dashboardTab]);
    setActiveTabId(dashboardTab.id);
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
        showAlert("Stock Analyzer v0.4.0\nA multi-language stock data viewer and analyzer");
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
      if (!isTauri()) return;

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
            showAlert(message);
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

  // Show splash screen if not authenticated
  if (!isAuthenticated) {
    return <SplashScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

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
          onStockSelect={handleStockSelect}
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
        onAlertChanged={() => {
          // Trigger refresh in other components via custom event
          window.dispatchEvent(new CustomEvent("priceAlertChanged"));
        }}
      />
    </div>
  );
}

function App() {
  return (
    <AlertProvider>
      <AppContent />
    </AlertProvider>
  );
}

export default App;
