import { useEffect, useRef } from "react";
import { isTradingHours } from "../services/StockDataManager";

export interface UseTradingHoursTimeseriesRefreshOptions {
  enabled?: boolean;
  intervalInMs?: number;
}

/**
 * During trading hours (09:30-11:30 and 13:00-15:00):
 * If intervalInMs is provided, runs fetch at that interval.
 * If intervalInMs is NOT provided, runs fetch aligned with system clock's minute boundaries (00 seconds).
 * Also fetches immediately when transitioning into trading hours.
 * Outside trading hours: no periodic fetch.
 */
export function useTradingHoursTimeseriesRefresh(
  fetchFn: () => void | Promise<void>,
  options: UseTradingHoursTimeseriesRefreshOptions = {}
): void {
  const { enabled = true, intervalInMs } = options;
  const wasInTradingRef = useRef<boolean>(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isScheduledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    const runFetch = () => {
      const p = fetchFn();
      if (p && typeof (p as Promise<unknown>).catch === "function") {
        (p as Promise<unknown>).catch(() => {});
      }
    };

    // Mode 1: Simple Interval (if intervalInMs is provided)
    if (intervalInMs) {
      const checkAndRun = () => {
        if (isTradingHours()) {
          runFetch();
        }
      };

      // Run immediately if in trading hours
      checkAndRun();

      intervalIdRef.current = setInterval(checkAndRun, intervalInMs);

      return () => {
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
      };
    }

    // Mode 2: Minute Alignment (default)
    const scheduleNextMinute = () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }

      const now = new Date();
      const seconds = now.getSeconds();
      const milliseconds = now.getMilliseconds();
      
      // Calculate time until next minute start (plus a small buffer to ensure we are in the next minute)
      const msToNextMinute = 60000 - (seconds * 1000 + milliseconds) + 50;
      
      timeoutIdRef.current = setTimeout(() => {
        // Only run if still in trading hours
        if (isTradingHours()) {
          runFetch();
          scheduleNextMinute();
        } else {
          isScheduledRef.current = false;
        }
      }, msToNextMinute);
      
      isScheduledRef.current = true;
    };

    const checkAndSchedule = () => {
      const inTrading = isTradingHours();
      
      if (inTrading) {
        // If we just entered trading hours or haven't scheduled yet
        if (!wasInTradingRef.current || !isScheduledRef.current) {
          // Fetch immediately on entry or first mount in trading hours
          runFetch();
          wasInTradingRef.current = true;
          scheduleNextMinute();
        }
      } else {
        wasInTradingRef.current = false;
        isScheduledRef.current = false;
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }
      }
    };

    // Initial check
    checkAndSchedule();

    // Periodic check to handle transitions into trading hours
    // We can check less frequently now since the main loop is self-scheduling
    const checkIntervalId = setInterval(checkAndSchedule, 5000);

    return () => {
      clearInterval(checkIntervalId);
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [enabled, intervalInMs, fetchFn]);
}
