import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAlert } from "../contexts/AlertContext";
import Icon from "./Icon";
import "./StockComments.css";

interface StockComment {
  id: string;
  content: string;
  timestamp: number;
  price?: number;
  changePercent?: number;
}

interface StockCommentsProps {
  symbol: string;
  quote?: any;
}

const StockComments: React.FC<StockCommentsProps> = ({ symbol, quote }) => {
  const { t } = useTranslation();
  const { showConfirm } = useAlert();
  const [comments, setComments] = useState<StockComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const STORAGE_KEY = `stock_comments_${symbol}`;

  useEffect(() => {
    loadComments();
  }, [symbol]);

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [comments]);

  const loadComments = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StockComment[];
        setComments(parsed.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setComments([]);
      }
    } catch (err) {
      console.error("Error loading comments:", err);
      setComments([]);
    }
  };

  const saveComments = (updatedComments: StockComment[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedComments));
    } catch (err) {
      console.error("Error saving comments:", err);
    }
  };

  const handleAddComment = () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;

    const comment: StockComment = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: trimmed,
      timestamp: Date.now(),
      price: quote?.price,
      changePercent: quote?.change_percent,
    };

    const updated = [comment, ...comments];
    setComments(updated);
    saveComments(updated);
    setNewComment("");
    setIsAdding(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleDeleteComment = async (id: string) => {
    const ok = await showConfirm(t("comments.confirmDelete"));
    if (!ok) return;
    const updated = comments.filter((c) => c.id !== id);
    setComments(updated);
    saveComments(updated);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("comments.justNow");
    if (diffMins < 60) return `${diffMins}${t("comments.minutesAgo")}`;
    if (diffHours < 24) return `${diffHours}${t("comments.hoursAgo")}`;
    if (diffDays < 7) return `${diffDays}${t("comments.daysAgo")}`;

    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setNewComment("");
    }
  };

  return (
    <div className="stock-comments">
      <div className="comments-header">
        <div className="comments-title">{t("comments.title")}</div>
        <div className="comments-count">{comments.length} {t("comments.items")}</div>
      </div>

      <div className="comments-content">
        <div className="comments-list">
          {comments.length === 0 ? (
            <div className="comments-empty">
              <Icon name="comment" size={32} />
              <div className="empty-text">{t("comments.noComments")}</div>
              <div className="empty-hint">{t("comments.addFirstComment")}</div>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-header">
                  <div className="comment-meta">
                    <span className="comment-time">{formatDate(comment.timestamp)}</span>
                    {comment.price !== undefined && (
                      <span className="comment-price">
                        ¥{comment.price.toFixed(2)}
                        {comment.changePercent !== undefined && (
                          <span className={comment.changePercent >= 0 ? "up" : "down"}>
                            {comment.changePercent >= 0 ? "+" : ""}
                            {comment.changePercent.toFixed(2)}%
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <button
                    className="comment-delete-btn"
                    onClick={() => handleDeleteComment(comment.id)}
                    title={t("comments.delete")}
                    aria-label={t("comments.delete")}
                  >
                    <Icon name="delete" size={14} />
                  </button>
                </div>
                <div className="comment-content">{comment.content}</div>
              </div>
            ))
          )}
          <div ref={commentsEndRef} />
        </div>

        <div className="comments-input-section">
          {isAdding || newComment ? (
            <div className="comment-input-wrapper">
              <textarea
                ref={textareaRef}
                className="comment-input"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("comments.placeholder")}
                rows={3}
                autoFocus
              />
              <div className="comment-input-actions">
                <button
                  className="comment-cancel-btn"
                  onClick={() => {
                    setIsAdding(false);
                    setNewComment("");
                  }}
                >
                  {t("comments.cancel")}
                </button>
                <button
                  className="comment-submit-btn"
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                >
                  {t("comments.add")}
                </button>
              </div>
              <div className="comment-input-hint">
                {t("comments.hint")}: Enter to submit, Shift+Enter for new line, Esc to cancel
              </div>
            </div>
          ) : (
            <button
              className="comment-add-btn"
              onClick={() => {
                setIsAdding(true);
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
            >
              + {t("comments.addComment")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockComments;
