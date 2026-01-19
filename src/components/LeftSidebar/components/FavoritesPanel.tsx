import React from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../Icon";
import { StockWithTags, TagInfo } from "../types";
import StockItem from "./StockItem";

interface FavoritesPanelProps {
  stocks: StockWithTags[];
  allTags: TagInfo[];
  tagMenuStock: string | null;
  onTagMenuToggle: (symbol: string | null) => void;
  onAddTag: (symbol: string, tagId: number) => void;
  onRemoveTag: (symbol: string, tagId: number) => void;
  onStockClick: (stock: StockWithTags) => void;
  onRemoveStock: (symbol: string) => void;
  onRefresh: () => void;
  onToggle: () => void;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: React.MouseEvent, index: number) => void;
  isDraggingReorder: boolean;
}

const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  stocks,
  allTags,
  tagMenuStock,
  onTagMenuToggle,
  onAddTag,
  onRemoveTag,
  onStockClick,
  onRemoveStock,
  onRefresh,
  onToggle,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  isDraggingReorder,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="sidebar-header">
        <span>{t("sidebar.favoritesTitle")} ({stocks.length})</span>
        <button onClick={onToggle} className="toggle-btn">
          <Icon name="chevronLeft" size={14} />
        </button>
      </div>
      <div className="panel-toolbar">
        <button className="toolbar-btn" onClick={onRefresh} title={t("sidebar.refresh")}>
          <Icon name="refresh" size={12} />
        </button>
        <span className="toolbar-hint">{t("sidebar.dragToSort")}</span>
      </div>
      <div className="panel-content">
        {stocks.length === 0 ? (
          <div className="empty-message">{t("sidebar.noFavorites")}</div>
        ) : (
          <div className="stock-list">
            {stocks.map((stock, index) => (
              <StockItem
                key={stock.symbol}
                stock={stock}
                onStockClick={(s) => {
                  if (!isDraggingReorder) {
                    onStockClick(s);
                  }
                }}
                onRemoveStock={onRemoveStock}
                onRemoveTag={onRemoveTag}
                allTags={allTags}
                tagMenuStock={tagMenuStock}
                onTagMenuToggle={onTagMenuToggle}
                onAddTag={onAddTag}
                showDragHandle={true}
                onDragStart={onDragStart}
                index={index}
                isDragging={draggedIndex === index}
                dragOver={dragOverIndex === index}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default FavoritesPanel;
