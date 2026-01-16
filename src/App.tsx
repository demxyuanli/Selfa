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
  type?: "stock" | "heatmap";
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
      case "file:new":
        console.log("New file");
        break;
      case "file:open":
        console.log("Open file");
        break;
      case "file:save":
        console.log("Save file");
        break;
      case "file:export":
        console.log("Export data");
        break;
      case "file:exit":
        await appWindow.close();
        break;
      case "edit:find":
        console.log("Find");
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
      case "analysis:indicators":
        console.log("Show technical indicators");
        break;
      case "analysis:compare":
        console.log("Compare analysis");
        break;
      case "help:about":
        alert("Stock Analyzer v1.0.0\nA multi-language stock data viewer and analyzer");
        break;
      case "help:documentation":
        console.log("Open documentation");
        break;
      default:
        console.log("Unknown action:", action);
    }
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const appWindow = getCurrentWindow();
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "n":
            e.preventDefault();
            console.log("New file");
            break;
          case "o":
            e.preventDefault();
            console.log("Open file");
            break;
          case "s":
            e.preventDefault();
            console.log("Save file");
            break;
          case "f":
            e.preventDefault();
            console.log("Find");
            break;
        }
      } else if (e.key === "F5") {
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
    </div>
  );
}

export default App;
