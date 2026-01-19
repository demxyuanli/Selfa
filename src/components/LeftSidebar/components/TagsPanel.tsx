import React from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../Icon";
import { TagInfo, StockWithTags, DEFAULT_TAG_COLORS } from "../types";
import StockItem from "./StockItem";

interface TagsPanelProps {
  allTags: TagInfo[];
  selectedTag: TagInfo | null;
  tagStocks: StockWithTags[];
  newTagName: string;
  newTagColor: string;
  editingTag: TagInfo | null;
  onNewTagNameChange: (name: string) => void;
  onNewTagColorChange: (color: string) => void;
  onCreateTag: () => void;
  onSelectTag: (tag: TagInfo | null) => void;
  onStartEditTag: (tag: TagInfo) => void;
  onCancelEditTag: () => void;
  onEditingTagNameChange: (name: string) => void;
  onEditingTagColorChange: (color: string) => void;
  onUpdateTag: () => void;
  onDeleteTag: (tagId: number) => void;
  onStockClick: (stock: StockWithTags) => void;
  onToggle: () => void;
}

const TagsPanel: React.FC<TagsPanelProps> = ({
  allTags,
  selectedTag,
  tagStocks,
  newTagName,
  newTagColor,
  editingTag,
  onNewTagNameChange,
  onNewTagColorChange,
  onCreateTag,
  onSelectTag,
  onStartEditTag,
  onCancelEditTag,
  onEditingTagNameChange,
  onEditingTagColorChange,
  onUpdateTag,
  onDeleteTag,
  onStockClick,
  onToggle,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="sidebar-header">
        <span>{t("sidebar.tagManagement")}</span>
        <button onClick={onToggle} className="toggle-btn">
          <Icon name="chevronLeft" size={14} />
        </button>
      </div>
      <div className="panel-content">
        <div className="tag-create-section">
          <input
            type="text"
            className="tag-name-input"
            placeholder={t("sidebar.newTagName")}
            value={newTagName}
            onChange={(e) => onNewTagNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreateTag()}
          />
          <div className="tag-color-picker">
            {DEFAULT_TAG_COLORS.map((color) => (
              <button
                key={color}
                className={`color-btn ${newTagColor === color ? "selected" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => onNewTagColorChange(color)}
              />
            ))}
          </div>
          <button className="tag-create-btn" onClick={onCreateTag}>{t("sidebar.addTag")}</button>
        </div>

        <div className="tag-cloud-section">
          <div className="section-title">{t("sidebar.tagCloud")}</div>
          {allTags.length === 0 ? (
            <div className="empty-message">{t("sidebar.noTags")}</div>
          ) : (
            <div className="tag-cloud">
              {allTags.map((tag) => (
                <div key={tag.id} className="tag-cloud-item-wrapper">
                  {editingTag?.id === tag.id ? (
                    <div className="tag-edit-inline">
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => onEditingTagNameChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onUpdateTag();
                          else if (e.key === "Escape") onCancelEditTag();
                        }}
                        autoFocus
                      />
                      <div className="tag-color-picker small">
                        {DEFAULT_TAG_COLORS.map((color) => (
                          <button
                            key={color}
                            className={`color-btn ${editingTag.color === color ? "selected" : ""}`}
                            style={{ backgroundColor: color }}
                            onClick={() => onEditingTagColorChange(color)}
                          />
                        ))}
                      </div>
                      <button className="mini-btn save" onClick={onUpdateTag}>OK</button>
                      <button className="mini-btn cancel" onClick={onCancelEditTag}>
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className={`tag-cloud-item ${selectedTag?.id === tag.id ? "selected" : ""}`}
                      style={{ backgroundColor: tag.color }}
                      onClick={() => onSelectTag(selectedTag?.id === tag.id ? null : tag)}
                    >
                      {tag.name}
                    </button>
                  )}
                  <div className="tag-item-actions">
                    <button className="mini-btn" onClick={() => onStartEditTag(tag)} title={t("sidebar.edit")}>
                      <Icon name="edit" size={12} />
                    </button>
                    <button className="mini-btn delete" onClick={() => onDeleteTag(tag.id)} title={t("sidebar.delete")}>
                      <Icon name="delete" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedTag && (
          <div className="tag-stocks-section">
            <div className="section-title">
              <span className="tag-indicator" style={{ backgroundColor: selectedTag.color }}></span>
              {selectedTag.name} ({tagStocks.length})
            </div>
            {tagStocks.length === 0 ? (
              <div className="empty-message">{t("sidebar.noStocksWithTag")}</div>
            ) : (
              <div className="stock-list">
                {tagStocks.map((stock) => (
                  <StockItem
                    key={stock.symbol}
                    stock={stock}
                    onStockClick={onStockClick}
                    simple={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default TagsPanel;
