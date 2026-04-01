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

  // ── Bot ──────────────────────────────────────────────────────────────────
  const [botStatus, setBotStatus] = useState("stopped");
  const [botStats, setBotStats] = useState(null);
  const [botHistory, setBotHistory] = useState([]);
  const [botLogs, setBotLogs] = useState([]);
  const [botDecision, setBotDecision] = useState(null);
  const [botForm, setBotForm] = useState({ strategy: "auto", betPercentage: "10", initialBalance: "100", market: "BNB", dryRun: true, maxLoss: "0.5", betAmount: "0.01" });
  const logsEndRef = useRef(null);

  // ── Profil ───────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState(null);
  const [tgChatId, setTgChatId] = useState("");
  const [tgPrefs, setTgPrefs] = useState({ pairs: ["BTC","ETH","BNB","SOL"], minConf: 60, types: ["rsi","ema","macd","momentum"] });
  const [tgMsg, setTgMsg] = useState(null);
  const [referralCode, setReferralCode] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [savedKey, setSavedKey] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const wsRef = useRef(null);
  const token = useRef(null);

  useEffect(() => {
    token.current = localStorage.getItem("token");
    if (!token.current) { router.push("/"); return; }
    loadAll(token.current);
    connectWS(token.current);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => { wsRef.current?.close(); wsRef.current = null; window.removeEventListener("resize", onResize); };
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

    loadBot(t);

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
    loadProfile(t);
  }

  async function loadProfile(t) {
    try {
      const [meRes, refRes, keyRes] = await Promise.all([
        fetch(`${API}/api/profile/me`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/api/referral/code`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/api/profile/key`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const me = await meRes.json().catch(() => ({}));
      const ref = await refRes.json().catch(() => ({}));
      const key = await keyRes.json().catch(() => ({}));
      if (me.email) { setProfile(me); setTgChatId(me.telegram_chat_id || ""); }
      if (ref.code) { setReferralCode(ref.code); setReferrals(ref.referrals || []); }
      if (key.hasSavedKey) setSavedKey(key.key);
    } catch {}
  }

  async function loadBot(t) {
    try {
      const [statusRes, histRes, decRes] = await Promise.all([
        fetch(`${API}/api/bot/status`,   { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/api/bot/history`,  { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/api/bot/decision`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const statusData = await statusRes.json().catch(() => ({}));
      const histData   = await histRes.json().catch(() => ({}));
      const decData    = await decRes.json().catch(() => ({}));
      if (statusData.status) setBotStatus(statusData.status);
      if (statusData.stats)  setBotStats(statusData.stats);
      if (histData.trades)   setBotHistory(histData.trades);
      if (decData.decision)  setBotDecision(decData.decision);
    } catch {}
  }

  async function startBot() {
    const res = await fetch(`${API}/api/bot/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy:       botForm.strategy,
        betPercentage:  parseFloat(botForm.betPercentage),
        initialBalance: parseFloat(botForm.initialBalance),
        market:         botForm.market,
        dryRun:         botForm.dryRun,
        maxLoss:        parseFloat(botForm.maxLoss),
        betAmount:      botForm.betAmount,
      }),
    });
    const data = await res.json();
    if (data.success) { setBotStatus("running"); setBotLogs([]); }
    else alert(data.error || "Erreur démarrage");
  }

  async function stopBot() {
    await fetch(`${API}/api/bot/stop`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } });
    setBotStatus("stopped");
  }

  async function resetBot() {
    await fetch(`${API}/api/bot/reset`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } });
    setBotStats(null); setBotHistory([]); setBotDecision(null); setBotLogs([]);
  }

  async function changePassword() {
    if (pwForm.next !== pwForm.confirm) return setPwMsg({ error: "Les mots de passe ne correspondent pas" });
    const res = await fetch(`${API}/api/profile/password`, { method: "PUT", headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }) });
    const d = await res.json();
    if (d.success) { setPwMsg({ ok: "Mot de passe changé !" }); setPwForm({ current: "", next: "", confirm: "" }); }
    else setPwMsg({ error: d.error });
  }

  async function saveTelegram() {
    const res = await fetch(`${API}/api/profile/telegram`, { method: "PUT", headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" }, body: JSON.stringify({ telegram_chat_id: tgChatId, telegram_prefs: tgPrefs }) });
    const d = await res.json();
    setTgMsg(d.success ? { ok: "Sauvegardé !" } : { error: d.error });
    setTimeout(() => setTgMsg(null), 3000);
  }

  async function saveKey() {
    if (!keyInput) return;
    const res = await fetch(`${API}/api/profile/save-key`, { method: "POST", headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" }, body: JSON.stringify({ privateKey: keyInput }) });
    const d = await res.json();
    if (d.success) { setKeyMsg({ ok: "Clé sauvegardée et chiffrée !" }); setKeyInput(""); setSavedKey("••••••"); }
    else setKeyMsg({ error: d.error });
    setTimeout(() => setKeyMsg(null), 4000);
  }

  async function deleteKey() {
    await fetch(`${API}/api/profile/key`, { method: "DELETE", headers: { Authorization: `Bearer ${token.current}` } });
    setSavedKey(null);
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
      if (msg.type === "status") setBotStatus(msg.data.status);
      if (msg.type === "stats")  setBotStats(msg.data);
      if (msg.type === "trade")  setBotHistory(prev => [msg.data, ...prev].slice(0, 50));
      if (msg.type === "decision") setBotDecision(msg.data);
      if (msg.type === "log") setBotLogs(prev => [msg.data, ...prev].slice(0, 100));
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
                { id: "bot", label: `🤖 Bot${botStatus === "running" ? " ●" : ""}` },
                { id: "profil", label: "👤 Profil" },
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
            {/* ── BOT ─────────────────────────────────────────────────────── */}
            {activeTab === "bot" && (
              <div>

                {/* Statut + contrôles */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: botStatus === "running" ? "#34d399" : "#555", boxShadow: botStatus === "running" ? "0 0 8px #34d399" : "none" }} />
                    <span style={{ fontWeight: "bold", color: botStatus === "running" ? "#34d399" : "#666", fontSize: 14 }}>
                      {botStatus === "running" ? "EN COURS" : "ARRÊTÉ"}
                    </span>
                  </div>
                  {botStatus === "stopped" ? (
                    <button onClick={startBot} style={{ padding: "8px 20px", background: "#059669", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                      ▶ Démarrer
                    </button>
                  ) : (
                    <button onClick={stopBot} style={{ padding: "8px 20px", background: "#dc2626", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                      ■ Arrêter
                    </button>
                  )}
                  <button onClick={resetBot} style={{ padding: "8px 14px", background: "none", border: "1px solid #1f1f35", borderRadius: 6, color: "#555", cursor: "pointer", fontSize: 12 }}>
                    ↺ Reset stats
                  </button>
                </div>

                {/* Config (seulement si arrêté) */}
                {botStatus === "stopped" && (
                  <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 16, marginBottom: 20, border: "1px solid #1f1f35" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 12, letterSpacing: 1 }}>CONFIGURATION</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                      {[
                        { label: "Stratégie", key: "strategy", type: "select", options: ["auto","contrarian","momentum","rsi","martingale","random"] },
                        { label: "Mise % balance", key: "betPercentage", type: "number", placeholder: "ex: 10" },
                        { label: "Balance fictive ($)", key: "initialBalance", type: "number", placeholder: "ex: 100" },
                        { label: "Marché", key: "market", type: "select", options: ["BNB"] },
                        { label: "Stop-loss (BNB)", key: "maxLoss", type: "number", placeholder: "ex: 0.5" },
                      ].map(field => (
                        <div key={field.key}>
                          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{field.label}</div>
                          {field.type === "select" ? (
                            <select value={botForm[field.key]} onChange={e => setBotForm(f => ({ ...f, [field.key]: e.target.value }))}
                              style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 12 }}>
                              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input type="number" value={botForm[field.key]} onChange={e => setBotForm(f => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }} />
                          )}
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Mode</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={botForm.dryRun} onChange={e => setBotForm(f => ({ ...f, dryRun: e.target.checked }))} />
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>Simulation (dry-run)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats du bot */}
                {botStats && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
                    {[
                      { label: "Mises", value: botStats.total_bets, color: "#a78bfa" },
                      { label: "Victoires", value: botStats.wins, color: "#34d399" },
                      { label: "Défaites", value: botStats.losses, color: "#f87171" },
                      { label: "Win Rate", value: botStats.total_bets > 0 ? `${((botStats.wins / botStats.total_bets) * 100).toFixed(0)}%` : "—", color: botStats.wins >= botStats.losses ? "#34d399" : "#f87171" },
                      { label: "Balance", value: botStats.virtual_balance > 0 ? `$${parseFloat(botStats.virtual_balance).toFixed(2)}` : "—", color: "#fbbf24" },
                      { label: "Profit", value: botStats.total_won > 0 ? `+$${parseFloat(botStats.total_won).toFixed(2)}` : "—", color: "#34d399" },
                      { label: "Perdu", value: botStats.total_lost > 0 ? `-$${parseFloat(botStats.total_lost).toFixed(2)}` : "—", color: "#f87171" },
                    ].map(item => (
                      <div key={item.label} style={{ background: "#0a0a1a", borderRadius: 8, padding: "10px 12px", border: "1px solid #1f1f35" }}>
                        <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: "bold", color: item.color }}>{item.value ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Intelligence Panel — Dernière décision */}
                {botDecision && (
                  <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 16, marginBottom: 20, border: `1px solid ${botDecision.action === "BET_BULL" ? "#34d39944" : botDecision.action === "BET_BEAR" ? "#f8717144" : "#1f1f35"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>DERNIÈRE DÉCISION — Round #{botDecision.epoch}</span>
                      <span style={{ fontSize: 11, color: "#444" }}>{botDecision.timestamp ? new Date(botDecision.timestamp).toLocaleTimeString("fr-FR") : ""}</span>
                    </div>

                    {/* Action principale */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 28, fontWeight: "bold", color: botDecision.action === "BET_BULL" ? "#34d399" : botDecision.action === "BET_BEAR" ? "#f87171" : "#555" }}>
                        {botDecision.action === "BET_BULL" ? "▲ BULL" : botDecision.action === "BET_BEAR" ? "▼ BEAR" : "⏭ SKIP"}
                      </div>
                      {botDecision.confidence > 0 && (
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 4 }}>
                            <span>Confiance</span><span style={{ color: "#a78bfa", fontWeight: "bold" }}>{(botDecision.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div style={{ background: "#1a1a2e", borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={{ width: `${botDecision.confidence * 100}%`, height: "100%", background: botDecision.confidence >= 0.7 ? "#34d399" : botDecision.confidence >= 0.55 ? "#fbbf24" : "#f87171", transition: "width 0.5s" }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Raison */}
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14, padding: "8px 12px", background: "#111128", borderRadius: 6 }}>
                      {botDecision.reason}
                    </div>

                    {/* Indicateurs */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 14 }}>
                      {[
                        { label: "Tendance 15m", value: botDecision.indicators?.trend15m, type: "trend" },
                        { label: "Tendance 5m",  value: botDecision.indicators?.trend5m,  type: "trend" },
                        { label: "Tendance 1m",  value: botDecision.indicators?.trend1m,  type: "trend" },
                        { label: "RSI (1m)", value: botDecision.indicators?.rsi !== null && botDecision.indicators?.rsi !== undefined ? botDecision.indicators.rsi.toFixed(0) : null, type: "rsi" },
                        { label: "Pool BULL %", value: botDecision.indicators?.poolBullRatio !== null && botDecision.indicators?.poolBullRatio !== undefined ? `${(botDecision.indicators.poolBullRatio * 100).toFixed(0)}%` : null, type: "plain" },
                        { label: "P&L journalier", value: botDecision.indicators?.dailyPnlPct !== undefined ? `${botDecision.indicators.dailyPnlPct >= 0 ? "+" : ""}${botDecision.indicators.dailyPnlPct.toFixed(1)}%` : null, type: "pnl", raw: botDecision.indicators?.dailyPnlPct },
                        { label: "Pertes conséc.", value: botDecision.indicators?.consecutiveLosses ?? 0, type: "losses" },
                        { label: "Vol. spike", value: botDecision.indicators?.volumeSpike ? "OUI ⚠️" : "Non", type: "plain" },
                      ].map(item => {
                        if (item.value === null || item.value === undefined) return null;
                        let color = "#9ca3af";
                        if (item.type === "trend") color = item.value === "bull" ? "#34d399" : item.value === "bear" ? "#f87171" : "#555";
                        if (item.type === "rsi") { const r = parseFloat(item.value); color = r < 35 ? "#34d399" : r > 65 ? "#f87171" : "#9ca3af"; }
                        if (item.type === "pnl") color = item.raw >= 0 ? "#34d399" : "#f87171";
                        if (item.type === "losses") color = item.value >= 3 ? "#f87171" : item.value > 0 ? "#fbbf24" : "#34d399";
                        const display = item.type === "trend" ? (item.value === "bull" ? "▲ HAUSSIÈRE" : item.value === "bear" ? "▼ BAISSIÈRE" : "— NEUTRE") : item.value;
                        return (
                          <div key={item.label} style={{ background: "#111128", borderRadius: 6, padding: "8px 10px" }}>
                            <div style={{ fontSize: 10, color: "#444", marginBottom: 3 }}>{item.label}</div>
                            <div style={{ fontSize: 13, fontWeight: "bold", color }}>{display}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Signaux actifs */}
                    {botDecision.signals?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: "#444", marginBottom: 8 }}>SIGNAUX ACTIFS</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {botDecision.signals.map((s, i) => (
                            <div key={i} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, background: s.direction === "bull" ? "#0d2818" : "#2a0f0f", color: s.direction === "bull" ? "#34d399" : "#f87171", border: `1px solid ${s.direction === "bull" ? "#34d39933" : "#f8717133"}` }}>
                              <span style={{ fontWeight: "bold" }}>{s.name}</span>
                              <span style={{ opacity: 0.7, marginLeft: 4 }}>{s.direction === "bull" ? "▲" : "▼"}</span>
                              {s.detail && <span style={{ opacity: 0.5, marginLeft: 4, fontSize: 10 }}>{s.detail}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Alertes */}
                    {botDecision.warnings?.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {botDecision.warnings.map((w, i) => (
                          <div key={i} style={{ fontSize: 11, color: "#fbbf24", background: "#1a1500", borderRadius: 6, padding: "6px 10px", border: "1px solid #fbbf2422" }}>
                            ⚠️ {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Logs en temps réel */}
                {botLogs.length > 0 && (
                  <div style={{ background: "#050508", borderRadius: 10, padding: 14, marginBottom: 20, border: "1px solid #1f1f35", maxHeight: 220, overflowY: "auto" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 10, letterSpacing: 1 }}>LOGS EN TEMPS RÉEL</div>
                    {botLogs.map((log, i) => (
                      <div key={i} style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 3, color: log.level === "success" ? "#34d399" : log.level === "loss" ? "#f87171" : log.level === "error" ? "#f87171" : log.level === "warn" ? "#fbbf24" : "#555" }}>
                        <span style={{ color: "#333", marginRight: 8 }}>{log.time ? new Date(log.time).toLocaleTimeString("fr-FR") : ""}</span>
                        {log.message}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}

                {/* Historique des trades */}
                {botHistory.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 10, letterSpacing: 1 }}>HISTORIQUE DES TRADES</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #1f1f35" }}>
                            {["Epoch", "Direction", "Mise", "Résultat", "P&L", "Balance après"].map(h => <th key={h} style={s.th}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {botHistory.slice(0, 30).map((t, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #151525" }}>
                              <td style={{ ...s.td, color: "#444" }}>#{t.epoch}</td>
                              <td style={{ ...s.td, fontWeight: "bold", color: t.direction === "bull" ? "#34d399" : "#f87171" }}>{t.direction === "bull" ? "▲ BULL" : "▼ BEAR"}</td>
                              <td style={{ ...s.td, fontFamily: "monospace" }}>${parseFloat(t.amount || 0).toFixed(2)}</td>
                              <td style={s.td}>
                                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold", background: t.result === "win" ? "#0d2818" : "#2a0f0f", color: t.result === "win" ? "#34d399" : "#f87171" }}>
                                  {t.result === "win" ? "✓ WIN" : "✗ LOSS"}
                                </span>
                              </td>
                              <td style={{ ...s.td, fontWeight: "bold", color: parseFloat(t.profit || 0) >= 0 ? "#34d399" : "#f87171" }}>
                                {parseFloat(t.profit || 0) >= 0 ? "+" : ""}{parseFloat(t.profit || 0).toFixed(2)}
                              </td>
                              <td style={{ ...s.td, fontFamily: "monospace", color: "#9ca3af" }}>{t.balance_after > 0 ? `$${parseFloat(t.balance_after).toFixed(2)}` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {botStatus === "stopped" && !botStats && (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#444" }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🤖</div>
                    <div style={{ fontSize: 14 }}>Configure le bot et clique sur Démarrer</div>
                    <div style={{ fontSize: 12, marginTop: 6, color: "#333" }}>Mode simulation recommandé pour commencer</div>
                  </div>
                )}
              </div>
            )}

            {/* ── PROFIL ──────────────────────────────────────────────── */}
            {activeTab === "profil" && (
              <div style={{ maxWidth: 600 }}>
                {/* Infos compte */}
                <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>INFORMATIONS DU COMPTE</div>
                  {profile && (
                    <div style={{ display: "grid", gap: 10 }}>
                      {[
                        { label: "Email", value: profile.email },
                        { label: "Plan", value: profile.plan?.toUpperCase(), color: profile.plan === "elite" ? "#f59e0b" : profile.plan === "pro" ? "#a78bfa" : "#6b7280" },
                        { label: "Expiration", value: profile.plan_expires_at ? new Date(profile.plan_expires_at).toLocaleDateString("fr-FR") : "—" },
                        { label: "Membre depuis", value: new Date(profile.created_at).toLocaleDateString("fr-FR") },
                        { label: "Filleuls", value: `${profile.referral_count || 0} parrainage(s)` },
                      ].map(item => (
                        <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111128" }}>
                          <span style={{ color: "#555", fontSize: 13 }}>{item.label}</span>
                          <span style={{ color: item.color || "#e5e7eb", fontWeight: "bold", fontSize: 13 }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Changer mot de passe */}
                <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>CHANGER LE MOT DE PASSE</div>
                  {[
                    { label: "Mot de passe actuel", key: "current" },
                    { label: "Nouveau mot de passe", key: "next" },
                    { label: "Confirmer le nouveau", key: "confirm" },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{f.label}</div>
                      <input type="password" value={pwForm[f.key]} onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                  ))}
                  {pwMsg && <div style={{ fontSize: 12, marginBottom: 8, color: pwMsg.ok ? "#34d399" : "#f87171" }}>{pwMsg.ok || pwMsg.error}</div>}
                  <button onClick={changePassword} style={{ padding: "8px 20px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                    Mettre à jour
                  </button>
                </div>

                {/* Parrainage */}
                <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>PARRAINAGE</div>
                  <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 14 }}>Invitez un ami avec votre code — il s'inscrit, vous recevez <strong style={{ color: "#34d399" }}>1 mois gratuit</strong> sur votre plan.</p>
                  {referralCode && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ flex: 1, background: "#111128", border: "1px solid #7c3aed44", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: "#a78bfa", letterSpacing: 3 }}>
                        {referralCode}
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(`https://www.cryptosignal.cloud?ref=${referralCode}`)}
                        style={{ padding: "10px 14px", background: "#1f1f35", border: "none", borderRadius: 6, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}>
                        Copier lien
                      </button>
                    </div>
                  )}
                  {referrals.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: "#444", marginBottom: 6 }}>{referrals.length} filleul(s)</div>
                      {referrals.map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #111128" }}>
                          <span style={{ color: "#9ca3af" }}>{r.email}</span>
                          <span style={{ color: "#555" }}>{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Telegram */}
                <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>ALERTES TELEGRAM</div>
                  <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 10 }}>Obtenez votre Chat ID sur <strong>@userinfobot</strong> Telegram.</p>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Chat ID Telegram</div>
                    <input value={tgChatId} onChange={e => setTgChatId(e.target.value)} placeholder="ex: 123456789"
                      style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Confiance minimum</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[40, 50, 60, 70, 80].map(v => (
                        <button key={v} onClick={() => setTgPrefs(p => ({ ...p, minConf: v }))}
                          style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tgPrefs.minConf === v ? "bold" : "normal", background: tgPrefs.minConf === v ? "#7c3aed" : "#111128", color: tgPrefs.minConf === v ? "#fff" : "#666" }}>
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Paires</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["BTC","ETH","BNB","SOL","DOGE","AVAX"].map(p => (
                        <button key={p} onClick={() => setTgPrefs(pr => ({ ...pr, pairs: pr.pairs.includes(p) ? pr.pairs.filter(x => x !== p) : [...pr.pairs, p] }))}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: tgPrefs.pairs.includes(p) ? "#7c3aed" : "#111128", color: tgPrefs.pairs.includes(p) ? "#fff" : "#666" }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  {tgMsg && <div style={{ fontSize: 12, marginBottom: 8, color: tgMsg.ok ? "#34d399" : "#f87171" }}>{tgMsg.ok || tgMsg.error}</div>}
                  <button onClick={saveTelegram} style={{ padding: "8px 20px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                    Sauvegarder
                  </button>
                </div>

                {/* Clé privée */}
                <div style={{ background: "#0a0a1a", borderRadius: 10, padding: 20, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>CLÉ PRIVÉE (CHIFFRÉE)</div>
                  <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 12 }}>Sauvegardez votre clé privée chiffrée (AES-256) pour ne pas avoir à la ressaisir à chaque démarrage du bot.</p>
                  {savedKey ? (
                    <div>
                      <div style={{ background: "#111128", border: "1px solid #34d39933", borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, color: "#34d399", marginBottom: 10 }}>
                        🔒 {savedKey}
                      </div>
                      <button onClick={deleteKey} style={{ padding: "7px 14px", background: "none", border: "1px solid #f87171", borderRadius: 6, color: "#f87171", cursor: "pointer", fontSize: 12 }}>
                        Supprimer la clé
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="0x..."
                        style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />
                      {keyMsg && <div style={{ fontSize: 12, marginBottom: 8, color: keyMsg.ok ? "#34d399" : "#f87171" }}>{keyMsg.ok || keyMsg.error}</div>}
                      <button onClick={saveKey} style={{ padding: "8px 20px", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                        Chiffrer et sauvegarder
                      </button>
                    </div>
                  )}
                </div>
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
