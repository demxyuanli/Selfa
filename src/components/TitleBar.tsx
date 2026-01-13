import React, { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import MenuDropdown, { MenuItem } from "./MenuDropdown";
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
    { label: t("menu.fileNew"), action: "file:new", shortcut: "Ctrl+N" },
    { label: t("menu.fileOpen"), action: "file:open", shortcut: "Ctrl+O" },
    { label: t("menu.fileSave"), action: "file:save", shortcut: "Ctrl+S" },
    { separator: true },
    { label: t("menu.fileExport"), action: "file:export" },
    { separator: true },
    { label: t("menu.fileExit"), action: "file:exit" },
  ];

  const editMenuItems: MenuItem[] = [
    { label: t("menu.editUndo"), action: "edit:undo", shortcut: "Ctrl+Z", disabled: true },
    { label: t("menu.editRedo"), action: "edit:redo", shortcut: "Ctrl+Y", disabled: true },
    { separator: true },
    { label: t("menu.editCut"), action: "edit:cut", shortcut: "Ctrl+X", disabled: true },
    { label: t("menu.editCopy"), action: "edit:copy", shortcut: "Ctrl+C", disabled: true },
    { label: t("menu.editPaste"), action: "edit:paste", shortcut: "Ctrl+V", disabled: true },
    { separator: true },
    { label: t("menu.editFind"), action: "edit:find", shortcut: "Ctrl+F" },
  ];

  const viewMenuItems: MenuItem[] = [
    { label: t("menu.viewRefresh"), action: "view:refresh", shortcut: "F5" },
    { separator: true },
    { label: t("menu.viewLeftSidebar"), action: "view:leftSidebar" },
    { label: t("menu.viewRightSidebar"), action: "view:rightSidebar" },
    { separator: true },
    { label: t("menu.viewFullscreen"), action: "view:fullscreen", shortcut: "F11" },
  ];

  const analysisMenuItems: MenuItem[] = [
    { label: t("menu.analysisIndicators"), action: "analysis:indicators" },
    { label: t("menu.analysisCompare"), action: "analysis:compare" },
  ];

  const helpMenuItems: MenuItem[] = [
    { label: t("menu.helpAbout"), action: "help:about" },
    { label: t("menu.helpDocumentation"), action: "help:documentation" },
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
            label={t("menu.edit")}
            items={editMenuItems}
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
          <span className="title-bar-icon">⚙</span>
        </button>
        <LanguageSelector />
        <button 
          className="title-bar-button" 
          onClick={handleMinimize} 
          onMouseDown={(e) => e.stopPropagation()}
          title="Minimize"
        >
          <span className="title-bar-icon">−</span>
        </button>
        <button 
          className="title-bar-button" 
          onClick={handleMaximize} 
          onMouseDown={(e) => e.stopPropagation()}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <span className="title-bar-icon">{isMaximized ? "□" : "⬜"}</span>
        </button>
        <button 
          className="title-bar-button title-bar-close" 
          onClick={handleClose} 
          onMouseDown={(e) => e.stopPropagation()}
          title="Close"
        >
          <span className="title-bar-icon">×</span>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
