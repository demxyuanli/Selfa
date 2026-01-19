export const getIconSvg = (iconName: string, size: number = 14, color: string = "currentColor"): string => {
  const svgStyle = `width:${size}px;height:${size}px;display:inline-block;vertical-align:middle;fill:${color};`;
  
  switch (iconName) {
    case "trendUp":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 18.5L9.5 12.5L13.5 16.5L22 8L20.5 6.5L13.5 13.5L9.5 9.5L2 17L3.5 18.5Z" fill="${color}"/></svg>`;
    case "trendDown":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 5.5L9.5 11.5L13.5 7.5L22 16L20.5 17.5L13.5 10.5L9.5 14.5L2 7L3.5 5.5Z" fill="${color}"/></svg>`;
    case "trendSideways":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 12H21L18 9L19.5 7.5L24 12L19.5 16.5L18 15L21 12H3Z" fill="${color}"/></svg>`;
    case "arrowUp":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4L12.7071 3.29289L12 2.58579L11.2929 3.29289L12 4ZM11 20C11 20.5523 11.4477 21 12 21C12.5523 21 13 20.5523 13 20L11 20ZM6.70711 9.29289L12.7071 3.29289L11.2929 1.87868L5.29289 7.87868L6.70711 9.29289ZM11.2929 3.29289L17.2929 9.29289L18.7071 7.87868L12.7071 1.87868L11.2929 3.29289ZM11 4L11 20L13 20L13 4L11 4Z" fill="${color}"/></svg>`;
    case "arrowDown":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 20L11.2929 20.7071L12 21.4142L12.7071 20.7071L12 20ZM13 4C13 3.44772 12.5523 3 12 3C11.4477 3 11 3.44772 11 4L13 4ZM17.2929 14.7071L11.2929 20.7071L12.7071 22.1213L18.7071 16.1213L17.2929 14.7071ZM12.7071 20.7071L6.70711 14.7071L5.29289 16.1213L11.2929 22.1213L12.7071 20.7071ZM13 20L13 4L11 4L11 20L13 20Z" fill="${color}"/></svg>`;
    case "prediction":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="${color}"/></svg>`;
    case "chart":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 3V21H21V19H5V3H3ZM7 17H9V10H7V17ZM11 17H13V7H11V17ZM15 17H17V13H15V17Z" fill="${color}"/></svg>`;
    case "buy":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="#00ff00"/></svg>`;
    case "sell":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM17 15.59L15.59 17L12 13.41L8.41 17L7 15.59L10.59 12L7 8.41L8.41 7L12 10.59L15.59 7L17 8.41L13.41 12L17 15.59Z" fill="#ff0000"/></svg>`;
    case "neutral":
      return `<svg style="${svgStyle}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="#ffaa00"/></svg>`;
    default:
      return "";
  }
};

export const getIconText = (iconName: string): string => {
  switch (iconName) {
    case "trendUp":
      return "↑";
    case "trendDown":
      return "↓";
    case "trendSideways":
      return "→";
    case "arrowUp":
      return "↑";
    case "arrowDown":
      return "↓";
    case "prediction":
      return "◆";
    case "chart":
      return "▊";
    case "buy":
      return "✓";
    case "sell":
      return "✕";
    case "neutral":
      return "○";
    default:
      return "";
  }
};
