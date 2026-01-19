import React from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../Icon";
import { StockWithTags, TagInfo } from "../types";

interface StockItemProps {
  stock: StockWithTags;
  onStockClick: (stock: StockWithTags) => void;
  onRemoveStock?: (symbol: string) => void;
  onRemoveTag?: (symbol: string, tagId: number) => void;
  allTags?: TagInfo[];
  tagMenuStock?: string | null;
  onTagMenuToggle?: (symbol: string | null) => void;
  onAddTag?: (symbol: string, tagId: number) => void;
  showDragHandle?: boolean;
  onDragStart?: (e: React.MouseEvent, index: number) => void;
  index?: number;
  isDragging?: boolean;
  dragOver?: boolean;
  showMoveSelect?: boolean;
  groups?: Array<{ name: string }>;
  currentGroup?: string;
  onMoveToGroup?: (symbol: string, groupName: string) => void;
  simple?: boolean;
}

const StockItem: React.FC<StockItemProps> = ({
  stock,
  onStockClick,
  onRemoveStock,
  onRemoveTag,
  allTags = [],
  tagMenuStock,
  onTagMenuToggle,
  onAddTag,
  showDragHandle = false,
  onDragStart,
  index,
  isDragging = false,
  dragOver = false,
  showMoveSelect = false,
  groups = [],
  currentGroup,
  onMoveToGroup,
  simple = false,
}) => {
  const { t } = useTranslation();
  const stockTags = 'tags' in stock ? stock.tags : [];

  return (
    <div
      className={`stock-item ${simple ? "simple" : ""} ${showDragHandle ? "favorites-item" : ""} ${
        isDragging ? "dragging" : ""
      } ${dragOver ? "drag-over" : ""}`}
      onClick={() => onStockClick(stock)}
    >
      {showDragHandle && index !== undefined && onDragStart && (
        <div
          className="drag-handle"
          onMouseDown={(e) => onDragStart(e, index)}
          onClick={(e) => e.stopPropagation()}
          title={t("sidebar.dragSortLabel")}
        >
          ⋮⋮
        </div>
      )}
      <div className="stock-info">
        <div className="stock-header">
          <span className="stock-symbol">{stock.symbol}</span>
          <span
            className={`stock-name ${
              stock.quote && stock.quote.change_percent > 0 ? 'price-up' :
              stock.quote && stock.quote.change_percent < 0 ? 'price-down' : ''
            }`}
          >
            {stock.name}
          </span>
          {stock.quote && (
            <>
              <span className="stock-price">{stock.quote.price.toFixed(2)}</span>
              <span
                className={`stock-change ${
                  stock.quote.change_percent > 0 ? 'price-up' :
                  stock.quote.change_percent < 0 ? 'price-down' : ''
                }`}
              >
                {stock.quote.change_percent > 0 ? '+' : ''}{stock.quote.change_percent.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        {stockTags.length > 0 && (
          <div className="stock-tags">
            {stockTags.map((tag) => (
              <span
                key={tag.id}
                className="stock-tag"
                style={{ backgroundColor: tag.color }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRemoveTag) {
                    onRemoveTag(stock.symbol, tag.id);
                  }
                }}
                title={t("sidebar.removeTagLabel", { name: tag.name })}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {!simple && (
        <div className="stock-actions" onClick={(e) => e.stopPropagation()}>
          {onTagMenuToggle && (
            <div className="tag-menu-container">
              <button
                className="stock-action-btn tag-btn"
                onClick={() => onTagMenuToggle(tagMenuStock === stock.symbol ? null : stock.symbol)}
                title={t("sidebar.tag")}
              >
                <Icon name="tag" size={12} />
              </button>
              {tagMenuStock === stock.symbol && allTags.length > 0 && (
                <div className="tag-menu">
                  {allTags.length === 0 ? (
                    <div className="tag-menu-empty">{t("sidebar.noTags")}</div>
                  ) : (
                    allTags.map((tag) => {
                      const hasTag = stockTags.some((t) => t.id === tag.id);
                      return (
                        <button
                          key={tag.id}
                          className={`tag-menu-item ${hasTag ? "selected" : ""}`}
                          onClick={() => hasTag
                            ? (onRemoveTag && onRemoveTag(stock.symbol, tag.id))
                            : (onAddTag && onAddTag(stock.symbol, tag.id))
                          }
                        >
                          <span className="tag-menu-color" style={{ backgroundColor: tag.color }} />
                          <span className="tag-menu-name">{tag.name}</span>
                          {hasTag && <span className="tag-menu-check">OK</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          {showMoveSelect && groups.length > 0 && onMoveToGroup && (
            <select
              className="move-select"
              value=""
              onChange={(e) => e.target.value && onMoveToGroup(stock.symbol, e.target.value)}
              title={t("sidebar.moveToLabel")}
            >
              <option value="">{t("sidebar.moveToLabel")}</option>
              {groups.filter((g) => g.name !== currentGroup).map((g) => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          )}
          {onRemoveStock && (
            <button
              className="stock-action-btn delete"
              onClick={() => onRemoveStock(stock.symbol)}
              title={t("sidebar.delete")}
            >
              <Icon name="delete" size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StockItem;
