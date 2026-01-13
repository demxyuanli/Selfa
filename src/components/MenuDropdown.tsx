import React, { useState, useRef, useEffect } from "react";
import "./MenuDropdown.css";

interface MenuDropdownProps {
  label: string;
  items: MenuItem[];
  onItemClick: (action: string) => void;
}

interface MenuItem {
  label?: string;
  action?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

const MenuDropdown: React.FC<MenuDropdownProps> = ({ label, items, onItemClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleItemClick = (action: string, disabled?: boolean) => {
    if (!disabled) {
      onItemClick(action);
      setIsOpen(false);
    }
  };

  return (
    <div className="menu-dropdown" ref={dropdownRef}>
      <div
        className={`menu-dropdown-trigger ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {label}
      </div>
      {isOpen && (
        <div className="menu-dropdown-content">
          {items.map((item, index) =>
            item.separator ? (
              <div key={`separator-${index}`} className="menu-dropdown-separator" />
            ) : (
              <div
                key={item.action || `item-${index}`}
                className={`menu-dropdown-item ${item.disabled ? "disabled" : ""}`}
                onClick={() => item.action && handleItemClick(item.action, item.disabled)}
              >
                <span className="menu-dropdown-item-label">{item.label}</span>
                {item.shortcut && (
                  <span className="menu-dropdown-item-shortcut">{item.shortcut}</span>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default MenuDropdown;
export type { MenuItem };
