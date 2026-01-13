import React from "react";
import { useTranslation } from "react-i18next";
import "./MenuBar.css";

const MenuBar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="menu-bar">
      <div className="menu-items">
        <div className="menu-item">{t("menu.file")}</div>
        <div className="menu-item">{t("menu.edit")}</div>
        <div className="menu-item">{t("menu.view")}</div>
        <div className="menu-item">{t("menu.analysis")}</div>
        <div className="menu-item">{t("menu.help")}</div>
      </div>
    </div>
  );
};

export default MenuBar;
