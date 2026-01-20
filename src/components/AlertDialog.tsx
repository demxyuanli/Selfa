import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import "./AlertDialog.css";

interface AlertDialogProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

const AlertDialog: React.FC<AlertDialogProps> = ({ isOpen, message, onClose }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="alert-dialog-overlay" onClick={onClose}>
      <div className="alert-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="alert-dialog-header">
          <Icon name="info" size={20} />
          <h3>{t("app.message") || "Message"}</h3>
          <button className="alert-dialog-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="alert-dialog-content">
          <p>{message}</p>
        </div>
        <div className="alert-dialog-footer">
          <button className="alert-dialog-button" onClick={onClose}>
            {t("settings.cancel") || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertDialog;
