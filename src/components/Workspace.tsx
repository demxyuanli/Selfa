import React from "react";
import { useTranslation } from "react-i18next";
import StockTabComponent from "./StockTab";
import FavoritesHeatmap from "./FavoritesHeatmap";
import FavoritesDashboard from "./FavoritesDashboard";
import PortfolioManagement from "./PortfolioManagement";
import Icon from "./Icon";
import "./Workspace.css";

interface StockTab {
  id: string;
  symbol: string;
  name: string;
  quote: any;
  type?: "stock" | "heatmap" | "dashboard" | "portfolio";
}

interface WorkspaceProps {
  tabs: StockTab[];
  activeTabId: string | null;
  onTabChange: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onStockSelect?: (symbol: string, name: string) => void;
  loading?: boolean;
}

const Workspace: React.FC<WorkspaceProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  onCloseTab,
  onStockSelect,
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
              {tab.type !== "heatmap" && tab.type !== "dashboard" && tab.type !== "portfolio" && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="workspace-content">
        {activeTab ? (
          activeTab.type === "dashboard" ? (
            <FavoritesDashboard onStockSelect={onStockSelect} />
          ) : activeTab.type === "heatmap" ? (
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
