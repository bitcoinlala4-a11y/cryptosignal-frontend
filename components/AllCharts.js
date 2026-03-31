import { useEffect, useRef, useState } from "react";

const PAIRS = [
  { symbol: "btcusdt", label: "BTC/USDT", color: "#f7931a" },
  { symbol: "ethusdt", label: "ETH/USDT", color: "#627eea" },
  { symbol: "bnbusdt", label: "BNB/USDT", color: "#f3ba2f" },
  { symbol: "solusdt", label: "SOL/USDT", color: "#9945ff" },
];

async function fetchHistory(symbol) {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=5m&limit=60`);
  const data = await res.json();
  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

function MiniChart({ symbol, label, color }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const wsRef = useRef(null);
  const mountedRef = useRef(true);
  const [price, setPrice] = useState(null);
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
        height: 160,
        layout: { background: { color: "#0f0f1a" }, textColor: "#555" },
        grid: { vertLines: { color: "#1a1a2e" }, horzLines: { color: "#1a1a2e" } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1f1f35", scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: "#1f1f35", timeVisible: true, secondsVisible: false },
        handleScroll: false,
        handleScale: false,
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

      try {
        const candles = await fetchHistory(symbol);
        if (!mountedRef.current) return;
        series.setData(candles);
        chart.timeScale().fitContent();
        const last = candles[candles.length - 1];
        setPrice(last.close);
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
        setPrice(parseFloat(k.c));
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
  }, [symbol]);

  const isUp = parseFloat(change) >= 0;

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: "bold", color, fontSize: 14 }}>{label}</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#34d399" : "#ef4444", display: "inline-block" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {price ? (
            <>
              <span style={{ fontSize: 15, fontWeight: "bold", color: "#fff" }}>
                ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: 12, color: isUp ? "#34d399" : "#f87171" }}>
                {isUp ? "▲" : "▼"} {Math.abs(change)}%
              </span>
            </>
          ) : (
            <span style={{ color: "#555", fontSize: 12 }}>Chargement...</span>
          )}
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}

export default function AllCharts() {
  return (
    <div style={s.grid}>
      {PAIRS.map((p) => (
        <MiniChart key={p.symbol} symbol={p.symbol} label={p.label} color={p.color} />
      ))}
    </div>
  );
}

const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 },
  card: { background: "#1a1a2e", borderRadius: 12, padding: 14, border: "1px solid #2d2d4e" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
};
