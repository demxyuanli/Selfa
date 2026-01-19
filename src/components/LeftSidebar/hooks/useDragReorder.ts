import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StockWithTags } from "../types";

export const useDragReorder = (
  setStocks: React.Dispatch<React.SetStateAction<StockWithTags[]>>,
  loadAllStocks: () => Promise<void>
) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingReorder, setIsDraggingReorder] = useState(false);

  const draggedIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

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
      setStocks((currentStocks) => {
        const newStocks = [...currentStocks];
        let targetIndex = currentDragOverIndex;

        if (targetIndex > currentDraggedIndex) {
          targetIndex = targetIndex - 1;
        }

        const [draggedItem] = newStocks.splice(currentDraggedIndex, 1);
        newStocks.splice(targetIndex, 0, draggedItem);

        const symbols = newStocks.map(stock => stock.symbol);
        invoke("update_stocks_order", { symbols })
          .then(() => {
            console.log("Order saved successfully");
          })
          .catch((error) => {
            console.error("Failed to save stock order:", error);
            loadAllStocks();
          });

        return newStocks;
      });
    }
  }, [setStocks, loadAllStocks]);

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

  return {
    draggedIndex,
    dragOverIndex,
    isDraggingReorder,
    handleFavoritesMouseDown,
  };
};
