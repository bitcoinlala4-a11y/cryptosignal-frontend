import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";

const AllCharts = dynamic(() => import("../components/AllCharts"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";

const PAIR_COLORS = { BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", SOL: "#9945ff" };

export default function Dashboard() {
  const router = useRouter();
  const [userPlan, setUserPlan] = useState("free");
  const [allowedTimeframes, setAllowedTimeframes] = useState(["1h"]);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [signals, setSignals] = useState([]);
  const [signalStats, setSignalStats] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [overview, setOverview] = useState([]);
  const [fearGreed, setFearGreed] = useState(null);
  const [signalOfDay, setSignalOfDay] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [matrixTimeframes, setMatrixTimeframes] = useState([]);
  const [pancakePrediction, setPancakePrediction] = useState(null);
  const [pancakeHistory, setPancakeHistory] = useState([]);
  const [pancakeCountdown, setPancakeCountdown] = useState(null);
  const wsRef = useRef(null);
  const token = useRef(null);

  useEffect(() => {
    token.current = localStorage.getItem("token");
    if (!token.current) { router.push("/"); return; }
    loadAll(token.current);
    connectWS(token.current);
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, []);

  async function safeJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return {}; }
  }

  async function loadAll(t) {
    const planRes = await fetch(`${API}/api/billing/plan`, { headers: { Authorization: `Bearer ${t}` } });
    if (planRes.status === 401) { router.push("/"); return; }
    const planData = await safeJson(planRes);
    const plan = planData.plan || "free";
    setUserPlan(plan);

    const promises = [
      fetch(`${API}/api/market/overview`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/market/signal-of-day`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/signals?limit=100`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/signals/stats`).then(r => r.json()).catch(() => ({})),
    ];
    if (plan !== "free") promises.push(fetch(`${API}/api/market/matrix`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()).catch(() => ({})));
    if (plan === "elite") promises.push(loadPancake(t));

    const [overviewData, sodData, sigData, sigStatsData, matrixData] = await Promise.all(promises);
    if (overviewData?.overview) setOverview(overviewData.overview);
    if (overviewData?.fearGreed) setFearGreed(overviewData.fearGreed);
    if (sodData?.signal) setSignalOfDay(sodData.signal);
    if (sigData?.signals) setSignals(sigData.signals);
    if (sigData?.limits?.timeframes) { setAllowedTimeframes(sigData.limits.timeframes); setSelectedTimeframe(sigData.limits.timeframes[0]); }
    if (sigStatsData?.byType) setSignalStats(sigStatsData);
    if (matrixData?.matrix) { setMatrix(matrixData.matrix); setMatrixTimeframes(matrixData.timeframes || []); }
  }

  async function loadPancake(t) {
    const [predRes, histRes] = await Promise.all([
      fetch(`${API}/api/pancake/prediction`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`${API}/api/pancake/history`, { headers: { Authorization: `Bearer ${t}` } }),
    ]);
    const predData = await safeJson(predRes);
    const histData = await safeJson(histRes);
    if (predData.prediction) { setPancakePrediction(predData); setPancakeCountdown(predData.secondsToNextRound); }
    if (histData.history) setPancakeHistory(histData.history);
  }

  async function loadSignalsByTimeframe(tf) {
    setSelectedTimeframe(tf);
    const res = await fetch(`${API}/api/signals?limit=100&timeframe=${tf}`, { headers: { Authorization: `Bearer ${token.current}` } });
    const data = await safeJson(res);
    if (data.signals) setSignals(data.signals);
  }

  useEffect(() => {
    if (pancakeCountdown === null) return;
    if (pancakeCountdown <= 0) { if (token.current && userPlan === "elite") loadPancake(token.current); return; }
    const timer = setTimeout(() => setPancakeCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [pancakeCountdown]);

  useEffect(() => {
    if (userPlan !== "elite") return;
    const i = setInterval(() => { if (token.current) loadPancake(token.current); }, 60000);
    return () => clearInterval(i);
  }, [userPlan]);

  useEffect(() => {
    const i = setInterval(() => {
      fetch(`${API}/api/market/overview`).then(r => r.json()).then(d => {
        if (d.overview) setOverview(d.overview);
        if (d.fearGreed) setFearGreed(d.fearGreed);
      }).catch(() => {});
      fetch(`${API}/api/market/signal-of-day`).then(r => r.json()).then(d => { if (d.signal) setSignalOfDay(d.signal); }).catch(() => {});
    }, 120000);
    return () => clearInterval(i);
  }, []);

  function connectWS(t) {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(`${WS_URL}/ws?token=${t}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "new_signal") setSignals(prev => [msg.data, ...prev].slice(0, 100));
      if (msg.type === "signal_result") {
        setSignals(prev => prev.map(s => s.id === msg.data.id ? { ...s, result: msg.data.result, pnl_pct: msg.data.pnlPct } : s));
        fetch(`${API}/api/signals/stats`).then(r => r.json()).then(d => { if (d.byType) setSignalStats(d); });
      }
    };
    ws.onclose = () => setTimeout(() => connectWS(t), 3000);
  }

  function logout() { localStorage.removeItem("token"); router.push("/"); }

  const overall = signalStats?.overall;
  const winRate = overall?.total > 0 ? ((overall.wins / overall.total) * 100).toFixed(1) : null;

  return (
    <>
      <Head><title>Dashboard — CryptoSignal Pro</title></Head>
      <div style={s.page}>

        {/* Header */}
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={s.logo}>📈 CryptoSignal Pro</span>
            <span style={{ ...s.planBadge, background: userPlan === "free" ? "#1f2937" : userPlan === "pro" ? "#1f1535" : "#1a1200", color: userPlan === "free" ? "#6b7280" : userPlan === "pro" ? "#a78bfa" : "#f59e0b", border: `1px solid ${userPlan === "free" ? "#374151" : userPlan === "pro" ? "#7c3aed55" : "#f59e0b55"}` }}>
              {userPlan === "free" ? "FREE" : userPlan === "pro" ? "⚡ PRO" : "👑 ELITE"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {userPlan !== "elite" && <button style={s.upgradeBtn} onClick={() => router.push("/pricing")}>⬆ Upgrade</button>}
            <button style={s.logoutBtn} onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <div style={s.content}>

          {/* Signal du jour */}
          {signalOfDay && (
            <div style={{ ...s.sodBanner, borderLeft: `4px solid ${signalOfDay.direction === "long" ? "#34d399" : "#f87171"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: "bold" }}>⭐ SIGNAL DU JOUR</span>
                <span style={{ fontSize: 11, color: "#555" }}>Confluence {signalOfDay.aligned}/4 indicateurs alignés</span>
                {signalOfDay.confidence >= 0.75 && <span style={{ fontSize: 11, background: "#1a2e1a", color: "#34d399", padding: "2px 8px", borderRadius: 4 }}>🔥 Fort</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontWeight: "bold", fontSize: 18, color: PAIR_COLORS[signalOfDay.pair] || "#a78bfa" }}>{signalOfDay.pair}</span>
                <span style={{ fontWeight: "bold", fontSize: 20, color: signalOfDay.direction === "long" ? "#34d399" : "#f87171" }}>
                  {signalOfDay.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                </span>
                <span style={{ color: "#a78bfa", fontSize: 16, fontWeight: "bold" }}>{Math.round(signalOfDay.confidence * 100)}% confiance</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.entries(signalOfDay.details || {}).map(([ind, dir]) => (
                    <span key={ind} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: "#0f0f1a", color: dir === "long" ? "#34d399" : dir === "short" ? "#f87171" : "#555", fontWeight: "bold" }}>
                      {ind.toUpperCase()} {dir === "long" ? "▲" : dir === "short" ? "▼" : "—"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Ligne du haut : F&G + stats paires */}
          <div style={s.topRow}>
            {/* Fear & Greed */}
            {fearGreed && (
              <div style={s.fgBox}>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 6 }}>FEAR & GREED</div>
                <div style={{ fontSize: 40, fontWeight: "bold", color: fearGreed.value >= 60 ? "#34d399" : fearGreed.value >= 40 ? "#fbbf24" : "#f87171", lineHeight: 1 }}>
                  {fearGreed.value}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 8px" }}>{fearGreed.label}</div>
                <div style={{ background: "#0f0f1a", borderRadius: 3, height: 4, overflow: "hidden" }}>
                  <div style={{ width: `${fearGreed.value}%`, height: "100%", background: `linear-gradient(90deg, #f87171, #fbbf24 50%, #34d399)` }} />
                </div>
              </div>
            )}

            {/* Paires overview */}
            <div style={s.pairsGrid}>
              {overview.map(item => (
                <div key={item.pair} style={s.pairCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: "bold", color: PAIR_COLORS[item.pair] || "#fff", fontSize: 15 }}>{item.pair}</span>
                    <span style={{ fontSize: 12, fontWeight: "bold", color: parseFloat(item.change) >= 0 ? "#34d399" : "#f87171" }}>
                      {parseFloat(item.change) >= 0 ? "+" : ""}{item.change}%
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: "bold", color: "#fff", marginBottom: 6 }}>
                    ${parseFloat(item.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </div>
                  {/* Score bar */}
                  <div style={{ background: "#0f0f1a", borderRadius: 3, height: 5, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ width: `${item.score}%`, height: "100%", background: item.score >= 60 ? "#34d399" : item.score <= 40 ? "#f87171" : "#fbbf24", borderRadius: 3, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: item.color, fontWeight: "bold" }}>{item.label}</span>
                    <span style={{ color: "#555" }}>{item.score}/100</span>
                  </div>
                  {/* Stats 24h */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {item.high24h > 0 && <span style={{ fontSize: 10, color: "#34d399" }}>H: ${parseFloat(item.high24h).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                    {item.low24h > 0 && <span style={{ fontSize: 10, color: "#f87171" }}>L: ${parseFloat(item.low24h).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                    {item.volume24h > 0 && <span style={{ fontSize: 10, color: "#555" }}>Vol: ${(item.volume24h / 1e6).toFixed(0)}M</span>}
                    {item.fundingRate !== null && (
                      <span style={{ fontSize: 10, color: parseFloat(item.fundingRate) > 0 ? "#f87171" : "#34d399", fontWeight: "bold" }}>
                        FR: {parseFloat(item.fundingRate) > 0 ? "+" : ""}{item.fundingRate}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Win rate global */}
          <div style={s.statsBar}>
            <div style={s.statItem}><span style={{ color: "#34d399", fontWeight: "bold", fontSize: 20 }}>{winRate ? `${winRate}%` : "—"}</span><span style={{ color: "#555", fontSize: 11 }}>Win Rate</span></div>
            <div style={s.statDivider} />
            <div style={s.statItem}><span style={{ color: "#a78bfa", fontWeight: "bold", fontSize: 20 }}>{overall?.total || "—"}</span><span style={{ color: "#555", fontSize: 11 }}>Signaux évalués</span></div>
            <div style={s.statDivider} />
            <div style={s.statItem}><span style={{ color: "#60a5fa", fontWeight: "bold", fontSize: 20 }}>4</span><span style={{ color: "#555", fontSize: 11 }}>Paires</span></div>
            <div style={s.statDivider} />
            <div style={s.statItem}><span style={{ color: "#fbbf24", fontWeight: "bold", fontSize: 20 }}>{allowedTimeframes.length}</span><span style={{ color: "#555", fontSize: 11 }}>Timeframes</span></div>
          </div>

          {/* 4 graphiques */}
          <AllCharts />

          {/* Panel onglets */}
          <div style={s.panel}>
            <div style={s.tabBar}>
              {[
                { id: "overview", label: "📊 Vue d'ensemble" },
                { id: "signals", label: `⚡ Signaux (${signals.length})` },
                ...(userPlan !== "free" ? [{ id: "matrix", label: "🔲 Matrice" }] : []),
                ...(userPlan === "elite" ? [{ id: "pancake", label: "🥞 PancakeSwap" }] : []),
              ].map(tab => (
                <button key={tab.id} style={activeTab === tab.id ? s.tabActive : s.tab} onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Vue d'ensemble */}
            {activeTab === "overview" && (
              <div>
                <h3 style={{ fontSize: 13, color: "#555", margin: "0 0 12px", letterSpacing: 1 }}>PERFORMANCE PAR INDICATEUR</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                  {["rsi", "ema", "momentum", "macd"].map(type => {
                    const rows = (signalStats?.byType || []).filter(r => r.type === type);
                    const total = rows.reduce((s, r) => s + parseInt(r.total), 0);
                    const wins = rows.reduce((s, r) => s + parseInt(r.wins), 0);
                    const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : null;
                    const color = wr ? (parseFloat(wr) >= 50 ? "#34d399" : "#f87171") : "#333";
                    return (
                      <div key={type} style={s.indCard}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{type.toUpperCase()}</div>
                        <div style={{ fontSize: 28, fontWeight: "bold", color }}>{wr ? `${wr}%` : "—"}</div>
                        <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{total} signaux</div>
                        {total > 0 && (
                          <div style={{ background: "#1a1a2e", borderRadius: 2, height: 3, marginTop: 6, overflow: "hidden" }}>
                            <div style={{ width: `${wr}%`, height: "100%", background: color }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {overall?.total > 0 && (
                    <div style={{ ...s.indCard, background: "#1f1535", border: "1px solid #7c3aed33" }}>
                      <div style={{ fontSize: 11, color: "#7c3aed", marginBottom: 4 }}>GLOBAL</div>
                      <div style={{ fontSize: 28, fontWeight: "bold", color: overall.wins / overall.total >= 0.5 ? "#34d399" : "#f87171" }}>
                        {((overall.wins / overall.total) * 100).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{overall.total} évalués</div>
                    </div>
                  )}
                </div>
                {userPlan === "free" && (
                  <div style={s.upgradeBanner}>
                    <span>🔒 Plan Free : BTC & ETH uniquement, 1h, 5 signaux/jour</span>
                    <button style={s.upgradeBtn} onClick={() => router.push("/pricing")}>Passer au Pro →</button>
                  </div>
                )}
              </div>
            )}

            {/* Signaux */}
            {activeTab === "signals" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
                  {allowedTimeframes.map(tf => (
                    <button key={tf} onClick={() => loadSignalsByTimeframe(tf)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: selectedTimeframe === tf ? "bold" : "normal", background: selectedTimeframe === tf ? "#7c3aed" : "#0f0f1a", color: selectedTimeframe === tf ? "#fff" : "#666" }}>
                      {tf}
                    </button>
                  ))}
                  {userPlan === "free" && <span style={{ fontSize: 11, color: "#7c3aed", cursor: "pointer" }} onClick={() => router.push("/pricing")}>+ 5m 15m 30m 2h 4h (Pro)</span>}
                </div>

                {signals.length === 0 ? (
                  <p style={{ color: "#444", fontSize: 13, textAlign: "center", padding: 40 }}>En attente des premiers signaux ({selectedTimeframe})...</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1f1f35" }}>
                          {["Heure", "Paire", "TF", "Signal", "Direction", "Conf.", "Entrée", "Stop-Loss", "Take-Profit", "R/R", "Résultat", "PnL"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {signals.map((sig, i) => {
                          const entry = parseFloat(sig.price || sig.price_at_signal || 0);
                          const sl = parseFloat(sig.stop_loss || 0);
                          const tp = parseFloat(sig.take_profit || 0);
                          const rr = sl && tp && entry ? (Math.abs(tp - entry) / Math.abs(sl - entry)).toFixed(1) : null;
                          return (
                            <tr key={sig.id || i} style={{ borderBottom: "1px solid #151525", transition: "background 0.2s" }}
                              onMouseEnter={e => e.currentTarget.style.background = "#1f1f35"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <td style={s.td}>{new Date(sig.created_at || sig.createdAt).toLocaleTimeString("fr-FR")}</td>
                              <td style={{ ...s.td, fontWeight: "bold", color: PAIR_COLORS[sig.pair?.replace("USDT", "")] || "#a78bfa" }}>
                                {sig.pair?.replace("USDT", "")}
                              </td>
                              <td style={{ ...s.td, color: "#444", fontSize: 11 }}>{sig.timeframe || "5m"}</td>
                              <td style={{ ...s.td, color: "#9ca3af" }}>
                                {(sig.type || "").toUpperCase()}
                                {sig.volume_spike && <span style={{ marginLeft: 4, fontSize: 10 }}>🔥</span>}
                              </td>
                              <td style={{ ...s.td, color: sig.direction === "long" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                                {sig.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                              </td>
                              <td style={s.td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <div style={{ width: 40, height: 4, background: "#0f0f1a", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${(sig.confidence || 0) * 100}%`, height: "100%", background: "#7c3aed" }} />
                                  </div>
                                  <span>{sig.confidence != null ? `${(sig.confidence * 100).toFixed(0)}%` : "—"}</span>
                                </div>
                              </td>
                              <td style={{ ...s.td, color: "#fff", fontFamily: "monospace" }}>
                                ${entry.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ ...s.td, color: "#f87171", fontFamily: "monospace" }}>
                                {sl ? `$${sl.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td style={{ ...s.td, color: "#34d399", fontFamily: "monospace" }}>
                                {tp ? `$${tp.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
                              </td>
                              <td style={{ ...s.td, color: rr && parseFloat(rr) >= 1.5 ? "#34d399" : "#fbbf24" }}>
                                {rr ? `1:${rr}` : "—"}
                              </td>
                              <td style={{ ...s.td }}>
                                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold", background: sig.result === "win" ? "#0d2818" : sig.result === "loss" ? "#2a0f0f" : "#1f1f2e", color: sig.result === "win" ? "#34d399" : sig.result === "loss" ? "#f87171" : "#555" }}>
                                  {sig.result === "win" ? "✓ WIN" : sig.result === "loss" ? "✗ LOSS" : "⏳"}
                                </span>
                              </td>
                              <td style={{ ...s.td, color: sig.pnl_pct != null && sig.pnl_pct >= 0 ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                                {sig.pnl_pct != null ? `${sig.pnl_pct >= 0 ? "+" : ""}${parseFloat(sig.pnl_pct).toFixed(2)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Matrice */}
            {activeTab === "matrix" && userPlan !== "free" && (
              <div>
                <p style={{ color: "#555", fontSize: 12, marginBottom: 16 }}>Score de marché 0-100 par paire et timeframe. &gt;60 = haussier, &lt;40 = baissier.</p>
                {!matrix ? <p style={{ color: "#444", fontSize: 13 }}>Chargement...</p> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1f1f35" }}>
                          <th style={{ ...s.th, width: 60 }}>Paire</th>
                          {matrixTimeframes.map(tf => <th key={tf} style={{ ...s.th, textAlign: "center" }}>{tf}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {["BTC", "ETH", "BNB", "SOL"].map(pair => (
                          <tr key={pair} style={{ borderBottom: "1px solid #151525" }}>
                            <td style={{ ...s.td, fontWeight: "bold", color: PAIR_COLORS[pair] }}>{pair}</td>
                            {matrixTimeframes.map(tf => {
                              const cell = matrix[pair]?.[tf];
                              if (!cell) return <td key={tf} style={{ ...s.td, textAlign: "center", color: "#333" }}>—</td>;
                              const bg = cell.score >= 60 ? "#0d2818" : cell.score <= 40 ? "#2a0f0f" : "#1a1a0f";
                              return (
                                <td key={tf} style={{ ...s.td, textAlign: "center", background: bg, borderRadius: 4 }}>
                                  <div style={{ fontWeight: "bold", color: cell.color, fontSize: 16 }}>{cell.score}</div>
                                  <div style={{ fontSize: 9, color: cell.color, opacity: 0.7 }}>{cell.label}</div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* PancakeSwap */}
            {activeTab === "pancake" && userPlan === "elite" && (
              <div>
                {!pancakePrediction ? <p style={{ color: "#444", fontSize: 13 }}>Chargement...</p> : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                      <div style={{ background: "#0f0f1a", borderRadius: 12, padding: 24, textAlign: "center", border: `2px solid ${pancakePrediction.prediction === "BULL" ? "#34d39944" : "#f8717144"}` }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: 1 }}>PROCHAIN ROUND BNB</div>
                        <div style={{ fontSize: 52, fontWeight: "bold", color: pancakePrediction.prediction === "BULL" ? "#34d399" : "#f87171", lineHeight: 1, marginBottom: 8 }}>
                          {pancakePrediction.prediction === "BULL" ? "▲" : "▼"}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 }}>{pancakePrediction.prediction}</div>
                        <div style={{ fontSize: 13, color: "#666" }}>${parseFloat(pancakePrediction.price).toFixed(2)} BNB</div>
                        {pancakeCountdown !== null && (
                          <div style={{ marginTop: 16, fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: pancakeCountdown < 60 ? "#f87171" : "#a78bfa" }}>
                            {String(Math.floor(pancakeCountdown / 60)).padStart(2, "0")}:{String(pancakeCountdown % 60).padStart(2, "0")}
                          </div>
                        )}
                      </div>
                      <div style={{ background: "#0f0f1a", borderRadius: 12, padding: 24 }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 12, letterSpacing: 1 }}>ANALYSE</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ color: "#34d399" }}>BULL</span>
                          <span style={{ fontWeight: "bold", color: "#34d399", fontSize: 18 }}>{Math.round(pancakePrediction.bullScore * 100)}%</span>
                        </div>
                        <div style={{ background: "#1a1a2e", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 12 }}>
                          <div style={{ width: `${Math.round(pancakePrediction.bullScore * 100)}%`, height: "100%", background: "linear-gradient(90deg, #34d399, #7c3aed)" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ color: "#f87171" }}>BEAR</span>
                          <span style={{ fontWeight: "bold", color: "#f87171", fontSize: 18 }}>{Math.round(pancakePrediction.bearScore * 100)}%</span>
                        </div>
                        <div style={{ borderTop: "1px solid #1f1f35", paddingTop: 12, marginTop: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#555", fontSize: 12 }}>Confiance</span>
                            <span style={{ color: "#a78bfa", fontWeight: "bold" }}>{Math.round(pancakePrediction.confidence * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Historique */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#555", letterSpacing: 1 }}>HISTORIQUE DES PRÉDICTIONS</span>
                      {pancakeHistory.filter(h => h.result).length > 0 && (
                        <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: "bold" }}>
                          Win rate : {((pancakeHistory.filter(h => h.result === "win").length / pancakeHistory.filter(h => h.result).length) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1f1f35" }}>
                          {["Heure", "Prédiction", "Confiance", "Prix entrée", "Prix clôture", "Résultat"].map(h => <th key={h} style={s.th}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {pancakeHistory.map((h, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #151525" }}>
                            <td style={s.td}>{new Date(h.created_at).toLocaleTimeString("fr-FR")}</td>
                            <td style={{ ...s.td, color: h.prediction === "BULL" ? "#34d399" : "#f87171", fontWeight: "bold" }}>{h.prediction === "BULL" ? "▲ BULL" : "▼ BEAR"}</td>
                            <td style={s.td}>{Math.round(h.confidence * 100)}%</td>
                            <td style={{ ...s.td, fontFamily: "monospace" }}>{h.price_at_prediction ? `$${parseFloat(h.price_at_prediction).toFixed(2)}` : "—"}</td>
                            <td style={{ ...s.td, fontFamily: "monospace" }}>{h.price_at_close ? `$${parseFloat(h.price_at_close).toFixed(2)}` : "—"}</td>
                            <td style={s.td}>
                              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold", background: h.result === "win" ? "#0d2818" : h.result === "loss" ? "#2a0f0f" : "#1f1f2e", color: h.result === "win" ? "#34d399" : h.result === "loss" ? "#f87171" : "#555" }}>
                                {h.result === "win" ? "✓ WIN" : h.result === "loss" ? "✗ LOSS" : "⏳"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#070711", fontFamily: "'Inter', system-ui, sans-serif", color: "#e5e7eb" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: "1px solid #12122a", background: "#0a0a1a", position: "sticky", top: 0, zIndex: 100 },
  logo: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  planBadge: { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: "bold" },
  upgradeBtn: { padding: "7px 16px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 12 },
  logoutBtn: { padding: "7px 14px", background: "none", border: "1px solid #1f1f35", borderRadius: 6, color: "#555", cursor: "pointer", fontSize: 12 },
  content: { padding: "20px 24px", maxWidth: 1300, margin: "0 auto" },
  sodBanner: { background: "#0f0f1e", borderRadius: 10, padding: "14px 18px", marginBottom: 16, border: "1px solid #1f1f35" },
  topRow: { display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-start" },
  fgBox: { background: "#0f0f1e", borderRadius: 10, padding: "16px 20px", border: "1px solid #1f1f35", minWidth: 140 },
  pairsGrid: { flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  pairCard: { background: "#0f0f1e", borderRadius: 10, padding: 14, border: "1px solid #1f1f35" },
  statsBar: { display: "flex", background: "#0f0f1e", borderRadius: 10, padding: "14px 24px", marginBottom: 16, border: "1px solid #1f1f35", gap: 0, alignItems: "center" },
  statItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 32, background: "#1f1f35" },
  panel: { background: "#0f0f1e", borderRadius: 10, padding: "20px", border: "1px solid #1f1f35" },
  tabBar: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1f1f35", paddingBottom: 12, flexWrap: "wrap" },
  tab: { padding: "7px 16px", background: "none", border: "none", color: "#555", cursor: "pointer", borderRadius: 6, fontSize: 13 },
  tabActive: { padding: "7px 16px", background: "#7c3aed22", border: "1px solid #7c3aed44", color: "#a78bfa", cursor: "pointer", borderRadius: 6, fontSize: 13, fontWeight: "bold" },
  indCard: { background: "#0a0a1a", borderRadius: 8, padding: "12px 16px", minWidth: 90, border: "1px solid #1f1f35" },
  upgradeBanner: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1f1535", borderRadius: 8, padding: "12px 16px", border: "1px solid #7c3aed33", flexWrap: "wrap", gap: 10 },
  th: { textAlign: "left", padding: "8px 12px", fontWeight: "normal", color: "#444", fontSize: 11, letterSpacing: 0.5 },
  td: { padding: "9px 12px", color: "#9ca3af" },
};
