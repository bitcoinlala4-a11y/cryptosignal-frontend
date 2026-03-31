import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";

const AllCharts = dynamic(() => import("../components/AllCharts"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";

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

    // Charger tout en parallèle
    const promises = [
      fetch(`${API}/api/market/overview`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/market/signal-of-day`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/signals?limit=100`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/signals/stats`).then(r => r.json()).catch(() => ({})),
    ];

    if (plan !== "free") {
      promises.push(fetch(`${API}/api/market/matrix`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()).catch(() => ({})));
    }
    if (plan === "elite") {
      promises.push(loadPancake(t));
    }

    const [overviewData, sodData, sigData, sigStatsData, matrixData] = await Promise.all(promises);

    if (overviewData?.overview) setOverview(overviewData.overview);
    if (overviewData?.fearGreed) setFearGreed(overviewData.fearGreed);
    if (sodData?.signal) setSignalOfDay(sodData.signal);
    if (sigData?.signals) setSignals(sigData.signals);
    if (sigData?.limits?.timeframes) {
      setAllowedTimeframes(sigData.limits.timeframes);
      setSelectedTimeframe(sigData.limits.timeframes[0]);
    }
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
    const interval = setInterval(() => { if (token.current) loadPancake(token.current); }, 60000);
    return () => clearInterval(interval);
  }, [userPlan]);

  // Rafraîchir overview toutes les 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API}/api/market/overview`).then(r => r.json()).then(d => {
        if (d.overview) setOverview(d.overview);
        if (d.fearGreed) setFearGreed(d.fearGreed);
      }).catch(() => {});
    }, 120000);
    return () => clearInterval(interval);
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
          <span style={s.logo}>📈 CryptoSignal Pro</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: "bold",
              background: userPlan === "free" ? "#1f2937" : userPlan === "pro" ? "#1f1535" : "#1a1200",
              color: userPlan === "free" ? "#6b7280" : userPlan === "pro" ? "#a78bfa" : "#f59e0b",
              border: `1px solid ${userPlan === "free" ? "#374151" : userPlan === "pro" ? "#7c3aed44" : "#f59e0b44"}`
            }}>
              {userPlan === "free" ? "FREE" : userPlan === "pro" ? "⚡ PRO" : "👑 ELITE"}
            </span>
            {userPlan !== "elite" && <button style={s.upgradeBtn} onClick={() => router.push("/pricing")}>Upgrade</button>}
            <button style={s.logoutBtn} onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <div style={s.content}>

          {/* Signal du jour */}
          {signalOfDay && (
            <div style={{ ...s.sodCard, borderColor: signalOfDay.direction === "long" ? "#34d39944" : "#f8717144" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>⭐ SIGNAL DU JOUR — Confluence {signalOfDay.aligned}/4 indicateurs</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: "bold", color: "#a78bfa", fontSize: 16, marginRight: 12 }}>{signalOfDay.pair}</span>
                  <span style={{ fontWeight: "bold", color: signalOfDay.direction === "long" ? "#34d399" : "#f87171", fontSize: 18 }}>
                    {signalOfDay.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: "bold", color: "#a78bfa" }}>{Math.round(signalOfDay.confidence * 100)}%</div>
                  <div style={{ fontSize: 11, color: "#555" }}>confiance</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {Object.entries(signalOfDay.details || {}).map(([ind, dir]) => (
                  <span key={ind} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#0f0f1a",
                    color: dir === "long" ? "#34d399" : dir === "short" ? "#f87171" : "#555" }}>
                    {ind.toUpperCase()} {dir === "long" ? "▲" : dir === "short" ? "▼" : "—"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fear & Greed + Stats */}
          <div style={s.topRow}>
            {fearGreed && (
              <div style={s.fgCard}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>FEAR & GREED INDEX</div>
                <div style={{ fontSize: 42, fontWeight: "bold", color: fearGreed.value >= 60 ? "#34d399" : fearGreed.value >= 40 ? "#fbbf24" : "#f87171" }}>
                  {fearGreed.value}
                </div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{fearGreed.label}</div>
                <div style={{ background: "#0f0f1a", borderRadius: 4, height: 6, marginTop: 10, overflow: "hidden" }}>
                  <div style={{ width: `${fearGreed.value}%`, height: "100%", borderRadius: 4,
                    background: `linear-gradient(90deg, #f87171, #fbbf24, #34d399)` }} />
                </div>
              </div>
            )}
            <div style={s.statsRow}>
              <StatCard label="Win Rate Global" value={winRate ? `${winRate}%` : "—"} color="#34d399" />
              <StatCard label="Signaux évalués" value={overall?.total || "—"} color="#a78bfa" />
              <StatCard label="Paires" value="4" color="#60a5fa" />
              <StatCard label="Timeframes" value={allowedTimeframes.length} color="#fbbf24" />
            </div>
          </div>

          {/* Market Overview — scores par paire */}
          {overview.length > 0 && (
            <div style={s.overviewGrid}>
              {overview.map(item => (
                <div key={item.pair} style={{ ...s.overviewCard, borderColor: item.color + "33" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: "bold", fontSize: 16, color: "#fff" }}>{item.pair}</span>
                    <span style={{ fontSize: 13, color: parseFloat(item.change) >= 0 ? "#34d399" : "#f87171" }}>
                      {parseFloat(item.change) >= 0 ? "▲" : "▼"} {Math.abs(item.change)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>
                    ${parseFloat(item.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </div>
                  {/* Jauge score */}
                  <div style={{ background: "#0f0f1a", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ width: `${item.score}%`, height: "100%", borderRadius: 6,
                      background: item.score >= 60 ? "linear-gradient(90deg, #059669, #34d399)" : item.score <= 40 ? "linear-gradient(90deg, #dc2626, #f87171)" : "linear-gradient(90deg, #d97706, #fbbf24)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: "bold", color: item.color }}>{item.label}</span>
                    <span style={{ fontSize: 20, fontWeight: "bold", color: item.color }}>{item.score}/100</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 4 graphiques */}
          <AllCharts />

          {/* Panel onglets */}
          <div style={s.panel}>
            <div style={s.tabs}>
              <button style={activeTab === "overview" ? s.tabActive : s.tab} onClick={() => setActiveTab("overview")}>📊 Vue d'ensemble</button>
              <button style={activeTab === "signals" ? s.tabActive : s.tab} onClick={() => setActiveTab("signals")}>
                ⚡ Signaux ({signals.length})
              </button>
              {userPlan !== "free" && (
                <button style={activeTab === "matrix" ? s.tabActive : s.tab} onClick={() => setActiveTab("matrix")}>
                  🔲 Matrice
                </button>
              )}
              {userPlan === "elite" && (
                <button style={activeTab === "pancake" ? s.tabActive : s.tab} onClick={() => setActiveTab("pancake")}>
                  🥞 PancakeSwap
                </button>
              )}
            </div>

            {/* Onglet Vue d'ensemble */}
            {activeTab === "overview" && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, color: "#9ca3af", margin: "0 0 12px" }}>Performance par indicateur</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["rsi", "ema", "momentum", "macd"].map((type) => {
                      const rows = (signalStats?.byType || []).filter(r => r.type === type);
                      const total = rows.reduce((s, r) => s + parseInt(r.total), 0);
                      const wins = rows.reduce((s, r) => s + parseInt(r.wins), 0);
                      const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : null;
                      const color = wr && parseFloat(wr) >= 50 ? "#34d399" : "#f87171";
                      return (
                        <div key={type} style={{ background: "#0f0f1a", borderRadius: 10, padding: "12px 20px", textAlign: "center", minWidth: 90 }}>
                          <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{type.toUpperCase()}</div>
                          <div style={{ fontSize: 24, fontWeight: "bold", color: wr ? color : "#333" }}>{wr ? `${wr}%` : "—"}</div>
                          <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{total} signaux</div>
                        </div>
                      );
                    })}
                    {overall?.total > 0 && (
                      <div style={{ background: "#1f1535", borderRadius: 10, padding: "12px 20px", textAlign: "center", minWidth: 90, border: "1px solid #7c3aed33" }}>
                        <div style={{ fontSize: 11, color: "#7c3aed", marginBottom: 4 }}>GLOBAL</div>
                        <div style={{ fontSize: 24, fontWeight: "bold", color: overall.wins / overall.total >= 0.5 ? "#34d399" : "#f87171" }}>
                          {((overall.wins / overall.total) * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{overall.total} évalués</div>
                      </div>
                    )}
                  </div>
                </div>
                {userPlan === "free" && (
                  <div style={{ background: "#1f1535", borderRadius: 10, padding: 16, border: "1px solid #7c3aed44", textAlign: "center" }}>
                    <p style={{ color: "#9ca3af", margin: "0 0 12px", fontSize: 14 }}>
                      Plan Free : BTC & ETH uniquement, timeframe 1h, 5 signaux/jour
                    </p>
                    <button style={{ ...s.upgradeBtn, padding: "10px 24px", fontSize: 14 }} onClick={() => router.push("/pricing")}>
                      Passer au Pro — Débloquer tout →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Onglet Signaux */}
            {activeTab === "signals" && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {allowedTimeframes.map(tf => (
                    <button key={tf} onClick={() => loadSignalsByTimeframe(tf)}
                      style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
                        fontWeight: selectedTimeframe === tf ? "bold" : "normal",
                        background: selectedTimeframe === tf ? "#7c3aed" : "#0f0f1a",
                        color: selectedTimeframe === tf ? "#fff" : "#666" }}>
                      {tf}
                    </button>
                  ))}
                  {userPlan === "free" && (
                    <span style={{ fontSize: 12, color: "#7c3aed", alignSelf: "center", cursor: "pointer", marginLeft: 4 }}
                      onClick={() => router.push("/pricing")}>
                      + 5m, 15m, 30m, 2h, 4h (Pro) →
                    </span>
                  )}
                </div>

                {signals.length === 0 ? (
                  <p style={{ color: "#666", fontSize: 13 }}>En attente des premiers signaux ({selectedTimeframe})...</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: "#555" }}>
                          <th style={s.th}>Heure</th>
                          <th style={s.th}>Paire</th>
                          <th style={s.th}>TF</th>
                          <th style={s.th}>Signal</th>
                          <th style={s.th}>Direction</th>
                          <th style={s.th}>Confiance</th>
                          <th style={s.th}>Prix</th>
                          <th style={s.th}>Résultat</th>
                          <th style={s.th}>PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {signals.map((sig, i) => (
                          <tr key={sig.id || i} style={{ borderBottom: "1px solid #1f1f35" }}>
                            <td style={s.td}>{new Date(sig.created_at || sig.createdAt).toLocaleTimeString("fr-FR")}</td>
                            <td style={{ ...s.td, fontWeight: "bold", color: "#a78bfa" }}>{sig.pair?.replace("USDT", "")}</td>
                            <td style={{ ...s.td, color: "#555", fontSize: 11 }}>{sig.timeframe || "5m"}</td>
                            <td style={{ ...s.td, color: "#9ca3af" }}>{(sig.type || "").toUpperCase()}</td>
                            <td style={{ ...s.td, color: sig.direction === "long" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                              {sig.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                            </td>
                            <td style={s.td}>{sig.confidence != null ? `${(sig.confidence * 100).toFixed(0)}%` : "—"}</td>
                            <td style={s.td}>${parseFloat(sig.price || sig.price_at_signal || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                            <td style={{ ...s.td, color: sig.result === "win" ? "#34d399" : sig.result === "loss" ? "#f87171" : "#555" }}>
                              {sig.result === "win" ? "✓ WIN" : sig.result === "loss" ? "✗ LOSS" : "⏳"}
                            </td>
                            <td style={{ ...s.td, color: sig.pnl_pct != null && sig.pnl_pct >= 0 ? "#34d399" : "#f87171" }}>
                              {sig.pnl_pct != null ? `${sig.pnl_pct >= 0 ? "+" : ""}${parseFloat(sig.pnl_pct).toFixed(2)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Onglet Matrice — Pro/Elite */}
            {activeTab === "matrix" && userPlan !== "free" && (
              <div>
                <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
                  Chaque cellule montre le score de marché (0-100) pour la paire sur ce timeframe.
                </p>
                {!matrix ? (
                  <p style={{ color: "#666", fontSize: 13 }}>Chargement de la matrice...</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={{ ...s.th, color: "#555" }}>Paire</th>
                          {matrixTimeframes.map(tf => (
                            <th key={tf} style={{ ...s.th, color: "#555", textAlign: "center" }}>{tf}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {["BTC", "ETH", "BNB", "SOL"].map(pair => (
                          <tr key={pair} style={{ borderBottom: "1px solid #1f1f35" }}>
                            <td style={{ ...s.td, fontWeight: "bold", color: "#a78bfa" }}>{pair}</td>
                            {matrixTimeframes.map(tf => {
                              const cell = matrix[pair]?.[tf];
                              if (!cell) return <td key={tf} style={s.td}>—</td>;
                              return (
                                <td key={tf} style={{ ...s.td, textAlign: "center" }}>
                                  <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                    <span style={{ fontWeight: "bold", fontSize: 15, color: cell.color }}>{cell.score}</span>
                                    <span style={{ fontSize: 10, color: cell.color }}>{cell.label}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {userPlan === "pro" && (
                  <p style={{ textAlign: "center", color: "#555", fontSize: 12, marginTop: 12 }}>
                    <span style={{ color: "#f59e0b", cursor: "pointer" }} onClick={() => router.push("/pricing")}>
                      👑 Passer à Elite pour débloquer le timeframe 1j →
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Onglet PancakeSwap — Elite */}
            {activeTab === "pancake" && userPlan === "elite" && (
              <div>
                {!pancakePrediction ? (
                  <p style={{ color: "#666", fontSize: 13 }}>Chargement...</p>
                ) : (
                  <>
                    <div style={{ textAlign: "center", marginBottom: 24, padding: 24, background: "#0f0f1a", borderRadius: 12 }}>
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>PROCHAIN ROUND BNB — PANCAKESWAP</div>
                      <div style={{ fontSize: 56, fontWeight: "bold", color: pancakePrediction.prediction === "BULL" ? "#34d399" : "#f87171", marginBottom: 8 }}>
                        {pancakePrediction.prediction === "BULL" ? "▲ BULL" : "▼ BEAR"}
                      </div>
                      <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20 }}>
                        Confiance : <strong style={{ color: "#a78bfa" }}>{Math.round(pancakePrediction.confidence * 100)}%</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 20 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>BULL</div>
                          <div style={{ fontSize: 22, fontWeight: "bold", color: "#34d399" }}>{Math.round(pancakePrediction.bullScore * 100)}%</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>BEAR</div>
                          <div style={{ fontSize: 22, fontWeight: "bold", color: "#f87171" }}>{Math.round(pancakePrediction.bearScore * 100)}%</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Prix BNB</div>
                          <div style={{ fontSize: 22, fontWeight: "bold", color: "#fbbf24" }}>${parseFloat(pancakePrediction.price).toFixed(2)}</div>
                        </div>
                      </div>
                      <div style={{ background: "#1a1a2e", borderRadius: 6, height: 8, overflow: "hidden", margin: "0 auto 16px", maxWidth: 320 }}>
                        <div style={{ width: `${Math.round(pancakePrediction.bullScore * 100)}%`, height: "100%", background: "linear-gradient(90deg, #34d399, #7c3aed)", borderRadius: 6 }} />
                      </div>
                      {pancakeCountdown !== null && (
                        <div style={{ fontSize: 13, color: "#555" }}>
                          Prochain round dans{" "}
                          <span style={{ color: pancakeCountdown < 60 ? "#f87171" : "#a78bfa", fontWeight: "bold", fontFamily: "monospace", fontSize: 18 }}>
                            {String(Math.floor(pancakeCountdown / 60)).padStart(2, "0")}:{String(pancakeCountdown % 60).padStart(2, "0")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: "#666" }}>Historique</span>
                      {pancakeHistory.filter(h => h.result).length > 0 && (
                        <span style={{ color: "#a78bfa", fontSize: 13 }}>
                          Win rate : {((pancakeHistory.filter(h => h.result === "win").length / pancakeHistory.filter(h => h.result).length) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: "#555" }}>
                            <th style={s.th}>Heure</th><th style={s.th}>Prédiction</th>
                            <th style={s.th}>Confiance</th><th style={s.th}>Prix entrée</th>
                            <th style={s.th}>Prix clôture</th><th style={s.th}>Résultat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pancakeHistory.map((h, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #1f1f35" }}>
                              <td style={s.td}>{new Date(h.created_at).toLocaleTimeString("fr-FR")}</td>
                              <td style={{ ...s.td, color: h.prediction === "BULL" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                                {h.prediction === "BULL" ? "▲ BULL" : "▼ BEAR"}
                              </td>
                              <td style={s.td}>{Math.round(h.confidence * 100)}%</td>
                              <td style={s.td}>{h.price_at_prediction ? `$${parseFloat(h.price_at_prediction).toFixed(2)}` : "—"}</td>
                              <td style={s.td}>{h.price_at_close ? `$${parseFloat(h.price_at_close).toFixed(2)}` : "—"}</td>
                              <td style={{ ...s.td, color: h.result === "win" ? "#34d399" : h.result === "loss" ? "#f87171" : "#555" }}>
                                {h.result === "win" ? "✓ WIN" : h.result === "loss" ? "✗ LOSS" : "⏳"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

function StatCard({ label, value, color }) {
  return (
    <div style={s.statBox}>
      <div style={{ fontSize: 26, fontWeight: "bold", color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", fontFamily: "system-ui", color: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid #1f1f35" },
  logo: { fontSize: 18, fontWeight: "bold" },
  upgradeBtn: { padding: "7px 16px", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 },
  logoutBtn: { padding: "7px 14px", background: "none", border: "1px solid #333", borderRadius: 8, color: "#9ca3af", cursor: "pointer", fontSize: 13 },
  content: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  sodCard: { background: "#1a1a2e", borderRadius: 12, padding: "16px 20px", marginBottom: 16, border: "1px solid" },
  topRow: { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  fgCard: { background: "#1a1a2e", borderRadius: 12, padding: "20px 24px", border: "1px solid #2d2d4e", minWidth: 160 },
  statsRow: { flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  statBox: { background: "#1a1a2e", borderRadius: 12, padding: "16px 20px", border: "1px solid #2d2d4e" },
  overviewGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 },
  overviewCard: { background: "#1a1a2e", borderRadius: 12, padding: 16, border: "1px solid" },
  panel: { background: "#1a1a2e", borderRadius: 12, padding: 20, border: "1px solid #2d2d4e" },
  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid #1f1f35", paddingBottom: 12, flexWrap: "wrap" },
  tab: { padding: "8px 16px", background: "none", border: "none", color: "#666", cursor: "pointer", borderRadius: 8, fontSize: 13 },
  tabActive: { padding: "8px 16px", background: "#7c3aed", border: "none", color: "#fff", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: "bold" },
  th: { textAlign: "left", padding: "8px 12px", fontWeight: "normal", borderBottom: "1px solid #1f1f35", color: "#555" },
  td: { padding: "10px 12px", color: "#e5e7eb" },
};
