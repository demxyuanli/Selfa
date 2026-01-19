import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ChartDialog from "./ChartDialog";
import { getAnalysisParams, getTechnicalIndicatorParams } from "../utils/settings";
import ParamsPanel from "./StockAnalysis/components/ParamsPanel";
import ResultsPanel from "./StockAnalysis/components/ResultsPanel";
import ChartPanel from "./StockAnalysis/components/ChartPanel";
import { StockAnalysisProps, TimeSeriesParams, KLineParams } from "./StockAnalysis/types";
import { calculateTimeSeriesResults, calculateKLineResults } from "./StockAnalysis/utils/analysisCalculations";
import { generateChartOption } from "./StockAnalysis/chartOptions/generateChartOption";
import "./StockAnalysis.css";

const StockAnalysis: React.FC<StockAnalysisProps> = ({
  timeSeriesData,
  klineData,
  analysisType,
}) => {
  const { t } = useTranslation();
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false);
  
  const analysisDefaults = getAnalysisParams();
  const indicatorDefaults = getTechnicalIndicatorParams();
  
  const [tsParams, setTsParams] = useState<TimeSeriesParams>({ 
    maPeriod: analysisDefaults.maPeriod, 
    volumeMultiplier: analysisDefaults.volumeMultiplier 
  });
  const [klParams, setKlParams] = useState<KLineParams>({ 
    macdFast: indicatorDefaults.macdFast, 
    macdSlow: indicatorDefaults.macdSlow, 
    macdSignal: indicatorDefaults.macdSignal, 
    rsiPeriod: indicatorDefaults.rsiPeriod, 
    kdjPeriod: indicatorDefaults.kdjPeriod, 
    bbPeriod: indicatorDefaults.bbPeriod, 
    atrPeriod: indicatorDefaults.atrPeriod, 
    trendDays: analysisDefaults.trendDays
  });

  const timeSeriesResults = useMemo(() => calculateTimeSeriesResults(timeSeriesData, tsParams), [timeSeriesData, tsParams]);

  const klineResults = useMemo(() => calculateKLineResults(klineData, klParams, t), [klineData, klParams, t]);

  const currentResults = analysisType === "timeseries" ? timeSeriesResults : klineResults;

  const chartOption = useMemo(() => generateChartOption({
    analysisType,
    timeSeriesData,
    klineData,
    tsParams,
    t,
  }), [analysisType, timeSeriesData, klineData, tsParams, t]);

  return (
    <div className="stock-analysis">
      <div className="analysis-columns">
        <ParamsPanel
          analysisType={analysisType}
          tsParams={tsParams}
          klParams={klParams}
          onTsParamsChange={setTsParams}
          onKlParamsChange={setKlParams}
        />

        <div className="column-divider" />

        <ResultsPanel results={currentResults} />

        <div className="column-divider" />

        <ChartPanel chartOption={chartOption} onZoom={() => setIsChartDialogOpen(true)} />
      </div>
      <ChartDialog
        isOpen={isChartDialogOpen}
        onClose={() => setIsChartDialogOpen(false)}
        title={`${t("analysis.timeSeries")} - ${t("chart.title")}`}
        chartOption={chartOption}
      />
    </div>
  );
};

export default StockAnalysis;
