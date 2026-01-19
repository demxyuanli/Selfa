import React, { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import MenuDropdown, { MenuItem } from "./MenuDropdown";
import Icon from "./Icon";
import "./TitleBar.css";

interface TitleBarProps {
  onMenuAction?: (action: string) => void;
  onSettingsClick?: () => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ onMenuAction, onSettingsClick }) => {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    
    const checkMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.error("Failed to check maximized state:", error);
      }
    };

    checkMaximized();

    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then((fn: () => void) => fn());
    };
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
      console.log("Window minimized");
    } catch (error) {
      console.error("Failed to minimize window:", error);
      alert(`Failed to minimize: ${error}`);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      const currentMaximized = await appWindow.isMaximized();
      if (currentMaximized) {
        await appWindow.unmaximize();
        setIsMaximized(false);
        console.log("Window unmaximized");
      } else {
        await appWindow.maximize();
        setIsMaximized(true);
        console.log("Window maximized");
      }
    } catch (error) {
      console.error("Failed to toggle maximize window:", error);
      alert(`Failed to maximize: ${error}`);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
      console.log("Window closing");
    } catch (error) {
      console.error("Failed to close window:", error);
      alert(`Failed to close: ${error}`);
    }
  };

  const handleSettings = () => {
    if (onSettingsClick) {
      onSettingsClick();
    }
  };

  const handleMenuAction = (action: string) => {
    if (onMenuAction) {
      onMenuAction(action);
    }
  };

  const fileMenuItems: MenuItem[] = [
    { label: t("menu.fileExit"), action: "file:exit" },
  ];

  const viewMenuItems: MenuItem[] = [
    { label: t("menu.viewRefresh"), action: "view:refresh", shortcut: "F5" },
    { separator: true },
    { label: t("menu.viewToolbar"), action: "view:toolbar" },
    { label: t("menu.viewLeftSidebar"), action: "view:leftSidebar" },
    { label: t("menu.viewRightSidebar"), action: "view:rightSidebar" },
    { separator: true },
    { label: t("menu.viewFullscreen"), action: "view:fullscreen", shortcut: "F11" },
  ];

  const analysisMenuItems: MenuItem[] = [
    { label: t("menu.analysisPriceAlert"), action: "analysis:priceAlert" },
    { separator: true },
    { label: t("menu.portfolioManagement"), action: "portfolio:open" },
  ];

  const helpMenuItems: MenuItem[] = [
    { label: t("menu.helpAbout"), action: "help:about" },
  ];

  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar-left">
        <div className="title-bar-logo">
          <img src="/icons/32x32.png" alt="Logo" className="logo-image" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="title-bar-menu">
          <MenuDropdown
            label={t("menu.file")}
            items={fileMenuItems}
            onItemClick={handleMenuAction}
          />
          <MenuDropdown
            label={t("menu.view")}
            items={viewMenuItems}
            onItemClick={handleMenuAction}
          />
          <MenuDropdown
            label={t("menu.analysis")}
            items={analysisMenuItems}
            onItemClick={handleMenuAction}
          />
          <MenuDropdown
            label={t("menu.help")}
            items={helpMenuItems}
            onItemClick={handleMenuAction}
          />
        </div>
      </div>
      <div className="title-bar-right">
        <button className="title-bar-button" onClick={handleSettings} title="Settings">
          <Icon name="settings" size={16} />
        </button>
        <LanguageSelector />
        <button 
          className="title-bar-button" 
          onClick={handleMinimize} 
          onMouseDown={(e) => e.stopPropagation()}
          title="Minimize"
        >
          <Icon name="minimize" size={16} />
        </button>
        <button 
          className="title-bar-button" 
          onClick={handleMaximize} 
          onMouseDown={(e) => e.stopPropagation()}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <Icon name={isMaximized ? "restore" : "maximize"} size={16} />
        </button>
        <button 
          className="title-bar-button title-bar-close" 
          onClick={handleClose} 
          onMouseDown={(e) => e.stopPropagation()}
          title="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
