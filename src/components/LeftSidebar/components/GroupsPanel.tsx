import React from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../Icon";
import { GroupData, StockWithTags } from "../types";
import StockItem from "./StockItem";

interface GroupsPanelProps {
  groups: GroupData[];
  ungroupedGroup: string;
  editingGroup: string | null;
  editingGroupName: string;
  onEditingGroupNameChange: (name: string) => void;
  onSaveEditGroup: () => void;
  onCancelEditGroup: () => void;
  onToggleGroupExpand: (groupName: string) => void;
  onStartEditGroup: (groupName: string) => void;
  onDeleteGroup: (groupName: string) => void;
  onStockClick: (stock: StockWithTags) => void;
  onRemoveStock: (symbol: string) => void;
  onMoveToGroup: (symbol: string, groupName: string) => void;
  draggedStock: { stock: StockWithTags; fromGroup: string } | null;
  dragOverGroup: string | null;
  onGroupDragOver: (e: React.DragEvent, groupName: string) => void;
  onGroupDragLeave: () => void;
  onGroupDrop: (e: React.DragEvent, groupName: string) => void;
  onStockDragStart: (stock: StockWithTags, groupName: string) => void;
  onStockDragEnd: () => void;
  onCreateGroup: () => void;
  onRefresh: () => void;
  onToggle: () => void;
}

const GroupsPanel: React.FC<GroupsPanelProps> = ({
  groups,
  ungroupedGroup,
  editingGroup,
  editingGroupName,
  onEditingGroupNameChange,
  onSaveEditGroup,
  onCancelEditGroup,
  onToggleGroupExpand,
  onStartEditGroup,
  onDeleteGroup,
  onStockClick,
  onRemoveStock,
  onMoveToGroup,
  draggedStock,
  dragOverGroup,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
  onStockDragStart,
  onStockDragEnd,
  onCreateGroup,
  onRefresh,
  onToggle,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="sidebar-header">
        <span>{t("sidebar.groupManagement")}</span>
        <button onClick={onToggle} className="toggle-btn">
          <Icon name="chevronLeft" size={14} />
        </button>
      </div>
      <div className="panel-toolbar">
        <button className="toolbar-btn" onClick={onCreateGroup} title={t("sidebar.createGroup")}>
          <Icon name="add" size={14} />
        </button>
        <button className="toolbar-btn" onClick={onRefresh} title={t("sidebar.refresh")}>RF</button>
      </div>
      <div className="panel-content">
        <div className="groups-tree">
          {groups.map((group) => (
            <div
              key={group.name}
              className={`group-container ${dragOverGroup === group.name ? "drag-over" : ""}`}
              onDragOver={(e) => onGroupDragOver(e, group.name)}
              onDragLeave={onGroupDragLeave}
              onDrop={(e) => onGroupDrop(e, group.name)}
            >
              <div
                className={`group-header ${group.expanded ? "expanded" : ""}`}
                onClick={() => onToggleGroupExpand(group.name)}
              >
                <span className="group-expand-icon">
                  {group.expanded ? <Icon name="chevronDown" size={12} /> : <Icon name="chevronRight" size={12} />}
                </span>
                {editingGroup === group.name ? (
                  <input
                    type="text"
                    className="group-name-input"
                    value={editingGroupName}
                    onChange={(e) => onEditingGroupNameChange(e.target.value)}
                    onBlur={onCancelEditGroup}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveEditGroup();
                      else if (e.key === "Escape") onCancelEditGroup();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="group-name">{group.name}</span>
                )}
                <span className="group-count">({group.stocks.length})</span>
                {group.name !== ungroupedGroup && (
                  <div className="group-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="group-action-btn"
                      onClick={() => onStartEditGroup(group.name)}
                      title={t("sidebar.rename")}
                    >
                      <Icon name="edit" size={12} />
                    </button>
                    <button
                      className="group-action-btn delete"
                      onClick={() => onDeleteGroup(group.name)}
                      title={t("sidebar.delete")}
                    >
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                )}
              </div>
              {group.expanded && (
                <div className="group-stocks">
                  {group.stocks.length === 0 ? (
                    <div className="empty-group">{t("sidebar.noStocksInGroup")}</div>
                  ) : (
                    group.stocks.map((stock) => (
                      <StockItem
                        key={stock.symbol}
                        stock={stock}
                        onStockClick={onStockClick}
                        onRemoveStock={onRemoveStock}
                        showMoveSelect={true}
                        groups={groups.map(g => ({ name: g.name }))}
                        currentGroup={group.name}
                        onMoveToGroup={onMoveToGroup}
                        draggable={true}
                        onItemDragStart={() => onStockDragStart(stock, group.name)}
                        onItemDragEnd={onStockDragEnd}
                        isDragging={draggedStock?.stock.symbol === stock.symbol}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default GroupsPanel;
