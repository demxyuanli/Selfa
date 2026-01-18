import React from "react";
import { useTranslation } from "react-i18next";
import StockTabComponent from "./StockTab";
import FavoritesHeatmap from "./FavoritesHeatmap";
import PortfolioManagement from "./PortfolioManagement";
import "./Workspace.css";

interface StockTab {
  id: string;
  symbol: string;
  name: string;
  quote: any;
  type?: "stock" | "heatmap" | "portfolio";
}

interface WorkspaceProps {
  tabs: StockTab[];
  activeTabId: string | null;
  onTabChange: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  loading?: boolean;
}

const Workspace: React.FC<WorkspaceProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  onCloseTab,
}) => {
  const { t } = useTranslation();
  const activeTab = tabs.find(tab => tab.id === activeTabId);

  return (
    <div className="workspace">
      {tabs.length > 0 && (
        <div className="tab-bar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-item ${activeTabId === tab.id ? "active" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="tab-label">{tab.name}</span>
              {tab.type !== "heatmap" && tab.type !== "portfolio" && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="workspace-content">
        {activeTab ? (
          activeTab.type === "heatmap" ? (
            <FavoritesHeatmap />
          ) : activeTab.type === "portfolio" ? (
            <PortfolioManagement />
          ) : (
            <StockTabComponent tab={activeTab} />
          )
        ) : (
          <div className="empty-workspace">
            {t("workspace.empty")}
          </div>
        )}
      </div>
    </div>
  );
};

export default Workspace;
