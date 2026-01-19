import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import "./LanguageSelector.css";

const LanguageSelector: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: "en", name: t("language.en"), flag: "🌐" },
    { code: "zh", name: t("language.zh"), flag: "🇨🇳" },
    { code: "ja", name: t("language.ja"), flag: "🇯🇵" },
  ];

  const currentLanguage = languages.find((lang) => i18n.language === lang.code) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="language-selector" ref={dropdownRef}>
      <button className="language-button" onClick={() => setIsOpen(!isOpen)} title={t("language.select")}>
        <span className="language-flag">{currentLanguage.flag}</span>
        <span className="language-arrow">
          {isOpen ? <Icon name="chevronUp" size={10} /> : <Icon name="chevronDown" size={10} />}
        </span>
      </button>
      {isOpen && (
        <div className="language-dropdown">
          {languages.map((lang) => (
            <div
              key={lang.code}
              className={`language-option ${i18n.language === lang.code ? "active" : ""}`}
              onClick={() => handleLanguageChange(lang.code)}
            >
              <span className="language-flag">{lang.flag}</span>
              <span className="language-name">{lang.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
