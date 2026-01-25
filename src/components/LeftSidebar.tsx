import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useAlert } from "../contexts/AlertContext";
import { isIndexStock } from "../utils/stockUtils";
import Icon from "./Icon";
import "./LeftSidebar.css";
import { PanelType, StockInfo, StockWithTags, TagInfo, DEFAULT_TAG_COLORS, LeftSidebarProps } from "./LeftSidebar/types";
import { useSidebarData } from "./LeftSidebar/hooks/useSidebarData";
import { useDragReorder } from "./LeftSidebar/hooks/useDragReorder";
import { useTradingHoursTimeseriesRefresh } from "../hooks/useTradingHoursTimeseriesRefresh";
import SearchPanel from "./LeftSidebar/components/SearchPanel";
import FavoritesPanel from "./LeftSidebar/components/FavoritesPanel";
import GroupsPanel from "./LeftSidebar/components/GroupsPanel";
import TagsPanel from "./LeftSidebar/components/TagsPanel";

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  visible,
  onToggle,
  onStockSelect,
  onStockRemove,
}) => {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useAlert();
  const UNGROUPED_GROUP = t("sidebar.ungroupedGroup");

  const [activePanel, setActivePanel] = useState<PanelType>("favorites");
  const [selectedTag, setSelectedTag] = useState<TagInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState(false);
  const [currentMarketFilter, setCurrentMarketFilter] = useState<string | null>(null);
  const [currentSectorFilter, setCurrentSectorFilter] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingTag, setEditingTag] = useState<TagInfo | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0]);
  const [tagMenuStock, setTagMenuStock] = useState<string | null>(null);
  const [draggedStock, setDraggedStock] = useState<{ stock: StockWithTags; fromGroup: string } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  const {
    allStocks,
    setAllStocks,
    groupsData,
    setGroupsData,
    allTags,
    tagStocks,
    loadTags,
    loadAllStocks,
    loadGroups,
    loadStocksByTag,
    refreshAll,
  } = useSidebarData(UNGROUPED_GROUP);

  useTradingHoursTimeseriesRefresh(refreshAll, {
    enabled: visible,
    intervalInMs: 15000,
  });

  const {
    draggedIndex,
    dragOverIndex,
    isDraggingReorder,
    handleFavoritesMouseDown,
  } = useDragReorder(setAllStocks, loadAllStocks);

  useEffect(() => {
    setActivePanel("favorites");
  }, []);

  useEffect(() => {
    if (selectedTag) {
      loadStocksByTag(selectedTag.id);
    }
  }, [selectedTag, loadStocksByTag]);

  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim() && !filterMode) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      if (filterMode) {
        // Use filter API
        const results: StockInfo[] = await invoke("filter_stocks", {
          marketFilter: currentMarketFilter,
          sectorFilter: currentSectorFilter,
          page: 1,
          pageSize: 100,
        });
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError("No results found");
        }
      } else {
        // Use search API
        const results: StockInfo[] = await invoke("search_stocks", { query });
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError("No results found");
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      setSearchError(err instanceof Error ? err.message : String(err));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [filterMode, currentMarketFilter, currentSectorFilter]);

  useEffect(() => {
    if (filterMode) {
      searchStocks("");
    } else {
      const timeoutId = setTimeout(() => searchStocks(searchQuery), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, searchStocks, filterMode]);

  const handleFilter = (marketFilter: string | null, sectorFilter: string | null) => {
    setFilterMode(true);
    setCurrentMarketFilter(marketFilter);
    setCurrentSectorFilter(sectorFilter);
    setSearchQuery("");
    searchStocks("");
  };

  const handleAddToFavorites = async (stock: StockInfo) => {
    try {
      await invoke("add_stock_to_group", { stock, groupName: null });
      refreshAll();
    } catch (err) {
      console.error("Error adding stock:", err);
    }
  };

  const handleRemoveFromFavorites = async (stock: StockInfo) => {
    try {
      await invoke("remove_stock", { symbol: stock.symbol });
      refreshAll();
      if (onStockRemove) {
        onStockRemove(stock.symbol);
      }
    } catch (err) {
      console.error("Error removing stock:", err);
    }
  };

  const handleRemoveStock = async (symbol: string) => {
    const ok = await showConfirm(t("sidebar.confirmDeleteStock", { symbol }));
    if (!ok) return;
    try {
      await invoke("remove_stock", { symbol });
      refreshAll();
      if (onStockRemove) {
        onStockRemove(symbol);
      }
    } catch (err) {
      console.error("Error removing stock:", err);
    }
  };

  const handleCreateGroup = async () => {
    const name = prompt(t("sidebar.enterGroupName"));
    if (name && name.trim()) {
      try {
        await invoke("create_stock_group", { name: name.trim() });
        loadGroups();
      } catch (err) {
        showAlert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleDeleteGroup = async (groupName: string) => {
    if (groupName === UNGROUPED_GROUP) {
      showAlert(t("sidebar.cannotDeleteUngrouped"));
      return;
    }
    const ok = await showConfirm(t("sidebar.confirmDeleteGroup", { name: groupName }));
    if (!ok) return;
    try {
      await invoke("delete_stock_group", { name: groupName });
      loadGroups();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveEditGroup = async () => {
    if (!editingGroup || !editingGroupName.trim() || editingGroupName.trim() === editingGroup) {
      setEditingGroup(null);
      return;
    }
    try {
      await invoke("update_stock_group", { oldName: editingGroup, newName: editingGroupName.trim() });
      loadGroups();
      setEditingGroup(null);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleGroupExpand = (groupName: string) => {
    setGroupsData((prev) =>
      prev.map((g) => g.name === groupName ? { ...g, expanded: !g.expanded } : g)
    );
  };

  const handleMoveStockToGroup = async (symbol: string, targetGroup: string) => {
    try {
      await invoke("move_stock_to_group", {
        symbol,
        groupName: targetGroup === UNGROUPED_GROUP ? null : targetGroup,
      });
      loadGroups();
      loadAllStocks();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await invoke("create_tag", { name: newTagName.trim(), color: newTagColor });
      loadTags();
      setNewTagName("");
      setNewTagColor(DEFAULT_TAG_COLORS[Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)]);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim()) return;
    try {
      await invoke("update_tag", { tagId: editingTag.id, name: editingTag.name.trim(), color: editingTag.color });
      loadTags();
      if (selectedTag?.id === editingTag.id) {
        setSelectedTag(editingTag);
      }
      setEditingTag(null);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    const ok = await showConfirm(t("sidebar.confirmDeleteTag"));
    if (!ok) return;
    try {
      await invoke("delete_tag", { tagId });
      loadTags();
      loadAllStocks();
      if (selectedTag?.id === tagId) {
        setSelectedTag(null);
      }
    } catch (err) {
      showAlert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddTagToStock = async (symbol: string, tagId: number) => {
    try {
      await invoke("add_tag_to_stock", { symbol, tagId });
      refreshAll();
      setTagMenuStock(null);
    } catch (err) {
      console.error("Error adding tag:", err);
    }
  };

  const handleRemoveTagFromStock = async (symbol: string, tagId: number) => {
    try {
      await invoke("remove_tag_from_stock", { symbol, tagId });
      refreshAll();
    } catch (err) {
      console.error("Error removing tag:", err);
    }
  };

  const handleStockDragStart = (stock: StockWithTags, fromGroup: string) => {
    setDraggedStock({ stock, fromGroup });
  };

  const handleStockDragEnd = () => {
    setDraggedStock(null);
    setDragOverGroup(null);
  };

  const handleGroupDragOver = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    if (draggedStock && draggedStock.fromGroup !== groupName) {
      setDragOverGroup(groupName);
    }
  };

  const handleGroupDrop = async (e: React.DragEvent, targetGroup: string) => {
    e.preventDefault();
    if (draggedStock && draggedStock.fromGroup !== targetGroup) {
      await handleMoveStockToGroup(draggedStock.stock.symbol, targetGroup);
    }
    setDraggedStock(null);
    setDragOverGroup(null);
  };

  const handleStockClick = (stock: StockInfo | StockWithTags) => {
    onStockSelect(stock.symbol, stock.name);
  };

  const refreshAllWithTag = useCallback(() => {
    refreshAll();
    if (selectedTag) {
      loadStocksByTag(selectedTag.id);
    }
  }, [refreshAll, selectedTag, loadStocksByTag]);

  return (
    <div className={`left-sidebar ${visible ? "expanded" : "collapsed"}`}>
      <div className="sidebar-icons-bar">
        <button
          className={`sidebar-icon ${activePanel === "search" ? "active" : ""}`}
          onClick={() => { setActivePanel("search"); if (!visible) onToggle(); }}
          title={t("sidebar.searchStock")}
        >
          <Icon name="search" size={16} filled={activePanel === "search"} />
        </button>
        <button
          className={`sidebar-icon ${activePanel === "favorites" ? "active" : ""}`}
          onClick={() => { setActivePanel("favorites"); if (!visible) onToggle(); }}
          title={t("sidebar.favoritesTitle")}
        >
          <Icon name="favorites" size={16} filled={activePanel === "favorites"} />
        </button>
        <button
          className={`sidebar-icon ${activePanel === "groups" ? "active" : ""}`}
          onClick={() => { setActivePanel("groups"); if (!visible) onToggle(); }}
          title={t("sidebar.groupManagement")}
        >
          <Icon name="groups" size={16} filled={activePanel === "groups"} />
        </button>
        <button
          className={`sidebar-icon ${activePanel === "tags" ? "active" : ""}`}
          onClick={() => { setActivePanel("tags"); if (!visible) onToggle(); }}
          title={t("sidebar.tagManagement")}
        >
          <Icon name="tags" size={16} filled={activePanel === "tags"} />
        </button>
      </div>

      {visible && (
        <div className="sidebar-expanded-content">
          {activePanel === "search" && (
            <SearchPanel
              searchQuery={searchQuery}
              onSearchChange={(query) => {
                setSearchQuery(query);
                setFilterMode(false);
              }}
              searchResults={searchResults}
              searching={searching}
              searchError={searchError}
              onStockClick={handleStockClick}
              onAddToFavorites={handleAddToFavorites}
              onRemoveFromFavorites={handleRemoveFromFavorites}
              favoriteStocks={allStocks ? allStocks.map(s => ({ symbol: s.symbol, name: s.name, exchange: s.exchange })) : []}
              onToggle={onToggle}
              onFilter={handleFilter}
            />
          )}

          {activePanel === "favorites" && (
            <FavoritesPanel
              stocks={allStocks.filter(stock => !isIndexStock(stock.symbol, stock.exchange))}
              allTags={allTags}
              tagMenuStock={tagMenuStock}
              onTagMenuToggle={setTagMenuStock}
              onAddTag={handleAddTagToStock}
              onRemoveTag={handleRemoveTagFromStock}
              onStockClick={handleStockClick}
              onRemoveStock={handleRemoveStock}
              onRefresh={refreshAllWithTag}
              onToggle={onToggle}
              draggedIndex={draggedIndex}
              dragOverIndex={dragOverIndex}
              onDragStart={handleFavoritesMouseDown}
              isDraggingReorder={isDraggingReorder}
            />
          )}

          {activePanel === "groups" && (
            <GroupsPanel
              groups={groupsData}
              ungroupedGroup={UNGROUPED_GROUP}
              editingGroup={editingGroup}
              editingGroupName={editingGroupName}
              onEditingGroupNameChange={setEditingGroupName}
              onSaveEditGroup={handleSaveEditGroup}
              onCancelEditGroup={() => setEditingGroup(null)}
              onToggleGroupExpand={toggleGroupExpand}
              onStartEditGroup={(name) => { setEditingGroup(name); setEditingGroupName(name); }}
              onDeleteGroup={handleDeleteGroup}
              onStockClick={handleStockClick}
              onRemoveStock={handleRemoveStock}
              onMoveToGroup={handleMoveStockToGroup}
              draggedStock={draggedStock}
              dragOverGroup={dragOverGroup}
              onGroupDragOver={handleGroupDragOver}
              onGroupDragLeave={() => setDragOverGroup(null)}
              onGroupDrop={handleGroupDrop}
              onStockDragStart={handleStockDragStart}
              onStockDragEnd={handleStockDragEnd}
              onCreateGroup={handleCreateGroup}
              onRefresh={loadGroups}
              onToggle={onToggle}
            />
          )}

          {activePanel === "tags" && (
            <TagsPanel
              allTags={allTags}
              selectedTag={selectedTag}
              tagStocks={tagStocks}
              newTagName={newTagName}
              newTagColor={newTagColor}
              editingTag={editingTag}
              onNewTagNameChange={setNewTagName}
              onNewTagColorChange={setNewTagColor}
              onCreateTag={handleCreateTag}
              onSelectTag={setSelectedTag}
              onStartEditTag={setEditingTag}
              onCancelEditTag={() => setEditingTag(null)}
              onEditingTagNameChange={(name) => setEditingTag(editingTag ? { ...editingTag, name } : null)}
              onEditingTagColorChange={(color) => setEditingTag(editingTag ? { ...editingTag, color } : null)}
              onUpdateTag={handleUpdateTag}
              onDeleteTag={handleDeleteTag}
              onStockClick={handleStockClick}
              onToggle={onToggle}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default LeftSidebar;
