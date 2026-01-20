import React from "react";
import { useTranslation } from "react-i18next";
import { PortfolioPosition } from "./types";

interface PositionsTableProps {
  positions: PortfolioPosition[];
}

const PositionsTable: React.FC<PositionsTableProps> = ({ positions }) => {
  const { t } = useTranslation();

  return (
    <div className="portfolio-positions">
      <div className="section-header">{t("portfolio.positions")}</div>
      <div className="positions-table">
        <table>
          <thead>
            <tr>
              <th>{t("portfolio.symbol")}</th>
              <th>{t("portfolio.name")}</th>
              <th>{t("portfolio.quantity")}</th>
              <th>{t("portfolio.avgCost")}</th>
              <th>{t("portfolio.currentPrice")}</th>
              <th>{t("portfolio.marketValue")}</th>
              <th>{t("portfolio.profit")}</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  {t("portfolio.noPositions")}
                </td>
              </tr>
            ) : (
              positions.map((position) => (
                <tr key={position.id}>
                  <td>{position.symbol}</td>
                  <td
                    className={`portfolio-name ${
                      position.change_percent !== undefined
                        ? position.change_percent > 0
                          ? "up"
                          : position.change_percent < 0
                          ? "down"
                          : ""
                        : ""
                    }`}
                  >
                    {position.name}
                  </td>
                  <td>{position.quantity}</td>
                  <td>¥{position.avgCost.toFixed(2)}</td>
                  <td>¥{position.currentPrice.toFixed(2)}</td>
                  <td>¥{position.marketValue.toFixed(2)}</td>
                  <td className={position.profit >= 0 ? "positive" : "negative"}>
                    {position.profit >= 0 ? "+" : ""}¥{position.profit.toFixed(2)} ({position.profitPercent.toFixed(2)}%)
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PositionsTable;
