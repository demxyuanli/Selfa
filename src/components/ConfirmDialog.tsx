import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <Icon name="info" size={20} />
          <h3>{t("app.message") || "Message"}</h3>
          <button
            type="button"
            className="confirm-dialog-close"
            onClick={onCancel}
            aria-label={t("common.close") || "Close"}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="confirm-dialog-content">
          <p>{message}</p>
        </div>
        <div className="confirm-dialog-footer">
          <button
            type="button"
            className="confirm-dialog-button cancel"
            onClick={onCancel}
          >
            {t("common.cancel") || "Cancel"}
          </button>
          <button
            type="button"
            className="confirm-dialog-button confirm"
            onClick={onConfirm}
          >
            {t("common.confirm") || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
