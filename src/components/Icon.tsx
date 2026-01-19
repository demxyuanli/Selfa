import React, { useState, useEffect } from "react";
import {
  Search24Regular,
  Search24Filled,
  Star24Regular,
  Star24Filled,
  Folder24Regular,
  Folder24Filled,
  Tag24Regular,
  Tag24Filled,
  Settings24Regular,
  Settings24Filled,
  Dismiss24Regular,
  Dismiss24Filled,
  Subtract24Regular,
  Square24Regular,
  SquareMultiple24Regular,
  Edit24Regular,
  Edit24Filled,
  Delete24Regular,
  ChevronLeft24Regular,
  ChevronRight24Regular,
  ChevronUp24Regular,
  ChevronDown24Regular,
  Add24Regular,
  ArrowSync24Regular,
  ArrowSync24Filled,
  ArrowDownload24Regular,
  ArrowDownload24Filled,
  DataLine24Regular,
  DataLine24Filled,
  DataArea24Regular,
  DataArea24Filled,
  Pause24Regular,
  Play24Regular,
  Circle24Regular,
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Warning24Regular,
  ArrowTrending24Regular,
  ArrowTrendingDown24Regular,
  ArrowRight24Regular,
  ArrowUp24Regular,
  ArrowDown24Regular,
  Sparkle24Regular,
  ChartMultiple24Regular,
  Comment24Regular,
} from "@fluentui/react-icons";

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  filled?: boolean;
  primaryFill?: string;
}

const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 16, 
  className = "",
  filled,
  primaryFill 
}) => {
  const [isDark, setIsDark] = useState(() => {
    const root = document.documentElement;
    return root.getAttribute("data-theme") !== "light";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const root = document.documentElement;
      setIsDark(root.getAttribute("data-theme") !== "light");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Also listen for settings changes
    const handleSettingsChange = () => {
      const root = document.documentElement;
      setIsDark(root.getAttribute("data-theme") !== "light");
    };

    window.addEventListener("settingsChanged", handleSettingsChange);
    window.addEventListener("storage", handleSettingsChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("settingsChanged", handleSettingsChange);
      window.removeEventListener("storage", handleSettingsChange);
    };
  }, []);
  
  // Use filled version for dark theme, regular for light theme (or when explicitly set)
  const useFilled = filled !== undefined ? filled : isDark;

  const iconStyle: React.CSSProperties = {
    width: size,
    height: size,
    color: primaryFill || "currentColor",
    display: "inline-flex",
    flexShrink: 0,
  };

  const iconProps = {
    className,
    style: iconStyle,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "search":
      return useFilled ? <Search24Filled {...iconProps} /> : <Search24Regular {...iconProps} />;
    case "star":
    case "favorites":
      return useFilled ? <Star24Filled {...iconProps} /> : <Star24Regular {...iconProps} />;
    case "folder":
    case "groups":
      return useFilled ? <Folder24Filled {...iconProps} /> : <Folder24Regular {...iconProps} />;
    case "tag":
    case "tags":
      return useFilled ? <Tag24Filled {...iconProps} /> : <Tag24Regular {...iconProps} />;
    case "settings":
      return useFilled ? <Settings24Filled {...iconProps} /> : <Settings24Regular {...iconProps} />;
    case "close":
    case "dismiss":
      return useFilled ? <Dismiss24Filled {...iconProps} /> : <Dismiss24Regular {...iconProps} />;
    case "minimize":
      return <Subtract24Regular {...iconProps} />;
    case "maximize":
      return <Square24Regular {...iconProps} />;
    case "restore":
      return <SquareMultiple24Regular {...iconProps} />;
    case "edit":
      return useFilled ? <Edit24Filled {...iconProps} /> : <Edit24Regular {...iconProps} />;
    case "delete":
      return <Delete24Regular {...iconProps} />;
    case "chevronLeft":
    case "left":
      return <ChevronLeft24Regular {...iconProps} />;
    case "chevronRight":
    case "right":
      return <ChevronRight24Regular {...iconProps} />;
    case "chevronUp":
    case "up":
      return <ChevronUp24Regular {...iconProps} />;
    case "chevronDown":
    case "down":
      return <ChevronDown24Regular {...iconProps} />;
    case "add":
    case "plus":
      return <Add24Regular {...iconProps} />;
    case "refresh":
    case "sync":
      return useFilled ? <ArrowSync24Filled {...iconProps} /> : <ArrowSync24Regular {...iconProps} />;
    case "export":
    case "download":
      return useFilled ? <ArrowDownload24Filled {...iconProps} /> : <ArrowDownload24Regular {...iconProps} />;
    case "chartLine":
    case "timeSeries":
      return useFilled ? <DataLine24Filled {...iconProps} /> : <DataLine24Regular {...iconProps} />;
    case "chartBar":
    case "kline":
      return useFilled ? <DataArea24Filled {...iconProps} /> : <DataArea24Regular {...iconProps} />;
    case "pause":
      return <Pause24Regular {...iconProps} />;
    case "play":
      return <Play24Regular {...iconProps} />;
    case "circle":
      return <Circle24Regular {...iconProps} />;
    case "checkmarkCircle":
    case "success":
      return <CheckmarkCircle24Regular {...iconProps} />;
    case "errorCircle":
    case "error":
      return <ErrorCircle24Regular {...iconProps} />;
    case "warning":
      return <Warning24Regular {...iconProps} />;
    case "trendUp":
    case "arrowTrendingUp":
      return <ArrowTrending24Regular {...iconProps} />;
    case "trendDown":
    case "arrowTrendingDown":
      return <ArrowTrendingDown24Regular {...iconProps} />;
    case "trendSideways":
    case "arrowRight":
      return <ArrowRight24Regular {...iconProps} />;
    case "arrowUp":
    case "upArrow":
      return <ArrowUp24Regular {...iconProps} />;
    case "arrowDown":
    case "downArrow":
      return <ArrowDown24Regular {...iconProps} />;
    case "prediction":
    case "sparkles":
    case "magic":
      return <Sparkle24Regular {...iconProps} />;
    case "chart":
    case "chartMultiple":
      return <ChartMultiple24Regular {...iconProps} />;
    case "comment":
    case "comments":
    case "note":
      return <Comment24Regular {...iconProps} />;
    default:
      return null;
  }
};

export default Icon;
