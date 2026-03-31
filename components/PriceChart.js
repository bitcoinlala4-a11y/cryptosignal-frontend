import { useEffect, useRef, useState } from "react";

const MARKETS = {
  BNB: { symbol: "bnbusdt", label: "BNB/USDT", color: "#f3ba2f" },
};

async function fetchHistory(symbol) {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=5m&limit=100`
  );
  const data = await res.json();
  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

export default function PriceChart({ market = "BNB", onMarketChange }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const wsRef = useRef(null);
  const mountedRef = useRef(true);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [change, setChange] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    let chart = null;

    async function init() {
      if (!containerRef.current) return;

      const { createChart, CandlestickSeries } = await import("lightweight-charts");
      if (!mountedRef.current || !containerRef.current) return;

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 240,
        layout: { background: { color: "#1a1a2e" }, textColor: "#555" },
        grid: { vertLines: { color: "#1f1f35" }, horzLines: { color: "#1f1f35" } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1f1f35" },
        timeScale: { borderColor: "#1f1f35", timeVisible: true, secondsVisible: false },
      });

      chartRef.current = chart;

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#34d399", downColor: "#f87171",
        borderUpColor: "#34d399", borderDownColor: "#f87171",
        wickUpColor: "#34d399", wickDownColor: "#f87171",
      });
      seriesRef.current = series;

      const ro = new ResizeObserver(() => {
        if (chartRef.current && containerRef.current) {
          try { chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); } catch {}
        }
      });
      if (containerRef.current) ro.observe(containerRef.current);

      const { symbol } = MARKETS[market] || MARKETS.BNB;

      try {
        const candles = await fetchHistory(symbol);
        if (!mountedRef.current) return;
        series.setData(candles);
        chart.timeScale().fitContent();
        const last = candles[candles.length - 1];
        setCurrentPrice(last.close);
        setChange(((last.close - candles[0].open) / candles[0].open * 100).toFixed(2));
      } catch {}

      if (!mountedRef.current) return;

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_5m`);
      wsRef.current = ws;
      ws.onopen = () => { if (mountedRef.current) setConnected(true); };
      ws.onclose = () => { if (mountedRef.current) setConnected(false); };
      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        const { k } = JSON.parse(e.data);
        const candle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o), high: parseFloat(k.h),
          low: parseFloat(k.l), close: parseFloat(k.c),
        };
        try { seriesRef.current?.update(candle); } catch {}
        setCurrentPrice(parseFloat(k.c));
        setChange(((parseFloat(k.c) - parseFloat(k.o)) / parseFloat(k.o) * 100).toFixed(2));
      };
    }

    init();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
      try { chart?.remove(); } catch {}
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [market]);

  const mkt = MARKETS[market] || MARKETS.BNB;
  const isUp = parseFloat(change) >= 0;

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={s.tabs}>
            {Object.keys(MARKETS).map((m) => (
              <button key={m}
                style={{ ...s.tab, ...(market === m ? { background: MARKETS[m].color, color: "#000" } : {}) }}
                onClick={() => onMarketChange?.(m)}
              >{m}</button>
            ))}
          </div>
          <span style={{ color: "#666", fontSize: 12 }}>{mkt.label}</span>
          <span style={{ color: "#555", fontSize: 11, background: "#0f0f1a", padding: "2px 8px", borderRadius: 4 }}>5 min</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#34d399" : "#ef4444", display: "inline-block" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {currentPrice ? (
            <>
              <span style={{ fontSize: 22, fontWeight: "bold", color: mkt.color }}>
                ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: 13, color: isUp ? "#34d399" : "#f87171" }}>
                {isUp ? "▲" : "▼"} {Math.abs(change)}%
              </span>
            </>
          ) : (
            <span style={{ color: "#666", fontSize: 13 }}>Chargement...</span>
          )}
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}

const s = {
  container: { background: "#1a1a2e", borderRadius: 12, padding: 20, marginBottom: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  tabs: { display: "flex", background: "#0f0f1a", borderRadius: 8, padding: 3, gap: 2 },
  tab: { padding: "5px 14px", border: "none", borderRadius: 6, color: "#999", background: "none", cursor: "pointer", fontSize: 13, fontWeight: "bold" },
};
