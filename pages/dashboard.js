import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const PriceChart = dynamic(() => import("../components/PriceChart"), { ssr: false });
const RoundTimer = dynamic(() => import("../components/RoundTimer"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";

const DEFAULT_STATS = { total_bets: 0, wins: 0, losses: 0, total_won: 0, total_lost: 0, virtual_balance: 0 };

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [status, setStatus] = useState("stopped");
  const [logs, setLogs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [config, setConfig] = useState({
    strategy: "contrarian", betAmount: "0.01", maxLoss: "0.5",
    dryRun: true, privateKey: "", market: "BNB",
    betPercentage: "10", initialBalance: "100",
  });
  const [compareStats, setCompareStats] = useState({});
  const [signals, setSignals] = useState([]);
  const [signalStats, setSignalStats] = useState(null);
  const [userPlan, setUserPlan] = useState("free");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [chartMarket, setChartMarket] = useState("BNB");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("signals");
  const [pancakePrediction, setPancakePrediction] = useState(null);
  const [pancakeHistory, setPancakeHistory] = useState([]);
  const [pancakeCountdown, setPancakeCountdown] = useState(null);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);
  const token = useRef(null);

  useEffect(() => {
    token.current = localStorage.getItem("token");
    if (!token.current) { router.push("/"); return; }
    loadAll(token.current);
    connectWS(token.current);
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, []);

  useEffect(() => {
    if (activeTab === "logs") logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, activeTab]);

  async function safeJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return {}; }
  }

  async function loadAll(t) {
    const [statusRes, historyRes, balanceRes] = await Promise.all([
      fetch(`${API}/api/bot/status`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`${API}/api/bot/history`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`${API}/api/bot/balance-history`, { headers: { Authorization: `Bearer ${t}` } }),
    ]);

    // Si token invalide → renvoyer vers login
    if (statusRes.status === 401) { router.push("/"); return; }

    const statusData = await safeJson(statusRes);
    const historyData = await safeJson(historyRes);
    const balanceData = await safeJson(balanceRes);

    setStatus(statusData.status || "stopped");
    setStats(statusData.stats || DEFAULT_STATS);
    setTrades(historyData.trades || []);

    const pts = (balanceData.points || []).map((p, i) => ({
      name: `#${i + 1}`,
      balance: parseFloat(p.balance.toFixed(2)),
    }));
    setBalanceHistory(pts);

    if (statusData.config?.strategy) {
      setConfig((c) => ({
        ...c,
        strategy: statusData.config.strategy || c.strategy,
        betAmount: statusData.config.bet_amount || c.betAmount,
        maxLoss: statusData.config.max_loss || c.maxLoss,
        market: (statusData.config.market && !["BTC", "ALL"].includes(statusData.config.market)) ? statusData.config.market : "BNB",
        betPercentage: statusData.config.bet_percentage ? String(statusData.config.bet_percentage) : c.betPercentage,
        initialBalance: statusData.config.initial_balance ? String(statusData.config.initial_balance) : c.initialBalance,
      }));
      setChartMarket(statusData.config.market || "BNB");
    }

    // Charger les stats de comparaison si disponibles
    const cmpRes = await fetch(`${API}/api/bot/compare/stats`, { headers: { Authorization: `Bearer ${t}` } });
    const cmpData = await safeJson(cmpRes);
    if (cmpData.stats && cmpData.stats.length > 0) {
      const map = {};
      for (const s of cmpData.stats) map[s.strategy] = s;
      setCompareStats(map);
    }

    // Charger le plan utilisateur
    const planRes = await fetch(`${API}/api/billing/plan`, { headers: { Authorization: `Bearer ${t}` } });
    const planData = await safeJson(planRes);
    if (planData.plan) setUserPlan(planData.plan);

    // Charger les signaux
    const [sigRes, sigStatsRes] = await Promise.all([
      fetch(`${API}/api/signals?limit=50`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`${API}/api/signals/stats`),
    ]);
    const sigData = await safeJson(sigRes);
    const sigStatsData = await safeJson(sigStatsRes);
    if (sigData.signals) setSignals(sigData.signals);
    if (sigStatsData.byType) setSignalStats(sigStatsData);

    // Charger prédiction PancakeSwap si Elite
    if (planData.plan === "elite") {
      loadPancake(t);
    }
  }

  async function loadPancake(t) {
    const [predRes, histRes] = await Promise.all([
      fetch(`${API}/api/pancake/prediction`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`${API}/api/pancake/history`, { headers: { Authorization: `Bearer ${t}` } }),
    ]);
    const predData = await safeJson(predRes);
    const histData = await safeJson(histRes);
    if (predData.prediction) {
      setPancakePrediction(predData);
      setPancakeCountdown(predData.secondsToNextRound);
    }
    if (histData.history) setPancakeHistory(histData.history);
  }

  // Countdown PancakeSwap
  useEffect(() => {
    if (pancakeCountdown === null) return;
    if (pancakeCountdown <= 0) {
      // Recharger la prédiction au nouveau round
      if (token.current && userPlan === "elite") loadPancake(token.current);
      return;
    }
    const timer = setTimeout(() => setPancakeCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [pancakeCountdown]);

  // Rafraîchir la prédiction toutes les 60 secondes
  useEffect(() => {
    if (userPlan !== "elite") return;
    const interval = setInterval(() => {
      if (token.current) loadPancake(token.current);
    }, 60000);
    return () => clearInterval(interval);
  }, [userPlan]);

  function connectWS(t) {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(`${WS_URL}/ws?token=${t}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "stats") {
        setStats((prev) => ({ ...prev, ...msg.data,
          total_bets: msg.data.totalBets, wins: msg.data.wins, losses: msg.data.losses,
          total_won: msg.data.totalWon, total_lost: msg.data.totalLost,
          virtual_balance: msg.data.virtualBalance || 0,
        }));
      }
      if (msg.type === "status") setStatus(msg.data.status);
      if (msg.type === "trade") {
        setTrades((t) => [msg.data, ...t].slice(0, 100));
        if (msg.data.balanceAfter > 0) {
          setBalanceHistory((h) => [...h, { name: `#${h.length + 1}`, balance: parseFloat(msg.data.balanceAfter.toFixed(2)) }]);
        }
      }
      if (msg.type === "log") {
        setLogs((l) => [...l.slice(-99), { ...msg.data, id: `${Date.now()}-${Math.random()}` }]);
      }
      if (msg.type === "compare_stats") {
        setCompareStats((prev) => ({ ...prev, [msg.data.strategy]: msg.data }));
      }
      if (msg.type === "new_signal") {
        setSignals((prev) => [msg.data, ...prev].slice(0, 50));
      }
      if (msg.type === "signal_result") {
        setSignals((prev) => prev.map((s) =>
          s.id === msg.data.id ? { ...s, result: msg.data.result, pnl_pct: msg.data.pnlPct, price_at_close: msg.data.priceAtClose } : s
        ));
        fetch(`${API}/api/signals/stats`).then(r => r.json()).then(d => { if (d.byType) setSignalStats(d); });
      }
    };
    ws.onclose = () => setTimeout(() => connectWS(t), 3000);
  }

  async function toggleBot() {
    if (userPlan === "free" && status !== "running") {
      setShowUpgrade(true);
      return;
    }
    setLoading(true);
    const isCompare = config.strategy === "compare";
    if (status === "running") {
      const endpoint = isCompare ? "/api/bot/compare/stop" : "/api/bot/stop";
      await fetch(`${API}${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } });
    } else {
      if (isCompare) {
        await fetch(`${API}/api/bot/compare/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
          body: JSON.stringify({ betPercentage: config.betPercentage, initialBalance: config.initialBalance, market: config.market }),
        });
      } else {
        await fetch(`${API}/api/bot/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
      }
    }
    setLoading(false);
  }

  async function resetStats() {
    if (!confirm("Réinitialiser toutes les stats et l'historique ?")) return;
    await Promise.all([
      fetch(`${API}/api/bot/reset`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } }),
      fetch(`${API}/api/bot/compare/reset`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } }),
    ]);
    setStats(DEFAULT_STATS);
    setTrades([]);
    setBalanceHistory([]);
    setLogs([]);
    setCompareStats({});
  }

  function logout() {
    localStorage.removeItem("token");
    router.push("/");
  }

  const isCompareMode = config.strategy === "compare";
  const winRate = stats.total_bets > 0 ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : "0.0";
  const pnl = ((stats.total_won || 0) - (stats.total_lost || 0)).toFixed(2);
  const pnlPos = parseFloat(pnl) >= 0;
  const showVirtual = config.dryRun && parseFloat(config.initialBalance) > 0;

  return (
    <>
      <Head><title>Dashboard — PancakeBot Pro</title></Head>
      <div style={s.page}>
        {/* Popup upgrade */}
        {showUpgrade && (
          <div style={s.overlay}>
            <div style={s.upgradeBox}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
              <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Fonctionnalité Pro</h2>
              <p style={{ color: "#9ca3af", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
                Le lancement du bot est réservé aux abonnés Pro et Elite.<br />
                Passez au plan Pro pour débloquer toutes les fonctionnalités.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...s.startBtn, background: "#7c3aed", width: "auto", padding: "11px 24px", marginTop: 0 }}
                  onClick={() => router.push("/pricing")}>
                  Voir les plans
                </button>
                <button style={{ ...s.logoutBtn }} onClick={() => setShowUpgrade(false)}>Fermer</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={s.header}>
          <span style={s.headerTitle}>📈 CryptoSignal Pro</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: "bold", background: userPlan === "free" ? "#1f2937" : userPlan === "pro" ? "#1f1535" : "#1a1200", color: userPlan === "free" ? "#6b7280" : userPlan === "pro" ? "#a78bfa" : "#f59e0b", border: `1px solid ${userPlan === "free" ? "#374151" : userPlan === "pro" ? "#7c3aed44" : "#f59e0b44"}` }}>
              {userPlan === "free" ? "FREE" : userPlan === "pro" ? "⚡ PRO" : "👑 ELITE"}
            </span>
            <span style={{ ...s.badge, background: status === "running" ? "#065f46" : "#1f2937", color: status === "running" ? "#34d399" : "#9ca3af" }}>
              {status === "running" ? "● EN COURS" : "● ARRÊTÉ"}
            </span>
            <button style={s.logoutBtn} onClick={() => router.push("/pricing")}>Upgrade</button>
            <button style={s.logoutBtn} onClick={logout}>Déconnexion</button>
          </div>
        </div>

        <div style={s.content}>
          {/* Timer round */}
          <RoundTimer market={chartMarket} />

          {/* Graphique prix */}
          <PriceChart market={chartMarket} onMarketChange={(m) => { setChartMarket(m); setConfig((c) => ({ ...c, market: m })); }} />

          {/* Stats */}
          {!isCompareMode && (
            <div style={s.statsGrid}>
              <StatCard label="Win Rate" value={`${winRate}%`} color="#a78bfa" />
              <StatCard label="Rounds joués" value={stats.total_bets} color="#60a5fa" />
              <StatCard label="Victoires" value={stats.wins} color="#34d399" />
              <StatCard label="Défaites" value={stats.losses} color="#f87171" />
              {showVirtual ? (
                <StatCard label="Balance fictive" value={`$${parseFloat(stats.virtual_balance || 0).toFixed(2)}`} color="#fbbf24" />
              ) : (
                <StatCard label="Gains" value={`+${parseFloat(stats.total_won || 0).toFixed(4)}`} color="#34d399" />
              )}
              <StatCard label="PnL Net" value={`${pnlPos ? "+" : ""}$${pnl}`} color={pnlPos ? "#34d399" : "#f87171"} />
            </div>
          )}

          {/* Tableau de comparaison */}
          {isCompareMode && (
            <CompareTable compareStats={compareStats} initialBalance={parseFloat(config.initialBalance) || 100} />
          )}


          {/* Graphique balance (simulation) */}
          {showVirtual && balanceHistory.length > 1 && (
            <div style={s.balanceChart}>
              <h3 style={s.panelTitle}>Évolution de la balance fictive</h3>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={balanceHistory}>
                  <XAxis dataKey="name" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={55} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${v}`, "Balance"]} />
                  <ReferenceLine y={parseFloat(config.initialBalance)} stroke="#555" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="balance" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={s.bottom}>
            {/* Config */}
            <div style={s.panel}>
              <h2 style={s.panelTitle}>Configuration</h2>

              <label style={s.label}>Marché</label>
              <select style={s.select} value={config.market} onChange={(e) => { setConfig({ ...config, market: e.target.value }); setChartMarket(e.target.value); }} disabled={status === "running"}>
                <option value="BNB">BNB/USDT</option>
              </select>

              <label style={s.label}>Stratégie</label>
              <select style={s.select} value={config.strategy} onChange={(e) => setConfig({ ...config, strategy: e.target.value })} disabled={status === "running"}>
                <option value="compare">🆚 Comparer toutes les stratégies</option>
                <option value="auto">🤖 AUTO (IA autonome)</option>
                <option value="contrarian">Contrarian (contre majorité)</option>
                <option value="momentum">Momentum (suit la tendance)</option>
                <option value="rsi">RSI (surachat/survente)</option>
                <option value="martingale">Martingale</option>
                <option value="random">Random</option>
              </select>

              {!isCompareMode && (
                <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 12 }}>
                  <input type="checkbox" checked={config.dryRun} onChange={(e) => setConfig({ ...config, dryRun: e.target.checked })} disabled={status === "running"} />
                  Mode simulation (sans argent réel)
                </label>
              )}

              {isCompareMode ? (
                <>
                  <label style={s.label}>Capital total à répartir ($)</label>
                  <input style={s.input} type="number" min="1" max="100000" value={config.initialBalance} onChange={(e) => setConfig({ ...config, initialBalance: e.target.value })} disabled={status === "running"} />
                  <label style={s.label}>Mise par round (% de la balance)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input style={{ ...s.input, flex: 1 }} type="number" min="1" max="100" value={config.betPercentage} onChange={(e) => setConfig({ ...config, betPercentage: e.target.value })} disabled={status === "running"} />
                    <span style={{ color: "#9ca3af", fontSize: 14 }}>%</span>
                  </div>
                  <p style={{ color: "#666", fontSize: 11, margin: "4px 0 0" }}>
                    5 stratégies × ${Math.floor((parseFloat(config.initialBalance) || 1000) / 5 * 100) / 100} chacune — simulation uniquement
                  </p>
                </>
              ) : config.dryRun ? (
                <>
                  <label style={s.label}>Balance fictive ($)</label>
                  <input style={s.input} type="number" min="1" max="100000" value={config.initialBalance} onChange={(e) => setConfig({ ...config, initialBalance: e.target.value })} disabled={status === "running"} />
                  <label style={s.label}>Mise par round (% de la balance)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input style={{ ...s.input, flex: 1 }} type="number" min="1" max="100" value={config.betPercentage} onChange={(e) => setConfig({ ...config, betPercentage: e.target.value })} disabled={status === "running"} />
                    <span style={{ color: "#9ca3af", fontSize: 14 }}>%</span>
                  </div>
                  <p style={{ color: "#666", fontSize: 11, margin: "4px 0 0" }}>
                    ≈ ${((parseFloat(config.initialBalance) || 0) * (parseFloat(config.betPercentage) || 0) / 100).toFixed(2)} par round
                  </p>
                </>
              ) : (
                <>
                  <label style={s.label}>Mise par round (BNB)</label>
                  <input style={s.input} type="number" step="0.001" min="0.001" max="1" value={config.betAmount} onChange={(e) => setConfig({ ...config, betAmount: e.target.value })} disabled={status === "running"} />
                  <label style={s.label}>Stop-loss (BNB)</label>
                  <input style={s.input} type="number" step="0.01" min="0.01" max="10" value={config.maxLoss} onChange={(e) => setConfig({ ...config, maxLoss: e.target.value })} disabled={status === "running"} />
                  <label style={s.label}>Clé privée wallet</label>
                  <input style={s.input} type="password" placeholder="0x..." value={config.privateKey} onChange={(e) => setConfig({ ...config, privateKey: e.target.value })} disabled={status === "running"} />
                </>
              )}

              <button style={{ ...s.startBtn, background: status === "running" ? "#dc2626" : userPlan === "free" ? "#374151" : "#7c3aed" }} onClick={toggleBot} disabled={loading}>
                {loading ? "..." : status === "running" ? "⏹ Arrêter le bot" : userPlan === "free" ? "🔒 Réservé aux abonnés Pro" : "▶ Démarrer le bot"}
              </button>
              {userPlan === "free" && (
                <p style={{ color: "#f59e0b", fontSize: 12, textAlign: "center", margin: "8px 0 0" }}>
                  <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/pricing")}>
                    Passer au Pro pour débloquer le bot →
                  </span>
                </p>
              )}

              {status === "stopped" && (
                <button style={s.resetBtn} onClick={resetStats}>Réinitialiser les stats</button>
              )}
            </div>

            {/* Logs / Historique */}
            <div style={s.panel}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <button style={activeTab === "logs" ? s.tabActive : s.tab} onClick={() => setActiveTab("logs")}>Logs live</button>
                <button style={activeTab === "history" ? s.tabActive : s.tab} onClick={() => setActiveTab("history")}>
                  Historique ({trades.length})
                </button>
                <button style={activeTab === "signals" ? s.tabActive : s.tab} onClick={() => setActiveTab("signals")}>
                  Signaux ({signals.length})
                </button>
                {userPlan === "elite" && (
                  <button style={activeTab === "pancake" ? s.tabActive : s.tab} onClick={() => setActiveTab("pancake")}>
                    🥞 PancakeSwap
                  </button>
                )}
              </div>

              {activeTab === "logs" && (
                <div style={s.logs}>
                  {logs.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>En attente de logs...</p>}
                  {logs.map((log) => (
                    <div key={log.id} style={{ ...s.logLine, color: logColor(log.level) }}>
                      <span style={{ color: "#555", marginRight: 8 }}>{new Date(log.time).toLocaleTimeString()}</span>
                      {log.message}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}

              {activeTab === "history" && (
                <div style={s.logs}>
                  {trades.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>Aucun trade enregistré.</p>}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#666" }}>
                        <th style={s.th}>Epoch</th>
                        <th style={s.th}>Direction</th>
                        <th style={s.th}>Mise</th>
                        <th style={s.th}>Résultat</th>
                        <th style={s.th}>Profit</th>
                        <th style={s.th}>Balance après</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1f1f35" }}>
                          <td style={s.td}>{t.epoch}</td>
                          <td style={{ ...s.td, color: t.direction === "bull" ? "#34d399" : "#f87171" }}>
                            {t.direction === "bull" ? "▲ BULL" : "▼ BEAR"}
                          </td>
                          <td style={s.td}>${parseFloat(t.amount).toFixed(2)}</td>
                          <td style={{ ...s.td, color: t.result === "win" ? "#34d399" : "#f87171" }}>
                            {t.result === "win" ? "✓ WIN" : "✗ LOSS"}
                          </td>
                          <td style={{ ...s.td, color: t.profit >= 0 ? "#34d399" : "#f87171" }}>
                            {t.profit >= 0 ? "+" : ""}{parseFloat(t.profit).toFixed(2)}
                          </td>
                          <td style={s.td}>{t.balance_after > 0 ? `$${parseFloat(t.balance_after).toFixed(2)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab === "signals" && (
                <div style={{ ...s.logs, height: "auto", maxHeight: 440 }}>
                  {signalStats?.byType?.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      {["rsi", "ema", "momentum", "macd"].map((type) => {
                        const rows = (signalStats.byType || []).filter(r => r.type === type);
                        const total = rows.reduce((s, r) => s + r.total, 0);
                        const wins = rows.reduce((s, r) => s + r.wins, 0);
                        const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : "—";
                        const color = total > 0 && parseFloat(wr) >= 50 ? "#34d399" : "#f87171";
                        return (
                          <div key={type} style={{ background: "#0f0f1a", borderRadius: 8, padding: "8px 14px", textAlign: "center", minWidth: 80 }}>
                            <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{type.toUpperCase()}</div>
                            <div style={{ fontSize: 18, fontWeight: "bold", color }}>{total > 0 ? `${wr}%` : "—"}</div>
                            <div style={{ fontSize: 10, color: "#555" }}>{total} signaux</div>
                          </div>
                        );
                      })}
                      {signalStats?.overall?.total > 0 && (
                        <div style={{ background: "#1f1f35", borderRadius: 8, padding: "8px 14px", textAlign: "center", minWidth: 80 }}>
                          <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>GLOBAL</div>
                          <div style={{ fontSize: 18, fontWeight: "bold", color: signalStats.overall.wins / signalStats.overall.total >= 0.5 ? "#34d399" : "#f87171" }}>
                            {((signalStats.overall.wins / signalStats.overall.total) * 100).toFixed(0)}%
                          </div>
                          <div style={{ fontSize: 10, color: "#555" }}>{signalStats.overall.total} évalués</div>
                        </div>
                      )}
                    </div>
                  )}
                  {signals.length === 0 ? (
                    <p style={{ color: "#666", fontSize: 13 }}>En attente des premiers signaux...</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: "#555" }}>
                          <th style={s.th}>Heure</th>
                          <th style={s.th}>Paire</th>
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
                            <td style={s.td}>{new Date(sig.created_at || sig.createdAt).toLocaleTimeString()}</td>
                            <td style={{ ...s.td, fontWeight: "bold", color: "#a78bfa" }}>{sig.pair?.replace("USDT", "")}</td>
                            <td style={{ ...s.td, color: "#9ca3af" }}>{(sig.type || "").toUpperCase()}</td>
                            <td style={{ ...s.td, color: sig.direction === "long" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                              {sig.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                            </td>
                            <td style={s.td}>{sig.confidence != null ? `${(sig.confidence * 100).toFixed(0)}%` : "—"}</td>
                            <td style={s.td}>${parseFloat(sig.price || sig.price_at_signal || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                            <td style={{ ...s.td, color: sig.result === "win" ? "#34d399" : sig.result === "loss" ? "#f87171" : "#555" }}>
                              {sig.result === "win" ? "✓ WIN" : sig.result === "loss" ? "✗ LOSS" : "⏳ attente"}
                            </td>
                            <td style={{ ...s.td, color: sig.pnl_pct >= 0 ? "#34d399" : "#f87171" }}>
                              {sig.pnl_pct != null ? `${sig.pnl_pct >= 0 ? "+" : ""}${parseFloat(sig.pnl_pct).toFixed(2)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === "pancake" && userPlan === "elite" && (
                <div style={{ padding: "8px 0" }}>
                  {!pancakePrediction ? (
                    <p style={{ color: "#666", fontSize: 13 }}>Chargement de la prédiction...</p>
                  ) : (
                    <>
                      {/* Prédiction actuelle */}
                      <div style={{ textAlign: "center", marginBottom: 24, padding: "20px", background: "#0f0f1a", borderRadius: 12 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>PROCHAIN ROUND BNB</div>
                        <div style={{ fontSize: 52, fontWeight: "bold", color: pancakePrediction.prediction === "BULL" ? "#34d399" : "#f87171", marginBottom: 8 }}>
                          {pancakePrediction.prediction === "BULL" ? "▲ BULL" : "▼ BEAR"}
                        </div>
                        <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 16 }}>
                          Confiance : <strong style={{ color: "#a78bfa" }}>{Math.round(pancakePrediction.confidence * 100)}%</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 16 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#666" }}>BULL</div>
                            <div style={{ fontSize: 18, fontWeight: "bold", color: "#34d399" }}>{Math.round(pancakePrediction.bullScore * 100)}%</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#666" }}>BEAR</div>
                            <div style={{ fontSize: 18, fontWeight: "bold", color: "#f87171" }}>{Math.round(pancakePrediction.bearScore * 100)}%</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#666" }}>Prix BNB</div>
                            <div style={{ fontSize: 18, fontWeight: "bold", color: "#fbbf24" }}>${parseFloat(pancakePrediction.price).toFixed(2)}</div>
                          </div>
                        </div>
                        {/* Barre de force */}
                        <div style={{ background: "#1a1a2e", borderRadius: 6, height: 8, overflow: "hidden", margin: "0 auto", maxWidth: 300 }}>
                          <div style={{ width: `${Math.round(pancakePrediction.bullScore * 100)}%`, height: "100%", background: "linear-gradient(90deg, #34d399, #7c3aed)", borderRadius: 6 }} />
                        </div>
                        {/* Countdown */}
                        {pancakeCountdown !== null && (
                          <div style={{ marginTop: 16, fontSize: 13, color: "#555" }}>
                            Prochain round dans{" "}
                            <span style={{ color: pancakeCountdown < 60 ? "#f87171" : "#a78bfa", fontWeight: "bold", fontFamily: "monospace", fontSize: 16 }}>
                              {String(Math.floor(pancakeCountdown / 60)).padStart(2, "0")}:{String(pancakeCountdown % 60).padStart(2, "0")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Historique */}
                      <div style={{ fontSize: 13, color: "#666", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                        <span>Historique des prédictions</span>
                        {pancakeHistory.filter(h => h.result).length > 0 && (
                          <span style={{ color: "#a78bfa" }}>
                            Win rate : {((pancakeHistory.filter(h => h.result === "win").length / pancakeHistory.filter(h => h.result).length) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: "#555" }}>
                            <th style={s.th}>Heure</th>
                            <th style={s.th}>Prédiction</th>
                            <th style={s.th}>Confiance</th>
                            <th style={s.th}>Prix entrée</th>
                            <th style={s.th}>Prix clôture</th>
                            <th style={s.th}>Résultat</th>
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
                                {h.result === "win" ? "✓ WIN" : h.result === "loss" ? "✗ LOSS" : "⏳ attente"}
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
      </div>
    </>
  );
}

const STRATEGY_LABELS = {
  contrarian: "Contrarian",
  momentum: "Momentum",
  rsi: "RSI",
  martingale: "Martingale",
  random: "Random",
  auto: "AUTO (IA)",
};

function CompareTable({ compareStats, initialBalance }) {
  const rows = Object.values(compareStats).sort((a, b) => (b.virtualBalance || b.virtual_balance || 0) - (a.virtualBalance || a.virtual_balance || 0));
  const best = rows[0]?.strategy;

  return (
    <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: "bold" }}>Comparaison des stratégies (simulation)</h3>
      {rows.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13 }}>En attente des premiers rounds...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#666" }}>
              <th style={cs.th}>Stratégie</th>
              <th style={cs.th}>Rounds</th>
              <th style={cs.th}>Win Rate</th>
              <th style={cs.th}>Victoires</th>
              <th style={cs.th}>Défaites</th>
              <th style={cs.th}>Balance</th>
              <th style={cs.th}>PnL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const bal = s.virtualBalance || s.virtual_balance || initialBalance;
              const bets = s.totalBets || s.total_bets || 0;
              const wins = s.wins || 0;
              const losses = s.losses || 0;
              const won = s.totalWon || s.total_won || 0;
              const lost = s.totalLost || s.total_lost || 0;
              const pnl = won - lost;
              const wr = bets > 0 ? ((wins / bets) * 100).toFixed(1) : "—";
              const isBest = s.strategy === best && bets > 0;
              return (
                <tr key={s.strategy} style={{ borderBottom: "1px solid #1f1f35", background: isBest ? "#0d2818" : "transparent" }}>
                  <td style={{ ...cs.td, fontWeight: isBest ? "bold" : "normal", color: isBest ? "#34d399" : "#e5e7eb" }}>
                    {isBest ? "🏆 " : ""}{STRATEGY_LABELS[s.strategy] || s.strategy}
                  </td>
                  <td style={cs.td}>{bets}</td>
                  <td style={{ ...cs.td, color: parseFloat(wr) >= 50 ? "#34d399" : "#f87171" }}>{wr}{bets > 0 ? "%" : ""}</td>
                  <td style={{ ...cs.td, color: "#34d399" }}>{wins}</td>
                  <td style={{ ...cs.td, color: "#f87171" }}>{losses}</td>
                  <td style={{ ...cs.td, color: bal >= initialBalance ? "#34d399" : "#f87171" }}>${bal.toFixed(2)}</td>
                  <td style={{ ...cs.td, color: pnl >= 0 ? "#34d399" : "#f87171" }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cs = {
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #1f1f35" },
  td: { padding: "10px 10px", color: "#e5e7eb" },
};

function StatCard({ label, value, color }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

function logColor(level) {
  const map = { success: "#34d399", error: "#f87171", warn: "#fbbf24", round: "#a78bfa", loss: "#f87171", info: "#e5e7eb" };
  return map[level] || "#e5e7eb";
}

const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", fontFamily: "system-ui", color: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "#1a1a2e", borderBottom: "1px solid #2d2d4e" },
  headerTitle: { fontSize: 18, fontWeight: "bold" },
  badge: { padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: "bold" },
  logoutBtn: { padding: "6px 14px", background: "none", border: "1px solid #333", borderRadius: 6, color: "#999", cursor: "pointer", fontSize: 13 },
  content: { padding: 24 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 },
  statCard: { background: "#1a1a2e", borderRadius: 12, padding: "20px 16px", textAlign: "center" },
  statValue: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#666" },
  balanceChart: { background: "#1a1a2e", borderRadius: 12, padding: 20, marginBottom: 16 },
  bottom: { display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 },
  panel: { background: "#1a1a2e", borderRadius: 12, padding: 20 },
  panelTitle: { margin: "0 0 16px", fontSize: 15, fontWeight: "bold" },
  label: { display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 4, marginTop: 12 },
  input: { width: "100%", padding: "10px 12px", background: "#0f0f1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" },
  select: { width: "100%", padding: "10px 12px", background: "#0f0f1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14 },
  startBtn: { width: "100%", padding: "13px 0", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer", marginTop: 20 },
  resetBtn: { width: "100%", padding: "9px 0", border: "1px solid #333", borderRadius: 8, color: "#666", background: "none", fontSize: 13, cursor: "pointer", marginTop: 8 },
  tab: { padding: "6px 16px", background: "none", border: "1px solid #333", borderRadius: 6, color: "#666", cursor: "pointer", fontSize: 13 },
  tabActive: { padding: "6px 16px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 },
  logs: { height: 400, overflowY: "auto", background: "#0f0f1a", borderRadius: 8, padding: 12, fontFamily: "monospace" },
  logLine: { fontSize: 12, marginBottom: 4, lineHeight: 1.5 },
  th: { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #1f1f35" },
  td: { padding: "8px 6px", color: "#e5e7eb" },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  upgradeBox: { background: "#1a1a2e", borderRadius: 16, padding: 40, maxWidth: 420, width: "90%", textAlign: "center", border: "1px solid #7c3aed44" },
};
