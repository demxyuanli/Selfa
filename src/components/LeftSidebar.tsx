import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./LeftSidebar.css";

interface StockInfo {
  symbol: string;
  name: string;
  exchange: string;
}

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

interface TagInfo {
  id: number;
  name: string;
  color: string;
}

interface StockWithTags extends StockInfo {
  tags: TagInfo[];
  quote?: StockQuote | null;
}

interface GroupData {
  name: string;
  stocks: StockWithTags[];
  expanded: boolean;
  quotes?: Map<string, StockQuote | null>;
}

interface LeftSidebarProps {
  visible: boolean;
  onToggle: () => void;
  onStockSelect: (symbol: string, name: string) => void;
  onStockRemove?: (symbol: string) => void;
}

type PanelType = "search" | "favorites" | "groups" | "tags";

const UNGROUPED_GROUP = "未分组";

const DEFAULT_TAG_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e91e63", "#00bcd4", "#ff5722", "#607d8b"
];

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  visible,
  onToggle,
  onStockSelect,
  onStockRemove,
}) => {
  const [activePanel, setActivePanel] = useState<PanelType>("favorites");
  const [allStocks, setAllStocks] = useState<StockWithTags[]>([]);
  const [groupsData, setGroupsData] = useState<GroupData[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [selectedTag, setSelectedTag] = useState<TagInfo | null>(null);
  const [tagStocks, setTagStocks] = useState<StockWithTags[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Group editing state
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  
  // Tag editing state
  const [editingTag, setEditingTag] = useState<TagInfo | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0]);
  const [tagMenuStock, setTagMenuStock] = useState<string | null>(null);
  
  // Drag state
  const [draggedStock, setDraggedStock] = useState<{ stock: StockInfo; fromGroup: string } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // Favorites drag state for reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingReorder, setIsDraggingReorder] = useState(false);
  
  // Use refs to track current drag state
  const draggedIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  // Load all tags
  const loadTags = useCallback(async () => {
    try {
      const tags: TagInfo[] = await invoke("get_all_tags");
      setAllTags(tags);
    } catch (err) {
      console.error("Error loading tags:", err);
    }
  }, []);

  // Load all stocks (flat list for favorites) with quotes
  const loadAllStocks = useCallback(async () => {
    try {
      // Get stocks with quotes
      const stocksWithQuotes: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      const stocksWithTagsAndQuotes: StockWithTags[] = await Promise.all(
        stocksWithQuotes.map(async ([stock, quote]) => {
          try {
            const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
            return { ...stock, tags, quote };
          } catch {
            return { ...stock, tags: [], quote };
          }
        })
      );
      setAllStocks(stocksWithTagsAndQuotes);
    } catch (err) {
      console.error("Error loading stocks:", err);
      // Fallback: load stocks without quotes
      try {
        const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName: null });
        const stocksWithTags: StockWithTags[] = await Promise.all(
          stocks.map(async (stock) => {
            try {
              const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
              return { ...stock, tags };
            } catch {
              return { ...stock, tags: [] };
            }
          })
        );
        setAllStocks(stocksWithTags);
      } catch (fallbackErr) {
        console.error("Error loading stocks (fallback):", fallbackErr);
      }
    }
  }, []);

  // Load groups with stocks
  const loadGroups = useCallback(async () => {
    try {
      const groupList: string[] = await invoke("get_stock_groups");
      const allGroupNames = [UNGROUPED_GROUP, ...groupList];

      // Get all stock quotes for groups
      const stocksWithQuotes: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      const quotesMap = new Map<string, StockQuote | null>();
      stocksWithQuotes.forEach(([stock, quote]) => {
        quotesMap.set(stock.symbol, quote);
      });

      const newGroupsData: GroupData[] = await Promise.all(
        allGroupNames.map(async (groupName) => {
          const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName });
          const stocksWithTags: StockWithTags[] = await Promise.all(
            stocks.map(async (stock) => {
              try {
                const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
                const quote = quotesMap.get(stock.symbol);
                return { ...stock, tags, quote };
              } catch {
                const quote = quotesMap.get(stock.symbol);
                return { ...stock, tags: [], quote };
              }
            })
          );
          return { name: groupName, stocks: stocksWithTags, expanded: false, quotes: quotesMap };
        })
      );

      setGroupsData(newGroupsData);
    } catch (err) {
      console.error("Error loading groups:", err);
      // Fallback: load groups without quotes
      try {
        const groupList: string[] = await invoke("get_stock_groups");
        const allGroupNames = [UNGROUPED_GROUP, ...groupList];

        const newGroupsData: GroupData[] = await Promise.all(
          allGroupNames.map(async (groupName) => {
            const stocks: StockInfo[] = await invoke("get_stocks_by_group", { groupName });
            const stocksWithTags: StockWithTags[] = await Promise.all(
              stocks.map(async (stock) => {
                try {
                  const tags: TagInfo[] = await invoke("get_stock_tags", { symbol: stock.symbol });
                  return { ...stock, tags };
                } catch {
                  return { ...stock, tags: [] };
                }
              })
            );
            return { name: groupName, stocks: stocksWithTags, expanded: false };
          })
        );

        setGroupsData(newGroupsData);
      } catch (fallbackErr) {
        console.error("Error loading groups (fallback):", fallbackErr);
      }
    }
  }, []);

  // Load stocks by tag with quotes
  const loadStocksByTag = useCallback(async (tagId: number) => {
    try {
      const stocks: StockInfo[] = await invoke("get_stocks_by_tag", { tagId });

      // Get quotes for these stocks
      const stocksWithQuotes: Array<[StockInfo, StockQuote | null]> = await invoke("get_all_favorites_quotes");
      const quotesMap = new Map<string, StockQuote | null>();
      stocksWithQuotes.forEach(([stock, quote]) => {
        quotesMap.set(stock.symbol, quote);
      });

      const stocksWithQuotesFiltered = stocks.map(stock => ({
        ...stock,
        tags: [], // Tags will be loaded separately if needed
        quote: quotesMap.get(stock.symbol) || null
      }));

      setTagStocks(stocksWithQuotesFiltered);
    } catch (err) {
      console.error("Error loading stocks by tag:", err);
      setTagStocks([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTags();
    loadAllStocks();
    loadGroups();
  }, [loadTags, loadAllStocks, loadGroups]);

  // Load stocks when tag is selected
  useEffect(() => {
    if (selectedTag) {
      loadStocksByTag(selectedTag.id);
    }
  }, [selectedTag, loadStocksByTag]);

  // Refresh all data
  const refreshAll = useCallback(() => {
    loadTags();
    loadAllStocks();
    loadGroups();
    if (selectedTag) {
      loadStocksByTag(selectedTag.id);
    }
  }, [loadTags, loadAllStocks, loadGroups, selectedTag, loadStocksByTag]);

  // Search stocks
  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const results: StockInfo[] = await invoke("search_stocks", { query });
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No results found");
      }
    } catch (err) {
      console.error("Search error:", err);
      setSearchError(err instanceof Error ? err.message : String(err));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => searchStocks(searchQuery), 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchStocks]);

  // Add stock to favorites (ungrouped)
  const handleAddToFavorites = async (stock: StockInfo) => {
    try {
      await invoke("add_stock_to_group", { stock, groupName: null });
      refreshAll();
    } catch (err) {
      console.error("Error adding stock:", err);
    }
  };

  // Remove stock
  const handleRemoveStock = async (symbol: string) => {
    if (confirm(`确定要删除股票 ${symbol} 吗？`)) {
      try {
        await invoke("remove_stock", { symbol });
        refreshAll();
        // Notify parent to close related tabs
        if (onStockRemove) {
          onStockRemove(symbol);
        }
      } catch (err) {
        console.error("Error removing stock:", err);
      }
    }
  };

  // Group operations
  const handleCreateGroup = async () => {
    const name = prompt("请输入分组名称:");
    if (name && name.trim()) {
      try {
        await invoke("create_stock_group", { name: name.trim() });
        loadGroups();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleDeleteGroup = async (groupName: string) => {
    if (groupName === UNGROUPED_GROUP) {
      alert("不能删除未分组");
      return;
    }
    if (confirm(`确定要删除分组"${groupName}"吗？`)) {
      try {
        await invoke("delete_stock_group", { name: groupName });
        loadGroups();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
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
      alert(err instanceof Error ? err.message : String(err));
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
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Tag operations
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await invoke("create_tag", { name: newTagName.trim(), color: newTagColor });
      loadTags();
      setNewTagName("");
      setNewTagColor(DEFAULT_TAG_COLORS[Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
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
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (confirm("确定要删除该标签吗？")) {
      try {
        await invoke("delete_tag", { tagId });
        loadTags();
        loadAllStocks();
        if (selectedTag?.id === tagId) {
          setSelectedTag(null);
          setTagStocks([]);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
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

  // Drag handlers
  const handleStockDragStart = (stock: StockInfo, fromGroup: string) => {
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

  // Mouse-based drag handlers for reordering
  const handleMouseMoveRef = useRef<(e: MouseEvent) => void>();
  const handleMouseUpRef = useRef<() => void>();

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const currentDraggedIndex = draggedIndexRef.current;
    if (currentDraggedIndex === null) return;

    const stockListElement = document.querySelector('.panel-content .stock-list');
    if (!stockListElement) return;

    const stockItems = stockListElement.querySelectorAll('.favorites-item');
    let newDragOverIndex: number | null = null;

    stockItems.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const itemCenterY = rect.top + rect.height / 2;

      if (e.clientY >= rect.top && e.clientY <= rect.bottom && index !== currentDraggedIndex) {
        if (e.clientY < itemCenterY) {
          newDragOverIndex = index;
        } else {
          newDragOverIndex = index + 1;
        }
      }
    });

    if (newDragOverIndex !== null && newDragOverIndex !== dragOverIndexRef.current) {
      dragOverIndexRef.current = newDragOverIndex;
      setDragOverIndex(newDragOverIndex);
    }
  }, []);

  const handleMouseUp = useCallback(async () => {
    const currentDraggedIndex = draggedIndexRef.current;
    const currentDragOverIndex = dragOverIndexRef.current;

    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDraggingReorder(false);
    draggedIndexRef.current = null;
    dragOverIndexRef.current = null;

    document.removeEventListener('mousemove', handleMouseMoveRef.current!);
    document.removeEventListener('mouseup', handleMouseUpRef.current!);

    if (currentDraggedIndex === null || currentDragOverIndex === null) {
      return;
    }

    if (currentDraggedIndex !== currentDragOverIndex) {
      // Reorder the stocks array
      setAllStocks((currentStocks) => {
        const newStocks = [...currentStocks];
        let targetIndex = currentDragOverIndex;
        
        // Adjust target index if dragging down
        if (targetIndex > currentDraggedIndex) {
          targetIndex = targetIndex - 1;
        }

        const [draggedItem] = newStocks.splice(currentDraggedIndex, 1);
        newStocks.splice(targetIndex, 0, draggedItem);

        // Save the new order to database
        const symbols = newStocks.map(stock => stock.symbol);
        invoke("update_stocks_order", { symbols })
          .then(() => {
            console.log("Order saved successfully");
          })
          .catch((error) => {
            console.error("Failed to save stock order:", error);
            // Revert on error
            loadAllStocks();
          });

        return newStocks;
      });
    }
  }, [loadAllStocks]);

  handleMouseMoveRef.current = handleMouseMove;
  handleMouseUpRef.current = handleMouseUp;

  const handleFavoritesMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    draggedIndexRef.current = index;
    dragOverIndexRef.current = null;
    setDraggedIndex(index);
    setDragOverIndex(null);
    setIsDraggingReorder(true);
    document.addEventListener('mousemove', handleMouseMoveRef.current!);
    document.addEventListener('mouseup', handleMouseUpRef.current!);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current);
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current);
      }
    };
  }, []);

  const handleStockClick = (stock: StockInfo) => {
    onStockSelect(stock.symbol, stock.name);
  };

  // Render stock item (reusable)

  return (
    <div className={`left-sidebar ${visible ? "expanded" : "collapsed"}`}>
      {/* Icon Bar */}
      <div className="sidebar-icons-bar">
        <button
          className={`sidebar-icon ${activePanel === "search" ? "active" : ""}`}
          onClick={() => { setActivePanel("search"); if (!visible) onToggle(); }}
          title="搜索股票"
        >
          SE
        </button>
        <button
          className={`sidebar-icon ${activePanel === "favorites" ? "active" : ""}`}
          onClick={() => { setActivePanel("favorites"); if (!visible) onToggle(); }}
          title="自选股"
        >
          FA
        </button>
        <button
          className={`sidebar-icon ${activePanel === "groups" ? "active" : ""}`}
          onClick={() => { setActivePanel("groups"); if (!visible) onToggle(); }}
          title="分组管理"
        >
          GR
        </button>
        <button
          className={`sidebar-icon ${activePanel === "tags" ? "active" : ""}`}
          onClick={() => { setActivePanel("tags"); if (!visible) onToggle(); }}
          title="标签管理"
        >
          TG
        </button>
      </div>

      {visible && (
        <div className="sidebar-expanded-content">
          {/* ===== Search Panel ===== */}
          {activePanel === "search" && (
            <>
              <div className="sidebar-header">
                <span>搜索股票</span>
                <button onClick={onToggle} className="toggle-btn">◀</button>
              </div>
              <div className="panel-content">
                <div className="search-box">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="输入股票代码或名称..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searching && <div className="search-spinner"></div>}
                </div>
                {searchError && <div className="search-error">{searchError}</div>}
                <div className="search-results-list">
                  {searchResults.map((stock) => (
                    <div key={stock.symbol} className="search-result-item">
                      <div className="result-content" onClick={() => handleStockClick(stock)}>
                        <div className="stock-header">
                          <span className="stock-symbol">{stock.symbol}</span>
                          <span className="stock-name">{stock.name}</span>
                          {(stock as any).quote && (
                            <>
                              <span className="stock-price">{(stock as any).quote.price.toFixed(2)}</span>
                              <span
                                className={`stock-change ${
                                  (stock as any).quote.change_percent > 0 ? 'price-up' :
                                  (stock as any).quote.change_percent < 0 ? 'price-down' : ''
                                }`}
                              >
                                {(stock as any).quote.change_percent > 0 ? '+' : ''}{(stock as any).quote.change_percent.toFixed(2)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        className="add-btn"
                        onClick={() => handleAddToFavorites(stock)}
                        title="添加到自选"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ===== Favorites Panel ===== */}
          {activePanel === "favorites" && (
            <>
              <div className="sidebar-header">
                <span>自选股 ({allStocks.length})</span>
                <button onClick={onToggle} className="toggle-btn">◀</button>
              </div>
              <div className="panel-toolbar">
                <button className="toolbar-btn" onClick={refreshAll} title="刷新">RF</button>
                <span className="toolbar-hint">拖拽⋮⋮排序</span>
              </div>
              <div className="panel-content">
                {allStocks.length === 0 ? (
                  <div className="empty-message">暂无自选股</div>
                ) : (
                  <div className="stock-list">
                    {allStocks.map((stock, index) => (
                      <div
                        key={stock.symbol}
                        className={`stock-item favorites-item ${
                          draggedIndex === index ? "dragging" : ""
                        } ${
                          dragOverIndex === index ? "drag-over" : ""
                        }`}
                        onClick={() => {
                          if (!isDraggingReorder) {
                            handleStockClick(stock);
                          }
                        }}
                      >
                        <div
                          className="drag-handle"
                          onMouseDown={(e) => handleFavoritesMouseDown(e, index)}
                          onClick={(e) => e.stopPropagation()}
                          title="拖拽排序"
                        >
                          ⋮⋮
                        </div>
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
                          {('tags' in stock ? stock.tags : []).length > 0 && (
                            <div className="stock-tags">
                              {('tags' in stock ? stock.tags : []).map((tag) => (
                                <span
                                  key={tag.id}
                                  className="stock-tag"
                                  style={{ backgroundColor: tag.color }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveTagFromStock(stock.symbol, tag.id);
                                  }}
                                  title={`移除: ${tag.name}`}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="stock-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="tag-menu-container">
                            <button
                              className="stock-action-btn"
                              onClick={() => setTagMenuStock(tagMenuStock === stock.symbol ? null : stock.symbol)}
                              title="标签"
                            >
                              TG
                            </button>
                            {tagMenuStock === stock.symbol && (
                              <div className="tag-menu">
                                {allTags.length === 0 ? (
                                  <div className="tag-menu-empty">暂无标签</div>
                                ) : (
                                  allTags.map((tag) => {
                                    const hasTag = ('tags' in stock ? stock.tags : []).some((t) => t.id === tag.id);
                                    return (
                                      <button
                                        key={tag.id}
                                        className={`tag-menu-item ${hasTag ? "selected" : ""}`}
                                        onClick={() => hasTag
                                          ? handleRemoveTagFromStock(stock.symbol, tag.id)
                                          : handleAddTagToStock(stock.symbol, tag.id)
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
                          <button
                            className="stock-action-btn delete"
                            onClick={() => handleRemoveStock(stock.symbol)}
                            title="删除"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== Groups Panel ===== */}
          {activePanel === "groups" && (
            <>
              <div className="sidebar-header">
                <span>分组管理</span>
                <button onClick={onToggle} className="toggle-btn">◀</button>
              </div>
              <div className="panel-toolbar">
                <button className="toolbar-btn" onClick={handleCreateGroup} title="新建分组">+</button>
                <button className="toolbar-btn" onClick={loadGroups} title="刷新">RF</button>
              </div>
              <div className="panel-content">
                <div className="groups-tree">
                  {groupsData.map((group) => (
                    <div
                      key={group.name}
                      className={`group-container ${dragOverGroup === group.name ? "drag-over" : ""}`}
                      onDragOver={(e) => handleGroupDragOver(e, group.name)}
                      onDragLeave={() => setDragOverGroup(null)}
                      onDrop={(e) => handleGroupDrop(e, group.name)}
                    >
                      <div
                        className={`group-header ${group.expanded ? "expanded" : ""}`}
                        onClick={() => toggleGroupExpand(group.name)}
                      >
                        <span className="group-expand-icon">{group.expanded ? "▼" : "▶"}</span>
                        {editingGroup === group.name ? (
                          <input
                            type="text"
                            className="group-name-input"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onBlur={handleSaveEditGroup}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEditGroup();
                              else if (e.key === "Escape") setEditingGroup(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <span className="group-name">{group.name}</span>
                        )}
                        <span className="group-count">({group.stocks.length})</span>
                        {group.name !== UNGROUPED_GROUP && (
                          <div className="group-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="group-action-btn"
                              onClick={() => { setEditingGroup(group.name); setEditingGroupName(group.name); }}
                              title="重命名"
                            >
                              ✎
                            </button>
                            <button
                              className="group-action-btn delete"
                              onClick={() => handleDeleteGroup(group.name)}
                              title="删除"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                      {group.expanded && (
                        <div className="group-stocks">
                          {group.stocks.length === 0 ? (
                            <div className="empty-group">暂无股票</div>
                          ) : (
                            group.stocks.map((stock) => (
                              <div
                                key={stock.symbol}
                                className={`stock-item ${draggedStock?.stock.symbol === stock.symbol ? "dragging" : ""}`}
                                draggable
                                onDragStart={() => handleStockDragStart(stock, group.name)}
                                onDragEnd={handleStockDragEnd}
                                onClick={() => handleStockClick(stock)}
                              >
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
                                  {stock.tags.length > 0 && (
                                    <div className="stock-tags">
                                      {stock.tags.map((tag) => (
                                        <span key={tag.id} className="stock-tag" style={{ backgroundColor: tag.color }}>
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="stock-actions" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    className="move-select"
                                    value=""
                                    onChange={(e) => e.target.value && handleMoveStockToGroup(stock.symbol, e.target.value)}
                                    title="移动"
                                  >
                                    <option value="">移动...</option>
                                    {groupsData.filter((g) => g.name !== group.name).map((g) => (
                                      <option key={g.name} value={g.name}>{g.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    className="stock-action-btn delete"
                                    onClick={() => handleRemoveStock(stock.symbol)}
                                    title="删除"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ===== Tags Panel ===== */}
          {activePanel === "tags" && (
            <>
              <div className="sidebar-header">
                <span>标签管理</span>
                <button onClick={onToggle} className="toggle-btn">◀</button>
              </div>
              <div className="panel-content">
                {/* Create Tag Form */}
                <div className="tag-create-section">
                  <input
                    type="text"
                    className="tag-name-input"
                    placeholder="新标签名称..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  />
                  <div className="tag-color-picker">
                    {DEFAULT_TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`color-btn ${newTagColor === color ? "selected" : ""}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewTagColor(color)}
                      />
                    ))}
                  </div>
                  <button className="tag-create-btn" onClick={handleCreateTag}>添加标签</button>
                </div>

                {/* Tag Cloud */}
                <div className="tag-cloud-section">
                  <div className="section-title">标签云</div>
                  {allTags.length === 0 ? (
                    <div className="empty-message">暂无标签</div>
                  ) : (
                    <div className="tag-cloud">
                      {allTags.map((tag) => (
                        <div key={tag.id} className="tag-cloud-item-wrapper">
                          {editingTag?.id === tag.id ? (
                            <div className="tag-edit-inline">
                              <input
                                type="text"
                                value={editingTag.name}
                                onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUpdateTag();
                                  else if (e.key === "Escape") setEditingTag(null);
                                }}
                                autoFocus
                              />
                              <div className="tag-color-picker small">
                                {DEFAULT_TAG_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    className={`color-btn ${editingTag.color === color ? "selected" : ""}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setEditingTag({ ...editingTag, color })}
                                  />
                                ))}
                              </div>
                              <button className="mini-btn save" onClick={handleUpdateTag}>OK</button>
                              <button className="mini-btn cancel" onClick={() => setEditingTag(null)}>×</button>
                            </div>
                          ) : (
                            <button
                              className={`tag-cloud-item ${selectedTag?.id === tag.id ? "selected" : ""}`}
                              style={{ backgroundColor: tag.color }}
                              onClick={() => setSelectedTag(selectedTag?.id === tag.id ? null : tag)}
                            >
                              {tag.name}
                            </button>
                          )}
                          <div className="tag-item-actions">
                            <button className="mini-btn" onClick={() => setEditingTag(tag)} title="编辑">✎</button>
                            <button className="mini-btn delete" onClick={() => handleDeleteTag(tag.id)} title="删除">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stocks with selected tag */}
                {selectedTag && (
                  <div className="tag-stocks-section">
                    <div className="section-title">
                      <span className="tag-indicator" style={{ backgroundColor: selectedTag.color }}></span>
                      {selectedTag.name} ({tagStocks.length})
                    </div>
                    {tagStocks.length === 0 ? (
                      <div className="empty-message">暂无相关股票</div>
                    ) : (
                      <div className="stock-list">
                        {tagStocks.map((stock) => (
                          <div
                            key={stock.symbol}
                            className="stock-item simple"
                            onClick={() => handleStockClick(stock)}
                          >
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
                        </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LeftSidebar;
