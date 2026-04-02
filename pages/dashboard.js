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
  const [darkMode, setDarkMode] = useState(true);
  const [whales, setWhales] = useState([]);
  const [news, setNews] = useState([]);
  const [polyGaps, setPolyGaps] = useState([]);
  const [polyMovements, setPolyMovements] = useState([]);
  const [polyScannedAt, setPolyScannedAt] = useState(null);
  const [polyScanning, setPolyScanning] = useState(false);

  // ── Trading Lab (fusion Bot + Simulateur) ────────────────────────────────
  const [labMode, setLabMode] = useState("manual");      // "manual" | "auto"
  const [labBalance, setLabBalance] = useState(1000);
  const [labCanReset, setLabCanReset] = useState(true);
  const [labSignals, setLabSignals] = useState({});       // { BTCUSDT: { direction, confidence, type } }
  const [labPending, setLabPending] = useState([]);
  const [labHistory, setLabHistory] = useState([]);
  const [labBalHistory, setLabBalHistory] = useState([]);
  const [labForm, setLabForm] = useState({ pair: "BTCUSDT", direction: "LONG", amount: "50" });
  const [labMsg, setLabMsg] = useState(null);
  const [labLoading, setLabLoading] = useState(false);

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
    const saved = localStorage.getItem("darkMode");
    if (saved === "false") { setDarkMode(false); document.body.classList.add("light"); }
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
    // Gadgets premium (whale + news) — chargés en parallèle sans bloquer
    fetch(`${API}/api/market/whales`).then(r => r.json()).then(d => { if (d.whales) setWhales(d.whales); }).catch(() => {});
    fetch(`${API}/api/market/news`).then(r => r.json()).then(d => { if (d.news) setNews(d.news); }).catch(() => {});
    loadPolymarket(t);
    loadLab(t);
  }

  async function loadPolymarket(t) {
    try {
      const d = await fetch(`${API}/api/polymarket/signals`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json());
      if (d.gaps)            setPolyGaps(d.gaps);
      if (d.movementSignals) setPolyMovements(d.movementSignals);
      if (d.scannedAt)       setPolyScannedAt(d.scannedAt);
      if (d.scanInProgress)  setPolyScanning(d.scanInProgress);
    } catch {}
  }

  async function loadLab(t) {
    try {
      const [stateRes, histRes] = await Promise.all([
        fetch(`${API}/api/lab/state`,   { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/api/lab/history`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const state = await stateRes.json().catch(() => ({}));
      const hist  = await histRes.json().catch(() => ({}));
      if (state.balance    != null) setLabBalance(state.balance);
      if (state.canReset   != null) setLabCanReset(state.canReset);
      if (state.signals)            setLabSignals(state.signals);
      if (state.pendingTrades)      setLabPending(state.pendingTrades);
      if (state.botStatus)          setBotStatus(state.botStatus);
      if (hist.trades)              setLabHistory(hist.trades);
      if (hist.balanceHistory)      setLabBalHistory(hist.balanceHistory);
      if (hist.stats)               setBotStats(hist.stats);
    } catch {}
  }

  async function labPlaceTrade() {
    if (labLoading) return;
    setLabLoading(true); setLabMsg(null);
    try {
      const res = await fetch(`${API}/api/lab/trade`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pair: labForm.pair, direction: labForm.direction, amount: parseFloat(labForm.amount) }),
      });
      const d = await res.json();
      if (d.success) { setLabBalance(d.newBalance); setLabMsg({ ok: d.message }); loadLab(token.current); }
      else setLabMsg({ error: d.error });
    } catch { setLabMsg({ error: "Erreur réseau." }); }
    setLabLoading(false);
    setTimeout(() => setLabMsg(null), 7000);
  }

  async function labStartBot() {
    const res = await fetch(`${API}/api/lab/bot/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: botForm.strategy, betPercentage: botForm.betPercentage, maxLoss: botForm.maxLoss, market: botForm.market, dryRun: true }),
    });
    const d = await res.json();
    if (d.success) { setBotStatus("running"); setBotLogs([]); }
    else alert(d.error || "Erreur démarrage");
  }

  async function labStopBot() {
    await fetch(`${API}/api/lab/bot/stop`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } });
    setBotStatus("stopped");
  }

  async function labReset() {
    if (!window.confirm("Réinitialiser votre solde Lab à $1 000 ? Action unique et irréversible.")) return;
    const res = await fetch(`${API}/api/lab/reset`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } });
    const d = await res.json();
    if (d.success) { setLabBalance(1000); setLabCanReset(false); setLabMsg({ ok: "Solde réinitialisé à $1 000." }); loadLab(token.current); }
    else setLabMsg({ error: d.error });
    setTimeout(() => setLabMsg(null), 5000);
  }

  async function triggerPolyScan() {
    setPolyScanning(true);
    try {
      await fetch(`${API}/api/polymarket/scan`, { method: "POST", headers: { Authorization: `Bearer ${token.current}` } });
      // Attend 30s puis recharge
      setTimeout(() => {
        loadPolymarket(token.current);
        setPolyScanning(false);
      }, 30000);
    } catch { setPolyScanning(false); }
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

  // Whale tracker — refresh toutes les 3 min
  useEffect(() => {
    const i = setInterval(() => {
      fetch(`${API}/api/market/whales`).then(r => r.json()).then(d => { if (d.whales) setWhales(d.whales); }).catch(() => {});
    }, 3 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  // Keep-alive — ping toutes les 10 min pour garder Render éveillé
  useEffect(() => {
    const ping = () => fetch(`${API}/api/health`).catch(() => {});
    const i = setInterval(ping, 10 * 60 * 1000);
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
      if (msg.type === "stats")  { setBotStats(msg.data); if (msg.data.virtualBalance != null) setLabBalance(msg.data.virtualBalance); }
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
      <div style={s.page} className="dash-page">

        {/* ── Top Bar ──────────────────────────────────────────────── */}
        <div style={s.topBar}>
          <div style={{ display: "flex", gap: 18, flex: 1, overflow: "hidden", alignItems: "center" }}>
            {overview.slice(0,4).map(item => {
              const chg = parseFloat(item.change || 0);
              const clr = chg >= 0 ? "#00c98d" : "#ff4d4d";
              return (
                <div key={item.pair} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ color: PAIR_COLORS[item.pair] || "#9ca3af", fontSize: 11, fontWeight: "700", fontFamily: MONO }}>{item.pair}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: "#e2e8f0" }}>
                    ${parseFloat(item.price || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: 11, color: clr, fontFamily: MONO }}>{chg >= 0 ? "+" : ""}{item.change}%</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {userPlan !== "elite" && <button style={s.upgradeBtn} onClick={() => router.push("/pricing")}>UPGRADE</button>}
          </div>
        </div>

        {/* ── Body: Sidebar + Main ─────────────────────────────────── */}
        <div style={{ display: "flex", height: "calc(100vh - 40px)", overflow: "hidden" }}>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div style={s.sidebar}>
          <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid #0d0d1a" }}>
            <div style={s.logo}>CS<span style={{ color: "#7c3aed" }}>·</span>PRO</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ ...s.planBadge, background: userPlan === "free" ? "#0a0a14" : userPlan === "pro" ? "#130d25" : "#120d00", color: userPlan === "free" ? "#4b5563" : userPlan === "pro" ? "#a78bfa" : "#f59e0b", border: `1px solid ${userPlan === "free" ? "#1e1e30" : userPlan === "pro" ? "#7c3aed44" : "#f59e0b44"}` }}>
                {userPlan === "free" ? "FREE" : userPlan === "pro" ? "PRO" : "ELITE"}
              </span>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "10px 0", overflowY: "auto" }}>
            {[
              { id: "overview",   icon: "◈", label: "Overview" },
              { id: "signals",    icon: "⚡", label: "Signals", badge: signals.length > 0 ? signals.length : null },
              ...(userPlan !== "free" ? [{ id: "matrix", icon: "◉", label: "Matrix" }] : []),
              ...(userPlan === "elite" ? [{ id: "pancake", icon: "⬡", label: "PancakeSwap" }] : []),
              { id: "polymarket", icon: "🎯", label: "Polymarket", badge: polyGaps.length > 0 ? polyGaps.length : null },
              { id: "lab",        icon: "⚗", label: "Lab", dot: botStatus === "running" },
              { id: "profil",     icon: "◎", label: "Profile" },
            ].map(item => {
              const active = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 16px", border: "none",
                  borderLeft: `2px solid ${active ? "#7c3aed" : "transparent"}`,
                  color: active ? "#e2e8f0" : "#4b5563",
                  cursor: "pointer", fontSize: 12, fontWeight: active ? "700" : "500",
                  textAlign: "left", background: active ? "#0a0a14" : "transparent",
                }}>
                  <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{item.icon}</span>
                  <span style={{ flex: 1, letterSpacing: 0.3 }}>{item.label}</span>
                  {item.badge && (
                    <span style={{ background: "#13132a", color: "#a78bfa", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontFamily: MONO }}>
                      {item.badge}
                    </span>
                  )}
                  {item.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00c98d", flexShrink: 0 }} />}
                </button>
              );
            })}
          </nav>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #0d0d1a" }}>
            <button style={{ width: "100%", padding: "7px 0", background: "none", border: "1px solid #1a1a2e", borderRadius: 2, color: "#4b5563", cursor: "pointer", fontSize: 11, letterSpacing: 0.5 }} onClick={logout}>LOGOUT</button>
          </div>
        </div>

        {/* ── Main ────────────────────────────────────────────────── */}
        <div style={s.main}>
          {/* News Ticker */}
          {news.length > 0 && (
            <div style={{ background: "#060609", borderBottom: "1px solid #0d0d1a", overflow: "hidden", height: 26, display: "flex", alignItems: "center", flexShrink: 0 }}>
              <div style={{ padding: "0 12px", background: "#7c3aed", color: "#fff", fontSize: 9, fontWeight: "700", height: "100%", display: "flex", alignItems: "center", letterSpacing: 1.5, whiteSpace: "nowrap", flexShrink: 0 }}>NEWS</div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div className="news-ticker-inner">
                  {[...news, ...news].map((nitem, i) => (
                    <a key={i} href={nitem.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#6b7280", textDecoration: "none", fontSize: 11, whiteSpace: "nowrap" }}
                      onMouseEnter={e => e.currentTarget.style.color="#c9d1d9"}
                      onMouseLeave={e => e.currentTarget.style.color="#6b7280"}>
                      <span style={{ color: "#7c3aed", marginRight: 8, fontSize: 9 }}>▸</span>
                      {nitem.title}
                      <span style={{ color: "#1f2937", marginLeft: 10, marginRight: 20, fontSize: 10, fontFamily: MONO }}>— {nitem.source}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section title bar */}
          <div style={s.sectionHead}>
            <span style={s.sectionTitle}>
              {{ overview: "Overview", signals: `Signals · ${signals.length}`, matrix: "Matrix", pancake: "PancakeSwap", polymarket: "Polymarket", lab: "Trading Lab", profil: "Profile" }[activeTab] || ""}
            </span>
            {activeTab === "lab" && botStatus === "running" && <span style={{ fontSize: 10, color: "#00c98d" }}>● ACTIF</span>}
            {activeTab === "lab" && <span style={{ color: "#374151", fontSize: 11, fontFamily: MONO, marginLeft: "auto" }}>${Math.round(labBalance)}</span>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* ── Overview ─────────────────────────────────────────────── */}
          {activeTab === "overview" && (
          <div>

          {/* Signal du jour */}
          {signalOfDay && (
            <div style={{ ...s.sodBanner, borderLeftColor: signalOfDay.direction === "long" ? "#00c98d" : "#ff4d4d" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: "700", letterSpacing: 1.5 }}>SIGNAL DU JOUR</span>
                <span style={{ fontWeight: "700", fontSize: 13, color: PAIR_COLORS[signalOfDay.pair] || "#a78bfa", fontFamily: MONO }}>{signalOfDay.pair}</span>
                <span style={{ fontWeight: "700", fontSize: 16, color: signalOfDay.direction === "long" ? "#00c98d" : "#ff4d4d", fontFamily: MONO }}>
                  {signalOfDay.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                </span>
                <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{Math.round(signalOfDay.confidence * 100)}%</span>
                <span style={{ fontSize: 10, color: "#4b5563" }}>{signalOfDay.aligned}/4 indicateurs</span>
                {signalOfDay.confidence >= 0.75 && <span style={{ fontSize: 9, fontWeight: "700", color: "#00c98d", letterSpacing: 1 }}>● HAUTE PROBABILITÉ</span>}
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  {Object.entries(signalOfDay.details || {}).map(([ind, dir]) => (
                    <span key={ind} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 2, background: "#050508", color: dir === "long" ? "#00c98d" : dir === "short" ? "#ff4d4d" : "#374151", fontWeight: "700", fontFamily: MONO }}>
                      {ind.toUpperCase()}{dir === "long" ? "▲" : dir === "short" ? "▼" : "—"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paires */}
          <div style={s.topRow} className="dash-toprow">
            <div style={s.pairsGrid} className="dash-pairs-grid">
              {overview.map(item => {
                const chg = parseFloat(item.change || 0);
                const clr = chg >= 0 ? "#00c98d" : "#ff4d4d";
                const scoreClr = item.score >= 60 ? "#00c98d" : item.score <= 40 ? "#ff4d4d" : "#f59e0b";
                const fr = parseFloat(item.fundingRate || 0);
                return (
                  <div key={item.pair} style={s.pairCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontWeight: "700", color: PAIR_COLORS[item.pair] || "#fff", fontSize: 12, fontFamily: MONO, letterSpacing: 0.5 }}>{item.pair}</span>
                      <span style={{ fontSize: 11, fontWeight: "700", color: clr, fontFamily: MONO }}>{chg >= 0 ? "+" : ""}{item.change}%</span>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: "700", color: "#e2e8f0", marginBottom: 6, fontFamily: MONO, letterSpacing: -0.5 }}>
                      ${parseFloat(item.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ background: "#030305", borderRadius: 1, height: 3, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${item.score}%`, height: "100%", background: scoreClr, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 6 }}>
                      <span style={{ color: scoreClr, fontWeight: "700", letterSpacing: 0.5 }}>{(item.label || "").toUpperCase()}</span>
                      <span style={{ color: "#374151", fontFamily: MONO }}>{item.score}/100</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.high24h > 0 && <span style={{ fontSize: 9, color: "#00c98d", fontFamily: MONO }}>H:{parseFloat(item.high24h).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                      {item.low24h > 0 && <span style={{ fontSize: 9, color: "#ff4d4d", fontFamily: MONO }}>L:{parseFloat(item.low24h).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                      {item.volume24h > 0 && <span style={{ fontSize: 9, color: "#4b5563", fontFamily: MONO }}>V:{(item.volume24h / 1e9).toFixed(1)}B</span>}
                      {item.fundingRate !== null && (
                        <span style={{ fontSize: 9, color: fr > 0 ? "#ff4d4d" : "#00c98d", fontWeight: "700", fontFamily: MONO }}>
                          FR:{fr > 0 ? "+" : ""}{item.fundingRate}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats bar */}
          <div style={s.statsBar} className="dash-stats-bar">
            <div style={s.statItem}>
              <span style={{ color: "#374151", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>WIN RATE</span>
              <span style={{ color: winRate && parseFloat(winRate) >= 50 ? "#00c98d" : "#ff4d4d", fontWeight: "700", fontSize: 18, fontFamily: MONO }}>{winRate ? `${winRate}%` : "—"}</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <span style={{ color: "#374151", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>SIGNAUX</span>
              <span style={{ color: "#a78bfa", fontWeight: "700", fontSize: 18, fontFamily: MONO }}>{overall?.total || "—"}</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <span style={{ color: "#374151", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>PAIRES</span>
              <span style={{ color: "#60a5fa", fontWeight: "700", fontSize: 18, fontFamily: MONO }}>4</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <span style={{ color: "#374151", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>TIMEFRAMES</span>
              <span style={{ color: "#f59e0b", fontWeight: "700", fontSize: 18, fontFamily: MONO }}>{allowedTimeframes.length}</span>
            </div>
            {fearGreed && (
              <>
                <div style={s.statDivider} />
                <div style={s.statItem}>
                  <span style={{ color: "#374151", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>FEAR & GREED</span>
                  <span style={{ color: fearGreed.value >= 60 ? "#00c98d" : fearGreed.value >= 40 ? "#f59e0b" : "#ff4d4d", fontWeight: "700", fontSize: 18, fontFamily: MONO }}>{fearGreed.value} <span style={{ fontSize: 10 }}>{fearGreed.label}</span></span>
                </div>
              </>
            )}
          </div>

          {/* Graphiques */}
          <AllCharts />

          <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "stretch" }}>
                  {["rsi", "ema", "momentum", "macd"].map(type => {
                    const rows = (signalStats?.byType || []).filter(r => r.type === type);
                    const total = rows.reduce((s, r) => s + parseInt(r.total), 0);
                    const wins = rows.reduce((s, r) => s + parseInt(r.wins), 0);
                    const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : null;
                    const color = wr ? (parseFloat(wr) >= 50 ? "#00c98d" : "#ff4d4d") : "#1f2937";
                    return (
                      <div key={type} style={{ ...s.indCard, minWidth: 100 }}>
                        <div style={{ fontSize: 9, color: "#374151", marginBottom: 6, fontWeight: "700", letterSpacing: 1 }}>{type.toUpperCase()}</div>
                        <div style={{ fontSize: 26, fontWeight: "700", color, fontFamily: MONO, lineHeight: 1 }}>{wr ? `${wr}%` : "—"}</div>
                        <div style={{ fontSize: 9, color: "#374151", marginTop: 4, fontFamily: MONO }}>{total} sig.</div>
                        {total > 0 && (
                          <div style={{ background: "#030305", borderRadius: 1, height: 2, marginTop: 8, overflow: "hidden" }}>
                            <div style={{ width: `${wr}%`, height: "100%", background: color }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {overall?.total > 0 && (
                    <div style={{ ...s.indCard, background: "#0a0815", border: "1px solid #7c3aed22", minWidth: 100 }}>
                      <div style={{ fontSize: 9, color: "#7c3aed", marginBottom: 6, fontWeight: "700", letterSpacing: 1 }}>GLOBAL</div>
                      <div style={{ fontSize: 26, fontWeight: "700", color: overall.wins / overall.total >= 0.5 ? "#00c98d" : "#ff4d4d", fontFamily: MONO, lineHeight: 1 }}>
                        {((overall.wins / overall.total) * 100).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: 9, color: "#374151", marginTop: 4, fontFamily: MONO }}>{overall.total} évalués</div>
                    </div>
                  )}
                  {fearGreed && (() => {
                    const cx = 80, cy = 65, R = 50;
                    const angle = Math.PI * (1 - fearGreed.value / 100);
                    const nx = (cx + 40 * Math.cos(angle)).toFixed(1);
                    const ny = (cy - 40 * Math.sin(angle)).toFixed(1);
                    const fgColor = fearGreed.value >= 60 ? "#00c98d" : fearGreed.value >= 40 ? "#f59e0b" : "#ff4d4d";
                    return (
                      <div style={{ ...s.indCard, minWidth: 130, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontSize: 9, color: "#374151", marginBottom: 2, fontWeight: "700", letterSpacing: 1, alignSelf: "flex-start" }}>FEAR & GREED</div>
                        <svg width="160" height="80" viewBox="0 0 160 80" style={{ display: "block" }}>
                          <defs><linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#ff4d4d"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#00c98d"/></linearGradient></defs>
                          <path d={`M ${cx-R},${cy} A ${R},${R} 0 0,1 ${cx+R},${cy}`} stroke="#0a0a14" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <path d={`M ${cx-R},${cy} A ${R},${R} 0 0,1 ${cx+R},${cy}`} stroke="url(#gaugeGrad)" strokeWidth="8" fill="none" strokeLinecap="round"/>
                          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2" strokeLinecap="round"/>
                          <circle cx={cx} cy={cy} r="3" fill="white"/>
                          <text x={cx} y={cy-8} textAnchor="middle" fill={fgColor} fontSize="14" fontWeight="bold">{fearGreed.value}</text>
                        </svg>
                        <div style={{ fontSize: 10, color: fgColor, fontWeight: "700", marginTop: -8, letterSpacing: 0.5 }}>{(fearGreed.label || "").toUpperCase()}</div>
                      </div>
                    );
                  })()}
                </div>
                {userPlan === "free" && (
                  <div style={s.upgradeBanner}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Plan FREE — BTC/ETH seulement, 5 signaux/jour, données différées 30 min</span>
                    <button style={s.upgradeBtn} onClick={() => router.push("/pricing")}>UPGRADE PRO — 7 USDT/sem</button>
                  </div>
                )}

                {/* ── Whale Tracker ───────────────────────────────────── */}
                <div style={{ marginTop: 12, background: "#050508", borderRadius: 3, border: "1px solid #12121e", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderBottom: "1px solid #12121e" }}>
                    <div style={{ fontSize: 9, fontWeight: "700", color: "#374151", letterSpacing: 1 }}>WHALE TRACKER</div>
                    <div style={{ fontSize: 10, color: "#374151" }}>transactions &gt; $500K — live Binance</div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 10 }}>
                      <span style={{ color: "#00c98d", fontFamily: MONO }}>▲ WALLET (BULLISH)</span>
                      <span style={{ color: "#ff4d4d", fontFamily: MONO }}>▼ EXCHANGE (BEARISH)</span>
                    </div>
                  </div>
                  <div style={{ position: "relative" }}>
                    {/* Data (blurred for FREE) */}
                    <div style={{ filter: userPlan === "free" ? "blur(5px)" : "none", pointerEvents: userPlan === "free" ? "none" : "auto" }}>
                      {whales.length === 0 ? (
                        <div style={{ padding: "24px 16px", textAlign: "center", color: "#444", fontSize: 13 }}>
                          Chargement des données whale...
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid #12122a" }}>
                                {["Direction", "Paire", "Montant", "Prix", "Quantité", "Heure"].map(h => (
                                  <th key={h} style={{ ...s.th, background: "#060610" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {whales.slice(0, 5).map((w, i) => (
                                <tr key={i} style={{ borderBottom: "1px solid #0d0d1e" }}>
                                  <td style={{ ...s.td, fontWeight: "bold" }}>
                                    {w.direction === "wallet"
                                      ? <span style={{ color: "#00c98d" }}>🟢 Vers Wallet</span>
                                      : <span style={{ color: "#ff4d4d" }}>🔴 Vers Exchange</span>}
                                  </td>
                                  <td style={{ ...s.td, fontWeight: "bold", color: "#e5e7eb" }}>{w.pair}</td>
                                  <td style={{ ...s.td, fontWeight: "bold", color: "#fbbf24" }}>
                                    ${w.notional >= 1e6 ? `${(w.notional / 1e6).toFixed(2)}M` : `${(w.notional / 1e3).toFixed(0)}K`}
                                  </td>
                                  <td style={{ ...s.td, fontFamily: "monospace" }}>${w.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                                  <td style={s.td}>{w.qty.toFixed(3)}</td>
                                  <td style={{ ...s.td, color: "#444" }}>{new Date(w.time).toLocaleTimeString("fr-FR")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    {/* Overlay FREE */}
                    {userPlan === "free" && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(5,5,7,0.75)", backdropFilter: "blur(3px)", gap: 8 }}>
                        <div style={{ fontWeight: "700", color: "#f59e0b", fontSize: 13, letterSpacing: 0.5 }}>ACCÈS RÉSERVÉ — PLAN ELITE</div>
                        <div style={{ fontSize: 11, color: "#4b5563" }}>Transactions whale en temps réel avec le plan Elite</div>
                        <button onClick={() => router.push("/pricing")} style={{ marginTop: 6, padding: "6px 16px", background: "#f59e0b", border: "none", borderRadius: 2, color: "#000", fontWeight: "700", cursor: "pointer", fontSize: 11, letterSpacing: 0.5 }}>
                          UPGRADE ELITE — 15 USDT/sem
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
          </div>)}

          {/* Signaux */}
          {activeTab === "signals" && (() => {
            const wins   = signals.filter(s => s.result === "win").length;
            const losses = signals.filter(s => s.result === "loss").length;
            const done   = wins + losses;
            const wr     = done > 0 ? Math.round(wins / done * 100) : null;
            const pending = signals.filter(s => !s.result).length;
            return (
            <div>
              {/* Stats rapides */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1, background: "#080810", border: "1px solid #12121e", borderRadius: 3, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 1, marginBottom: 4 }}>WIN RATE</div>
                  <div style={{ fontSize: 28, fontWeight: "700", fontFamily: MONO, color: wr >= 60 ? "#00c98d" : wr >= 45 ? "#f59e0b" : wr != null ? "#ff4d4d" : "#374151" }}>
                    {wr != null ? `${wr}%` : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{done} évalués</div>
                </div>
                <div style={{ flex: 1, background: "#080810", border: "1px solid #12121e", borderRadius: 3, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 1, marginBottom: 4 }}>TOTAL SIGNAUX</div>
                  <div style={{ fontSize: 28, fontWeight: "700", fontFamily: MONO, color: "#a78bfa" }}>{signals.length}</div>
                  <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{pending} en cours</div>
                </div>
                <div style={{ flex: 1, background: "#080810", border: "1px solid #12121e", borderRadius: 3, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 1, marginBottom: 4 }}>GAGNANTS</div>
                  <div style={{ fontSize: 28, fontWeight: "700", fontFamily: MONO, color: "#00c98d" }}>{wins}</div>
                  <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{losses} perdants</div>
                </div>
              </div>

              {/* Filtre timeframe */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#374151", fontWeight: "700", letterSpacing: 1 }}>TIMEFRAME</span>
                {allowedTimeframes.map(tf => (
                  <button key={tf} onClick={() => loadSignalsByTimeframe(tf)} style={{ padding: "4px 12px", borderRadius: 2, border: `1px solid ${selectedTimeframe === tf ? "#7c3aed" : "#12121e"}`, cursor: "pointer", fontSize: 11, fontWeight: "700", background: selectedTimeframe === tf ? "#7c3aed" : "transparent", color: selectedTimeframe === tf ? "#fff" : "#4b5563", fontFamily: MONO }}>
                    {tf}
                  </button>
                ))}
                {userPlan === "free" && (
                  <span style={{ fontSize: 11, color: "#7c3aed44", cursor: "pointer", fontFamily: MONO }} onClick={() => router.push("/pricing")}>
                    + 5m 15m 30m 2h 4h →
                  </span>
                )}
              </div>

              {/* Cartes signaux */}
              {signals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#374151", fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                  En attente des premiers signaux — {selectedTimeframe}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {signals.map((sig, i) => {
                    const isLong   = sig.direction === "long";
                    const pct      = sig.confidence != null ? Math.round(sig.confidence * 100) : null;
                    const dirColor = isLong ? "#00c98d" : "#ff4d4d";
                    const pair     = sig.pair?.replace("USDT", "") || "?";
                    const isWin    = sig.result === "win";
                    const isLoss   = sig.result === "loss";
                    const isPending = !sig.result;
                    const minutesAgo = sig.created_at ? Math.round((Date.now() - new Date(sig.created_at)) / 60000) : null;
                    const timeLabel  = minutesAgo != null ? (minutesAgo < 60 ? `${minutesAgo}m` : `${Math.floor(minutesAgo/60)}h${minutesAgo%60 ? (minutesAgo%60)+'m' : ''}`) : "";
                    return (
                      <div key={sig.id || i} style={{
                        display: "flex", alignItems: "center", gap: 16,
                        background: "#080810", border: "1px solid #12121e",
                        borderLeft: `3px solid ${dirColor}`,
                        borderRadius: 3, padding: "12px 16px",
                        transition: "background 0.15s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = "#0d0d1a"}
                        onMouseLeave={e => e.currentTarget.style.background = "#080810"}>

                        {/* Paire */}
                        <div style={{ minWidth: 52 }}>
                          <div style={{ fontSize: 16, fontWeight: "700", color: PAIR_COLORS[pair] || "#e2e8f0", fontFamily: MONO }}>{pair}</div>
                          <div style={{ fontSize: 10, color: "#374151", fontFamily: MONO }}>{sig.timeframe || "1h"}</div>
                        </div>

                        {/* Direction — élément central */}
                        <div style={{ minWidth: 90 }}>
                          <div style={{ fontSize: 18, fontWeight: "700", color: dirColor, fontFamily: MONO, letterSpacing: 0.5 }}>
                            {isLong ? "▲ LONG" : "▼ SHORT"}
                          </div>
                          {pct >= 80 && <div style={{ fontSize: 9, color: "#00c98d", fontWeight: "700", letterSpacing: 0.5, marginTop: 2 }}>● FORT</div>}
                        </div>

                        {/* Confiance */}
                        {pct != null && (
                          <div style={{ flex: 1, maxWidth: 140 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: "#374151", fontWeight: "700" }}>CONFIANCE</span>
                              <span style={{ fontSize: 12, fontWeight: "700", fontFamily: MONO, color: pct >= 70 ? "#00c98d" : pct >= 55 ? "#f59e0b" : "#ff4d4d" }}>{pct}%</span>
                            </div>
                            <div style={{ height: 4, background: "#0d0d1a", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#00c98d" : pct >= 55 ? "#f59e0b" : "#ff4d4d", transition: "width 0.4s" }} />
                            </div>
                          </div>
                        )}

                        {/* PnL si disponible */}
                        {sig.pnl_pct != null && (
                          <div style={{ minWidth: 60, textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: "700", fontFamily: MONO, color: sig.pnl_pct >= 0 ? "#00c98d" : "#ff4d4d" }}>
                              {sig.pnl_pct >= 0 ? "+" : ""}{parseFloat(sig.pnl_pct).toFixed(1)}%
                            </div>
                          </div>
                        )}

                        {/* Résultat */}
                        <div style={{ minWidth: 70, textAlign: "right" }}>
                          <span style={{
                            display: "inline-block", padding: "4px 10px", borderRadius: 2, fontSize: 11, fontWeight: "700", letterSpacing: 0.5,
                            background: isWin ? "#0d2818" : isLoss ? "#2a0f0f" : "#0d0d1a",
                            color: isWin ? "#00c98d" : isLoss ? "#ff4d4d" : "#374151",
                            border: `1px solid ${isWin ? "#00c98d22" : isLoss ? "#ff4d4d22" : "#1f1f35"}`,
                          }}>
                            {isWin ? "WIN" : isLoss ? "LOSS" : "EN COURS"}
                          </span>
                          {timeLabel && <div style={{ fontSize: 9, color: "#374151", marginTop: 4, fontFamily: MONO }}>{timeLabel}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })()}

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
                                <td key={tf} style={{ ...s.td, textAlign: "center", background: bg, borderRadius: 2 }}>
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
                      <div style={{ background: "#080810", borderRadius: 3, padding: 24, textAlign: "center", border: `2px solid ${pancakePrediction.prediction === "BULL" ? "#00c98d44" : "#ff4d4d44"}` }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: 1 }}>PROCHAIN ROUND BNB</div>
                        <div style={{ fontSize: 52, fontWeight: "bold", color: pancakePrediction.prediction === "BULL" ? "#00c98d" : "#ff4d4d", lineHeight: 1, marginBottom: 8 }}>
                          {pancakePrediction.prediction === "BULL" ? "▲" : "▼"}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 }}>{pancakePrediction.prediction}</div>
                        <div style={{ fontSize: 13, color: "#666" }}>${parseFloat(pancakePrediction.price).toFixed(2)} BNB</div>
                        {pancakeCountdown !== null && (
                          <div style={{ marginTop: 16, fontFamily: "monospace", fontSize: 20, fontWeight: "bold", color: pancakeCountdown < 60 ? "#ff4d4d" : "#a78bfa" }}>
                            {String(Math.floor(pancakeCountdown / 60)).padStart(2, "0")}:{String(pancakeCountdown % 60).padStart(2, "0")}
                          </div>
                        )}
                      </div>
                      <div style={{ background: "#080810", borderRadius: 3, padding: 24 }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 12, letterSpacing: 1 }}>ANALYSE</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ color: "#00c98d" }}>BULL</span>
                          <span style={{ fontWeight: "bold", color: "#00c98d", fontSize: 18 }}>{Math.round(pancakePrediction.bullScore * 100)}%</span>
                        </div>
                        <div style={{ background: "#12121e", borderRadius: 2, height: 8, overflow: "hidden", marginBottom: 12 }}>
                          <div style={{ width: `${Math.round(pancakePrediction.bullScore * 100)}%`, height: "100%", background: "linear-gradient(90deg, #00c98d, #7c3aed)" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ color: "#ff4d4d" }}>BEAR</span>
                          <span style={{ fontWeight: "bold", color: "#ff4d4d", fontSize: 18 }}>{Math.round(pancakePrediction.bearScore * 100)}%</span>
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
                            <td style={{ ...s.td, color: h.prediction === "BULL" ? "#00c98d" : "#ff4d4d", fontWeight: "bold" }}>{h.prediction === "BULL" ? "▲ BULL" : "▼ BEAR"}</td>
                            <td style={s.td}>{Math.round(h.confidence * 100)}%</td>
                            <td style={{ ...s.td, fontFamily: "monospace" }}>{h.price_at_prediction ? `$${parseFloat(h.price_at_prediction).toFixed(2)}` : "—"}</td>
                            <td style={{ ...s.td, fontFamily: "monospace" }}>{h.price_at_close ? `$${parseFloat(h.price_at_close).toFixed(2)}` : "—"}</td>
                            <td style={s.td}>
                              <span style={{ padding: "2px 8px", borderRadius: 2, fontSize: 11, fontWeight: "bold", background: h.result === "win" ? "#0d2818" : h.result === "loss" ? "#2a0f0f" : "#1f1f2e", color: h.result === "win" ? "#00c98d" : h.result === "loss" ? "#ff4d4d" : "#555" }}>
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
            {/* ── Trading Lab ──────────────────────────────────────────────────── */}
            {activeTab === "lab" && (
              <div>
                {/* ─ Solde | Stats | Mode switch ─ */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {/* Solde */}
                  <div style={{ flex: "0 0 200px", background: "#050508", border: "1px solid #12121e", borderRadius: 3, padding: "14px 16px" }}>
                    <div style={{ fontSize: 9, color: "#374151", letterSpacing: 1, marginBottom: 6, fontWeight: "700" }}>BALANCE LAB</div>
                    <div style={{ fontSize: 28, fontWeight: "700", color: labBalance >= 1000 ? "#00c98d" : labBalance >= 400 ? "#f59e0b" : "#ff4d4d", fontFamily: MONO, letterSpacing: -1 }}>${labBalance.toFixed(2)}</div>
                    <div style={{ marginTop: 8, height: 2, background: "#0d0d1a", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, (labBalance / 1000) * 100))}%`, height: "100%", background: labBalance >= 1000 ? "#00c98d" : labBalance >= 400 ? "#f59e0b" : "#ff4d4d", transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#1f2937", marginTop: 2, fontFamily: MONO }}><span>$0</span><span>$1,000</span></div>
                    {labBalance <= 200 && labCanReset && <button onClick={labReset} style={{ marginTop: 10, width: "100%", padding: "6px", background: "#7f1d1d", border: "1px solid #ff4d4d44", borderRadius: 2, color: "#ff4d4d", fontWeight: "700", cursor: "pointer", fontSize: 10, letterSpacing: 0.5 }}>RESET BALANCE (1x)</button>}
                  </div>
                  {/* Stats */}
                  <div style={{ flex: 1, minWidth: 220, background: "#050508", border: "1px solid #12121e", borderRadius: 3, padding: "14px 16px" }}>
                    <div style={{ fontSize: 9, color: "#374151", letterSpacing: 1, marginBottom: 10, fontWeight: "700" }}>PERFORMANCE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { label: "TRADES",   value: botStats?.total_bets || 0,    color: "#6b7280" },
                        { label: "WINS",     value: botStats?.wins || 0,          color: "#00c98d" },
                        { label: "LOSSES",   value: botStats?.losses || 0,        color: "#ff4d4d" },
                        { label: "WIN RATE", value: (botStats?.total_bets || 0) > 0 ? `${((botStats.wins / botStats.total_bets) * 100).toFixed(0)}%` : "—", color: (botStats?.wins || 0) >= (botStats?.losses || 0) ? "#00c98d" : "#ff4d4d" },
                        { label: "GAINS",    value: `+$${parseFloat(botStats?.total_won  || 0).toFixed(0)}`, color: "#00c98d" },
                        { label: "PERTES",   value: `-$${parseFloat(botStats?.total_lost || 0).toFixed(0)}`, color: "#ff4d4d" },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 17, fontWeight: "700", color, fontFamily: MONO }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Mode toggle */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center", minWidth: 130 }}>
                    {[{ id: "manual", label: "MANUEL" }, { id: "auto", label: `AUTO${botStatus === "running" ? " ●" : ""}` }].map(m => (
                      <button key={m.id} onClick={() => setLabMode(m.id)} style={{ padding: "10px 14px", background: labMode === m.id ? "#7c3aed" : "#0a0a14", border: `1px solid ${labMode === m.id ? "#7c3aed" : "#12121e"}`, borderRadius: 2, color: labMode === m.id ? "#fff" : "#4b5563", fontWeight: "700", fontSize: 11, cursor: "pointer", letterSpacing: 0.8 }}>{m.label}</button>
                    ))}
                  </div>
                </div>

                {/* Courbe de balance */}
                {labBalHistory.length > 1 && (() => {
                  const pts = labBalHistory.map(h => parseFloat(h.balance)).filter(v => v > 0);
                  if (pts.length < 2) return null;
                  const W = 600, H = 70, pad = 6, min = Math.min(...pts), max = Math.max(...pts), rng = max - min || 1;
                  const coords = pts.map((v, i) => ({ x: pad + (i / (pts.length - 1)) * (W - 2 * pad), y: H - pad - ((v - min) / rng) * (H - 2 * pad) }));
                  const smooth = coords.map((p, i) => { if (i === 0) return `M ${p.x},${p.y}`; const pr = coords[i-1]; const cx = (pr.x + p.x) / 2; return `C ${cx},${pr.y} ${cx},${p.y} ${p.x},${p.y}`; }).join(" ");
                  const fill = `${smooth} L ${coords[coords.length-1].x},${H} L ${coords[0].x},${H} Z`;
                  const last = pts[pts.length-1], first = pts[0], color = last >= first ? "#00c98d" : "#ff4d4d";
                  return (
                    <div style={{ marginBottom: 20, background: "#050508", borderRadius: 2, padding: "12px 14px", border: "1px solid #1f1f35" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 4 }}>
                        <span>COURBE DE BALANCE</span>
                        <span style={{ color, fontWeight: "bold" }}>{last >= first ? "+" : ""}{((last - first) / first * 100).toFixed(1)}%</span>
                      </div>
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 70, display: "block" }}>
                        <defs><linearGradient id="labGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
                        <path d={fill} fill="url(#labGrad)" />
                        <path d={smooth} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r="3" fill={color} />
                      </svg>
                    </div>
                  );
                })()}

                {/* ── MODE MANUEL ── */}
                {labMode === "manual" && (
                  <div>
                    {(() => {
                      const sig = labSignals[labForm.pair];
                      if (!sig) return null;
                      const isLong = sig.direction === "long";
                      const conf = Math.round((sig.confidence || 0) * 100);
                      return (
                        <div style={{ background: isLong ? "#021a0f" : "#1a0203", border: `1px solid ${isLong ? "#00c98d22" : "#ff4d4d22"}`, borderRadius: 3, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 9, color: "#374151", letterSpacing: 1, fontWeight: "700", marginBottom: 3 }}>SIGNAL ALGO — {(sig.type || "").toUpperCase()} / {labForm.pair.replace("USDT","")}</div>
                            <div style={{ fontSize: 18, fontWeight: "700", color: isLong ? "#00c98d" : "#ff4d4d", fontFamily: MONO }}>{isLong ? "▲ LONG" : "▼ SHORT"}</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 100 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#374151", marginBottom: 4, fontWeight: "700" }}><span>CONFIANCE</span><span style={{ color: isLong ? "#00c98d" : "#ff4d4d", fontFamily: MONO }}>{conf}%</span></div>
                            <div style={{ background: "#050508", borderRadius: 1, height: 2, overflow: "hidden" }}><div style={{ width: `${conf}%`, height: "100%", background: isLong ? "#00c98d" : "#ff4d4d" }} /></div>
                          </div>
                          <span style={{ fontSize: 9, color: "#374151", fontFamily: MONO }}>{new Date(sig.created_at).toLocaleTimeString("fr-FR")}</span>
                        </div>
                      );
                    })()}
                    <div style={{ background: "#050508", border: "1px solid #12121e", borderRadius: 3, padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: "#374151", letterSpacing: 1, marginBottom: 12, fontWeight: "700" }}>PASSER UN ORDRE FICTIF</div>
                      {botStatus === "running" && <div style={{ padding: "6px 10px", background: "#120d00", border: "1px solid #f59e0b33", borderRadius: 2, fontSize: 11, color: "#f59e0b", marginBottom: 10, fontFamily: MONO }}>⚠ BOT AUTO ACTIF — arrêtez-le pour trader manuellement</div>}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <label style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 0.8 }}>PAIRE</label>
                          <select value={labForm.pair} onChange={e => setLabForm(f => ({ ...f, pair: e.target.value }))} style={{ padding: "7px 10px", background: "#0a0a14", border: "1px solid #1a1a2e", borderRadius: 2, color: "#e2e8f0", fontSize: 12, fontFamily: MONO }}>
                            {["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT"].map(p => <option key={p} value={p}>{p.replace("USDT","")}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <label style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 0.8 }}>DIRECTION</label>
                          <div style={{ display: "flex", gap: 2 }}>
                            {["LONG","SHORT"].map(d => <button key={d} onClick={() => setLabForm(f => ({ ...f, direction: d }))} style={{ padding: "7px 16px", border: "none", borderRadius: 2, fontWeight: "700", fontSize: 12, cursor: "pointer", fontFamily: MONO, background: labForm.direction === d ? (d === "LONG" ? "#064e3b" : "#450a0a") : "#0a0a14", color: labForm.direction === d ? (d === "LONG" ? "#00c98d" : "#ff4d4d") : "#4b5563", border: labForm.direction === d ? `1px solid ${d === "LONG" ? "#00c98d44" : "#ff4d4d44"}` : "1px solid #1a1a2e" }}>{d === "LONG" ? "▲ LONG" : "▼ SHORT"}</button>)}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <label style={{ fontSize: 9, color: "#374151", fontWeight: "700", letterSpacing: 0.8 }}>MONTANT ($)</label>
                          <input type="number" min="1" value={labForm.amount} onChange={e => setLabForm(f => ({ ...f, amount: e.target.value }))} style={{ padding: "7px 10px", background: "#0a0a14", border: "1px solid #1a1a2e", borderRadius: 2, color: "#e2e8f0", fontSize: 12, width: 80, fontFamily: MONO }} />
                        </div>
                        <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
                          {["10%","25%","50%","MAX"].map(p => <button key={p} onClick={() => setLabForm(f => ({ ...f, amount: p === "MAX" ? String(Math.floor(labBalance)) : String(Math.floor(labBalance * parseInt(p) / 100)) }))} style={{ padding: "7px 8px", background: "#0a0a14", border: "1px solid #1a1a2e", borderRadius: 2, color: "#4b5563", fontSize: 10, cursor: "pointer", fontFamily: MONO, fontWeight: "700" }}>{p}</button>)}
                        </div>
                        <button onClick={labPlaceTrade} disabled={labLoading || labBalance <= 0 || botStatus === "running"} style={{ padding: "8px 20px", background: (labLoading || botStatus === "running") ? "#0a0a14" : "#7c3aed", border: "none", borderRadius: 2, color: (labLoading || botStatus === "running") ? "#374151" : "#fff", fontWeight: "700", fontSize: 12, cursor: (labLoading || botStatus === "running") ? "not-allowed" : "pointer", letterSpacing: 0.5 }}>
                          {labLoading ? "ENVOI..." : "PLACER L'ORDRE"}
                        </button>
                      </div>
                      {labMsg && <div style={{ marginTop: 8, padding: "6px 12px", borderRadius: 2, fontSize: 11, background: labMsg.ok ? "#031a0f" : "#1a0303", color: labMsg.ok ? "#00c98d" : "#ff4d4d", border: `1px solid ${labMsg.ok ? "#00c98d22" : "#ff4d4d22"}`, fontFamily: MONO }}>{labMsg.ok || labMsg.error}</div>}
                      <div style={{ marginTop: 6, fontSize: 9, color: "#1f2937", fontFamily: MONO }}>Résolution auto dans 15 min vs prix Binance en temps réel. Signal algo ci-dessus = indicatif.</div>
                    </div>
                    {labPending.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 8 }}>EN ATTENTE ({labPending.length})</div>
                        {labPending.map((t, i) => (
                          <div key={i} style={{ background: "#050508", border: "1px solid #f59e0b33", borderRadius: 2, padding: "9px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                            <span style={{ color: t.direction === "LONG" ? "#00c98d" : "#ff4d4d", fontWeight: "bold" }}>{t.direction === "LONG" ? "▲" : "▼"} {t.direction}</span>
                            <span style={{ color: "#a78bfa", fontWeight: "bold" }}>{t.pair.replace("USDT","")}</span>
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>Mise ${t.amount}</span>
                            <span style={{ fontSize: 11, color: "#555" }}>@ ${parseFloat(t.price_at_entry).toLocaleString()}</span>
                            <span style={{ marginLeft: "auto", color: "#f59e0b", fontSize: 11 }}>⏳ en cours</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── MODE AUTO ── */}
                {labMode === "auto" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: botStatus === "running" ? "#00c98d" : "#555", boxShadow: botStatus === "running" ? "0 0 8px #00c98d" : "none" }} />
                        <span style={{ fontWeight: "bold", color: botStatus === "running" ? "#00c98d" : "#666", fontSize: 14 }}>{botStatus === "running" ? "BOT EN COURS" : "BOT ARRÊTÉ"}</span>
                      </div>
                      {botStatus === "stopped" ? (
                        <button onClick={labStartBot} style={{ padding: "8px 20px", background: "#047857", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>▶ Démarrer</button>
                      ) : (
                        <button onClick={labStopBot} style={{ padding: "8px 20px", background: "#b91c1c", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>■ Arrêter</button>
                      )}
                      <span style={{ fontSize: 11, color: "#555" }}>Mode simulation — consomme le solde Lab ci-dessus</span>
                    </div>
                    {botStatus === "stopped" && (
                      <div style={{ background: "#050508", borderRadius: 3, padding: 16, marginBottom: 20, border: "1px solid #1f1f35" }}>
                        <div style={{ fontSize: 10, color: "#555", marginBottom: 12, letterSpacing: 1 }}>CONFIGURATION</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                          {[
                            { label: "Stratégie", key: "strategy", type: "select", options: ["auto","contrarian","momentum","rsi","martingale","random"] },
                            { label: "Mise % balance", key: "betPercentage", type: "number", placeholder: "ex: 10" },
                            { label: "Stop-loss (BNB)", key: "maxLoss", type: "number", placeholder: "ex: 0.5" },
                          ].map(field => (
                            <div key={field.key}>
                              <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{field.label}</div>
                              {field.type === "select" ? (
                                <select value={botForm[field.key]} onChange={e => setBotForm(f => ({ ...f, [field.key]: e.target.value }))} style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "6px 8px", fontSize: 12 }}>
                                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input type="number" value={botForm[field.key]} onChange={e => setBotForm(f => ({ ...f, [field.key]: e.target.value }))} placeholder={field.placeholder} style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {botDecision && (
                      <div style={{ background: "#050508", borderRadius: 3, padding: 16, marginBottom: 20, border: `1px solid ${botDecision.action === "BET_BULL" ? "#00c98d44" : botDecision.action === "BET_BEAR" ? "#ff4d4d44" : "#12121e"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>DÉCISION — Round #{botDecision.epoch}</span>
                          <span style={{ fontSize: 10, color: "#444" }}>{botDecision.timestamp ? new Date(botDecision.timestamp).toLocaleTimeString("fr-FR") : ""}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                          <div style={{ fontSize: 26, fontWeight: "bold", color: botDecision.action === "BET_BULL" ? "#00c98d" : botDecision.action === "BET_BEAR" ? "#ff4d4d" : "#555" }}>{botDecision.action === "BET_BULL" ? "▲ BULL" : botDecision.action === "BET_BEAR" ? "▼ BEAR" : "⏭ SKIP"}</div>
                          {botDecision.confidence > 0 && (
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 3 }}><span>Confiance</span><span style={{ color: "#a78bfa", fontWeight: "bold" }}>{(botDecision.confidence * 100).toFixed(0)}%</span></div>
                              <div style={{ background: "#12121e", borderRadius: 3, height: 5, overflow: "hidden" }}><div style={{ width: `${botDecision.confidence * 100}%`, height: "100%", background: botDecision.confidence >= 0.7 ? "#00c98d" : "#fbbf24" }} /></div>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 10px", background: "#0a0a14", borderRadius: 2, marginBottom: 10 }}>{botDecision.reason}</div>
                        {botDecision.signals?.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {botDecision.signals.map((s, i) => <span key={i} style={{ padding: "3px 8px", borderRadius: 2, fontSize: 11, background: s.direction === "bull" ? "#0d2818" : "#2a0f0f", color: s.direction === "bull" ? "#00c98d" : "#ff4d4d" }}><strong>{s.name}</strong> {s.direction === "bull" ? "▲" : "▼"}</span>)}
                          </div>
                        )}
                      </div>
                    )}
                    {botLogs.length > 0 && (
                      <div style={{ background: "#050508", borderRadius: 3, padding: 14, marginBottom: 20, border: "1px solid #1f1f35", maxHeight: 200, overflowY: "auto" }}>
                        <div style={{ fontSize: 10, color: "#555", marginBottom: 8, letterSpacing: 1 }}>LOGS TEMPS RÉEL</div>
                        {botLogs.map((log, i) => <div key={i} style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 2, color: log.level === "success" ? "#00c98d" : log.level === "loss" ? "#ff4d4d" : log.level === "warn" ? "#fbbf24" : "#555" }}><span style={{ color: "#333", marginRight: 8 }}>{log.time ? new Date(log.time).toLocaleTimeString("fr-FR") : ""}</span>{log.message}</div>)}
                        <div ref={logsEndRef} />
                      </div>
                    )}
                  </div>
                )}

                {/* ─ Historique unifié ─ */}
                <div style={{ marginTop: 8 }}>
                  {labHistory.length > 0 ? (
                    <>
                      <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 10 }}>HISTORIQUE UNIFIÉ <span style={{ color: "#374151" }}>🎮 Manuel · 🤖 Bot</span></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {labHistory.map((t, i) => {
                          const isManual = t.source === "manual";
                          const isPending = t.result === "pending";
                          const pnl = parseFloat(t.pnl || t.profit || 0);
                          const color = isPending ? "#f59e0b" : t.result === "cancelled" ? "#555" : t.result === "win" ? "#00c98d" : "#ff4d4d";
                          return (
                            <div key={i} style={{ background: "#050508", border: "1px solid #1f1f35", borderRadius: 2, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, color: isManual ? "#a78bfa" : "#f59e0b" }}>{isManual ? "🎮" : "🤖"}</span>
                              <span style={{ fontWeight: "bold", color: (t.direction === "LONG" || t.direction === "bull") ? "#00c98d" : "#ff4d4d", fontSize: 13, minWidth: 55 }}>{(t.direction === "LONG" || t.direction === "bull") ? "▲" : "▼"} {t.direction?.toUpperCase()}</span>
                              <span style={{ color: "#a78bfa", fontWeight: "bold", fontSize: 12, minWidth: 36 }}>{(t.pair || "BNB").replace("USDT","")}</span>
                              <span style={{ fontSize: 12, color: "#9ca3af" }}>Mise <strong style={{ color: "#e5e7eb" }}>${parseFloat(t.amount || 0).toFixed(2)}</strong></span>
                              {t.price_at_entry && <span style={{ fontSize: 11, color: "#555" }}>@ ${parseFloat(t.price_at_entry).toLocaleString()}</span>}
                              <span style={{ marginLeft: "auto", fontWeight: "bold", color, fontSize: 13 }}>{isPending ? "⏳" : t.result === "cancelled" ? "✕" : `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}</span>
                              <span style={{ fontSize: 10, color: "#374151" }}>{new Date(t.created_at).toLocaleTimeString("fr-FR")}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", color: "#374151", padding: "40px 0", fontSize: 13 }}>
                      Aucun trade pour l'instant.<br/>
                      <span style={{ fontSize: 12 }}>🎮 Mode Manuel — ouvre ta première position · 🤖 Mode Auto — lance le bot PancakeSwap</span>
                    </div>
                  )}
                </div>

                {/* PLACEHOLDER for old simulator content removal */}
                {false && <div>
                {/* Solde + progression */}
                <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220, background: "#050508", border: "1px solid #1f1f35", borderRadius: 3, padding: "20px 24px" }}>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 6 }}>SOLDE SIMULATEUR</div>
                    <div style={{ fontSize: 34, fontWeight: "bold", color: simBalance >= 1000 ? "#00c98d" : simBalance >= 500 ? "#f59e0b" : "#ef4444" }}>
                      ${simBalance.toFixed(2)}
                    </div>
                    <div style={{ marginTop: 10, height: 6, background: "#12121e", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, (simBalance / 1000) * 100))}%`, height: "100%", background: simBalance >= 1000 ? "#00c98d" : simBalance >= 500 ? "#f59e0b" : "#ef4444", borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginTop: 4 }}>
                      <span>$0</span><span>$1 000</span>
                    </div>
                    {simBalance <= 0 && simCanReset && (
                      <button onClick={resetSimulator} style={{ marginTop: 12, width: "100%", padding: "8px 0", background: "#b91c1c", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                        🔄 Réinitialiser (1 seule fois)
                      </button>
                    )}
                    {!simCanReset && <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>Reset déjà utilisé</div>}
                  </div>

                  {/* Stats */}
                  {simStats && (
                    <div style={{ flex: 1, minWidth: 220, background: "#050508", border: "1px solid #1f1f35", borderRadius: 3, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>STATISTIQUES</div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {[
                          { label: "Trades", value: simStats.total || 0, color: "#9ca3af" },
                          { label: "Wins", value: simStats.wins || 0, color: "#00c98d" },
                          { label: "Losses", value: simStats.losses || 0, color: "#ff4d4d" },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: "bold", color }}>{value}</div>
                            <div style={{ fontSize: 10, color: "#555" }}>{label}</div>
                          </div>
                        ))}
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: "bold", color: (simStats.total_pnl || 0) >= 0 ? "#00c98d" : "#ff4d4d" }}>
                            {(simStats.total_pnl || 0) >= 0 ? "+" : ""}${parseFloat(simStats.total_pnl || 0).toFixed(2)}
                          </div>
                          <div style={{ fontSize: 10, color: "#555" }}>P&L Total</div>
                        </div>
                        {simStats.total > 0 && (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: "bold", color: "#a78bfa" }}>
                              {((simStats.wins / simStats.total) * 100).toFixed(0)}%
                            </div>
                            <div style={{ fontSize: 10, color: "#555" }}>Win Rate</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Formulaire de trade */}
                <div style={{ background: "#050508", border: "1px solid #1f1f35", borderRadius: 3, padding: "20px 24px", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 14 }}>PASSER UN ORDRE FICTIF</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 11, color: "#555" }}>Paire</label>
                      <select value={simForm.pair} onChange={e => setSimForm(f => ({ ...f, pair: e.target.value }))}
                        style={{ padding: "8px 12px", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#e5e7eb", fontSize: 13 }}>
                        {["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT"].map(p => <option key={p} value={p}>{p.replace("USDT", "")}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 11, color: "#555" }}>Direction</label>
                      <div style={{ display: "flex", gap: 4 }}>
                        {["LONG","SHORT"].map(d => (
                          <button key={d} onClick={() => setSimForm(f => ({ ...f, direction: d }))}
                            style={{ padding: "8px 18px", border: "none", borderRadius: 2, fontWeight: "bold", fontSize: 13, cursor: "pointer",
                              background: simForm.direction === d ? (d === "LONG" ? "#047857" : "#b91c1c") : "#12121e",
                              color: simForm.direction === d ? "#fff" : "#555" }}>
                            {d === "LONG" ? "▲ LONG" : "▼ SHORT"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 11, color: "#555" }}>Mise ($)</label>
                      <input type="number" min="1" max={simBalance} value={simForm.amount}
                        onChange={e => setSimForm(f => ({ ...f, amount: e.target.value }))}
                        style={{ padding: "8px 12px", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#e5e7eb", fontSize: 13, width: 100 }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                      {["10%","25%","50%","MAX"].map(p => (
                        <button key={p} onClick={() => {
                          const v = p === "MAX" ? simBalance : simBalance * parseInt(p) / 100;
                          setSimForm(f => ({ ...f, amount: Math.floor(v).toString() }));
                        }} style={{ padding: "8px 10px", background: "#12121e", border: "none", borderRadius: 2, color: "#9ca3af", fontSize: 11, cursor: "pointer" }}>
                          {p}
                        </button>
                      ))}
                    </div>
                    <button onClick={placeTrade} disabled={simLoading || simBalance <= 0}
                      style={{ padding: "9px 24px", background: simLoading ? "#12121e" : "#7c3aed", border: "none", borderRadius: 2, color: simLoading ? "#555" : "#fff", fontWeight: "bold", fontSize: 14, cursor: simLoading ? "not-allowed" : "pointer" }}>
                      {simLoading ? "⏳..." : "Placer le trade"}
                    </button>
                  </div>
                  {simMsg && (
                    <div style={{ marginTop: 12, padding: "8px 14px", borderRadius: 2, fontSize: 13,
                      background: simMsg.ok ? "#052e16" : "#1a0000", color: simMsg.ok ? "#00c98d" : "#ff4d4d",
                      border: `1px solid ${simMsg.ok ? "#16a34a44" : "#b91c1c44"}` }}>
                      {simMsg.ok || simMsg.error}
                    </div>
                  )}
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: "#374151" }}>
                    Les trades sont résolus automatiquement après 15 minutes en comparant le prix d'entrée au prix de marché réel.
                  </p>
                </div>

                {/* Historique des trades */}
                {simTrades.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 10 }}>HISTORIQUE DES TRADES</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {simTrades.map((t, i) => {
                        const isPending = t.result === "pending";
                        const isWin     = t.result === "win";
                        const color     = isPending ? "#f59e0b" : isWin ? "#00c98d" : t.result === "cancelled" ? "#555" : "#ff4d4d";
                        const pnlSign   = (t.pnl || 0) >= 0 ? "+" : "";
                        return (
                          <div key={i} style={{ background: "#050508", border: "1px solid #1f1f35", borderRadius: 2, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: "bold", color: t.direction === "LONG" ? "#00c98d" : "#ff4d4d", fontSize: 13, minWidth: 60 }}>
                              {t.direction === "LONG" ? "▲" : "▼"} {t.direction}
                            </span>
                            <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: "bold", minWidth: 50 }}>{t.pair.replace("USDT","")}</span>
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>Mise <strong style={{ color: "#e5e7eb" }}>${t.amount}</strong></span>
                            <span style={{ fontSize: 11, color: "#555" }}>Entrée ${parseFloat(t.price_at_entry).toLocaleString()}</span>
                            {!isPending && t.price_at_close && <span style={{ fontSize: 11, color: "#555" }}>→ ${parseFloat(t.price_at_close).toLocaleString()}</span>}
                            <span style={{ marginLeft: "auto", fontWeight: "bold", color, fontSize: 13 }}>
                              {isPending ? "⏳ En cours" : `${pnlSign}$${parseFloat(t.pnl || 0).toFixed(2)} (${pnlSign}${parseFloat(t.pnl_pct || 0).toFixed(2)}%)`}
                            </span>
                            <span style={{ fontSize: 10, color: "#374151" }}>{new Date(t.created_at).toLocaleTimeString("fr-FR")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>}
              </div>
            )}

            {/* ── Onglet Polymarket ─────────────────────────────────────────────── */}
            {activeTab === "polymarket" && (
              <div>
                {/* En-tête + bouton scan */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: "bold", color: "#e5e7eb" }}>🎯 Signaux Polymarket</h3>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>
                      Arbitrage Polymarket × Manifold — détection automatique toutes les 10 min
                      {polyScannedAt && <span style={{ marginLeft: 8 }}>· Dernier scan : {new Date(polyScannedAt).toLocaleTimeString("fr-FR")}</span>}
                    </p>
                  </div>
                  {userPlan !== "free" && (
                    <button
                      onClick={triggerPolyScan}
                      disabled={polyScanning}
                      style={{ padding: "8px 16px", background: polyScanning ? "#12121e" : "#7c3aed", border: "none", borderRadius: 2, color: polyScanning ? "#555" : "#fff", cursor: polyScanning ? "not-allowed" : "pointer", fontSize: 13, fontWeight: "bold" }}>
                      {polyScanning ? "⏳ Scan en cours..." : "🔄 Scanner maintenant"}
                    </button>
                  )}
                  {userPlan === "free" && (
                    <span style={{ fontSize: 12, color: "#f59e0b", background: "#1a1200", padding: "6px 12px", borderRadius: 2, border: "1px solid #f59e0b44" }}>
                      ⚠️ Free : signaux FORT uniquement — <a href="/pricing" style={{ color: "#f59e0b" }}>Upgrade</a>
                    </span>
                  )}
                </div>

                {/* Gaps d'arbitrage */}
                {polyGaps.length === 0 && !polyScanning && (
                  <div style={{ textAlign: "center", color: "#555", padding: "60px 0", fontSize: 14 }}>
                    Aucun signal détecté pour l'instant. Le prochain scan automatique est dans moins de 10 min.
                  </div>
                )}
                {polyScanning && polyGaps.length === 0 && (
                  <div style={{ textAlign: "center", color: "#7c3aed", padding: "60px 0", fontSize: 14 }}>
                    ⏳ Scan en cours... (environ 30 secondes)
                  </div>
                )}

                {polyGaps.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 10 }}>ÉCARTS D'ARBITRAGE DÉTECTÉS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {polyGaps.map((g, i) => {
                        const grade = g.grade || (g.confidence >= 70 ? "FORT" : g.confidence >= 40 ? "MODÉRÉ" : "FAIBLE");
                        const gradeColor = grade === "FORT" ? "#ef4444" : grade === "MODÉRÉ" ? "#f59e0b" : "#6b7280";
                        const gradeBg   = grade === "FORT" ? "#1a0000" : grade === "MODÉRÉ" ? "#1a1200" : "#0a0a14";
                        const gapPct    = ((g.gap || 0) * 100).toFixed(1);
                        const confPct   = g.confidence || 0;
                        const confBars  = Math.round(confPct / 10);
                        return (
                          <div key={i} style={{ background: "#050508", border: `1px solid ${gradeColor}33`, borderRadius: 2, padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                              <span style={{ background: gradeBg, color: gradeColor, border: `1px solid ${gradeColor}44`, borderRadius: 2, fontSize: 11, fontWeight: "bold", padding: "2px 8px" }}>
                                {grade === "FORT" ? "🔴" : grade === "MODÉRÉ" ? "🟡" : "⚪"} {grade}
                              </span>
                              <span style={{ color: gradeColor, fontSize: 18, fontWeight: "bold" }}>{gapPct}%</span>
                              <span style={{ fontSize: 11, color: "#555", background: "#0a0a14", padding: "2px 8px", borderRadius: 2 }}>
                                {g.type === "INTERNAL" ? "ARBITRAGE INTERNE" : "CROSS-MARCHÉ"}
                              </span>
                              <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
                                Score {g.score ?? g.confidence ?? "—"}/100 · Conf [{Array(confBars).fill("█").join("") + Array(10 - confBars).fill("░").join("")}]
                              </span>
                            </div>

                            {g.type === "INTERNAL" ? (
                              <p style={{ margin: "0 0 6px", fontSize: 13, color: "#d1d5db" }}>{g.question}</p>
                            ) : (
                              <>
                                <p style={{ margin: "0 0 4px", fontSize: 13, color: "#d1d5db" }}>
                                  <span style={{ color: "#7c3aed", fontWeight: "bold" }}>Poly</span> {g.polyQuestion}
                                </p>
                                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6b7280" }}>
                                  <span style={{ color: "#22d3ee", fontWeight: "bold" }}>Mfd</span> {g.manifoldQuestion}
                                </p>
                                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                                  <span>Poly <strong style={{ color: "#e5e7eb" }}>{((g.polyProb || 0) * 100).toFixed(1)}%</strong></span>
                                  <span>Manifold <strong style={{ color: "#e5e7eb" }}>{((g.manifoldProb || 0) * 100).toFixed(1)}%</strong></span>
                                  <span style={{ color: g.direction === "POLY_SOUS-ÉVALUÉ" ? "#00c98d" : "#ff4d4d" }}>
                                    {g.direction === "POLY_SOUS-ÉVALUÉ" ? "▲ SOUS-ÉVALUÉ" : "▼ SURÉVALUÉ"}
                                  </span>
                                </div>
                              </>
                            )}

                            <div style={{ display: "flex", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
                              <span style={{ color: "#555" }}>Liq ${((g.liqUSD || 0) / 1000).toFixed(1)}k</span>
                              <span style={{ color: "#555" }}>Spread {g.spreadPct != null ? g.spreadPct.toFixed(1) + "%" : "n/a"}</span>
                              {g.slug && (
                                <a href={`https://polymarket.com/event/${g.slug}`} target="_blank" rel="noopener noreferrer"
                                  style={{ color: "#7c3aed", marginLeft: "auto" }}>
                                  Voir sur Polymarket →
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Signaux de mouvement */}
                {polyMovements.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 10 }}>MOUVEMENTS DE PRIX RÉCENTS (≥3%)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {polyMovements.map((m, i) => {
                        const up      = m.movement_pct > 0;
                        const g       = m.grade || "FAIBLE";
                        const gColor  = g === "FORT" ? "#ef4444" : g === "MODÉRÉ" ? "#f59e0b" : "#6b7280";
                        const mvtColor= up ? "#00c98d" : "#ff4d4d";
                        return (
                          <div key={i} style={{ background: "#050508", border: "1px solid #1f1f35", borderRadius: 2, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ color: mvtColor, fontWeight: "bold", fontSize: 15, minWidth: 60 }}>
                              {up ? "+" : ""}{(m.movement_pct || 0).toFixed(2)}%
                            </span>
                            <span style={{ background: "#0a0a14", color: gColor, border: `1px solid ${gColor}44`, borderRadius: 3, fontSize: 10, padding: "1px 6px", fontWeight: "bold" }}>{g}</span>
                            <span style={{ fontSize: 12, color: "#9ca3af", flex: 1 }}>{m.question}</span>
                            <span style={{ fontSize: 11, color: "#555" }}>
                              {m.price_before != null ? (m.price_before * 100).toFixed(1) : "?"} → {m.price_after != null ? (m.price_after * 100).toFixed(1) : "?"}%
                            </span>
                            <span style={{ fontSize: 10, color: "#374151" }}>
                              {m.ts ? new Date(m.ts * 1000).toLocaleTimeString("fr-FR") : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "bot" && false && (
              <div>

                {/* Statut + contrôles */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: botStatus === "running" ? "#00c98d" : "#555", boxShadow: botStatus === "running" ? "0 0 8px #00c98d" : "none" }} />
                    <span style={{ fontWeight: "bold", color: botStatus === "running" ? "#00c98d" : "#666", fontSize: 14 }}>
                      {botStatus === "running" ? "EN COURS" : "ARRÊTÉ"}
                    </span>
                  </div>
                  {botStatus === "stopped" ? (
                    <button onClick={startBot} style={{ padding: "8px 20px", background: "#047857", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                      ▶ Démarrer
                    </button>
                  ) : (
                    <button onClick={stopBot} style={{ padding: "8px 20px", background: "#b91c1c", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                      ■ Arrêter
                    </button>
                  )}
                  <button onClick={resetBot} style={{ padding: "8px 14px", background: "none", border: "1px solid #1f1f35", borderRadius: 2, color: "#555", cursor: "pointer", fontSize: 12 }}>
                    ↺ Reset stats
                  </button>
                </div>

                {/* Config (seulement si arrêté) */}
                {botStatus === "stopped" && (
                  <div style={{ background: "#050508", borderRadius: 3, padding: 16, marginBottom: 20, border: "1px solid #1f1f35" }}>
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
                              style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "6px 8px", fontSize: 12 }}>
                              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input type="number" value={botForm[field.key]} onChange={e => setBotForm(f => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "6px 8px", fontSize: 12, boxSizing: "border-box" }} />
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
                      { label: "Victoires", value: botStats.wins, color: "#00c98d" },
                      { label: "Défaites", value: botStats.losses, color: "#ff4d4d" },
                      { label: "Win Rate", value: botStats.total_bets > 0 ? `${((botStats.wins / botStats.total_bets) * 100).toFixed(0)}%` : "—", color: botStats.wins >= botStats.losses ? "#00c98d" : "#ff4d4d" },
                      { label: "Balance", value: botStats.virtual_balance > 0 ? `$${parseFloat(botStats.virtual_balance).toFixed(2)}` : "—", color: "#fbbf24" },
                      { label: "Profit", value: botStats.total_won > 0 ? `+$${parseFloat(botStats.total_won).toFixed(2)}` : "—", color: "#00c98d" },
                      { label: "Perdu", value: botStats.total_lost > 0 ? `-$${parseFloat(botStats.total_lost).toFixed(2)}` : "—", color: "#ff4d4d" },
                    ].map(item => (
                      <div key={item.label} style={{ background: "#050508", borderRadius: 2, padding: "10px 12px", border: "1px solid #1f1f35" }}>
                        <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: "bold", color: item.color }}>{item.value ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Intelligence Panel — Dernière décision */}
                {botDecision && (
                  <div style={{ background: "#050508", borderRadius: 3, padding: 16, marginBottom: 20, border: `1px solid ${botDecision.action === "BET_BULL" ? "#00c98d44" : botDecision.action === "BET_BEAR" ? "#ff4d4d44" : "#12121e"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>DERNIÈRE DÉCISION — Round #{botDecision.epoch}</span>
                      <span style={{ fontSize: 11, color: "#444" }}>{botDecision.timestamp ? new Date(botDecision.timestamp).toLocaleTimeString("fr-FR") : ""}</span>
                    </div>

                    {/* Action principale */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 28, fontWeight: "bold", color: botDecision.action === "BET_BULL" ? "#00c98d" : botDecision.action === "BET_BEAR" ? "#ff4d4d" : "#555" }}>
                        {botDecision.action === "BET_BULL" ? "▲ BULL" : botDecision.action === "BET_BEAR" ? "▼ BEAR" : "⏭ SKIP"}
                      </div>
                      {botDecision.confidence > 0 && (
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 4 }}>
                            <span>Confiance</span><span style={{ color: "#a78bfa", fontWeight: "bold" }}>{(botDecision.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div style={{ background: "#12121e", borderRadius: 2, height: 6, overflow: "hidden" }}>
                            <div style={{ width: `${botDecision.confidence * 100}%`, height: "100%", background: botDecision.confidence >= 0.7 ? "#00c98d" : botDecision.confidence >= 0.55 ? "#fbbf24" : "#ff4d4d", transition: "width 0.5s" }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Raison */}
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14, padding: "8px 12px", background: "#0a0a14", borderRadius: 2 }}>
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
                        if (item.type === "trend") color = item.value === "bull" ? "#00c98d" : item.value === "bear" ? "#ff4d4d" : "#555";
                        if (item.type === "rsi") { const r = parseFloat(item.value); color = r < 35 ? "#00c98d" : r > 65 ? "#ff4d4d" : "#9ca3af"; }
                        if (item.type === "pnl") color = item.raw >= 0 ? "#00c98d" : "#ff4d4d";
                        if (item.type === "losses") color = item.value >= 3 ? "#ff4d4d" : item.value > 0 ? "#fbbf24" : "#00c98d";
                        const display = item.type === "trend" ? (item.value === "bull" ? "▲ HAUSSIÈRE" : item.value === "bear" ? "▼ BAISSIÈRE" : "— NEUTRE") : item.value;
                        return (
                          <div key={item.label} style={{ background: "#0a0a14", borderRadius: 2, padding: "8px 10px" }}>
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
                            <div key={i} style={{ padding: "4px 10px", borderRadius: 2, fontSize: 11, background: s.direction === "bull" ? "#0d2818" : "#2a0f0f", color: s.direction === "bull" ? "#00c98d" : "#ff4d4d", border: `1px solid ${s.direction === "bull" ? "#00c98d33" : "#ff4d4d33"}` }}>
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
                          <div key={i} style={{ fontSize: 11, color: "#fbbf24", background: "#1a1500", borderRadius: 2, padding: "6px 10px", border: "1px solid #fbbf2422" }}>
                            ⚠️ {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Logs en temps réel */}
                {botLogs.length > 0 && (
                  <div style={{ background: "#050508", borderRadius: 3, padding: 14, marginBottom: 20, border: "1px solid #1f1f35", maxHeight: 220, overflowY: "auto" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 10, letterSpacing: 1 }}>LOGS EN TEMPS RÉEL</div>
                    {botLogs.map((log, i) => (
                      <div key={i} style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 3, color: log.level === "success" ? "#00c98d" : log.level === "loss" ? "#ff4d4d" : log.level === "error" ? "#ff4d4d" : log.level === "warn" ? "#fbbf24" : "#555" }}>
                        <span style={{ color: "#333", marginRight: 8 }}>{log.time ? new Date(log.time).toLocaleTimeString("fr-FR") : ""}</span>
                        {log.message}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}

                {/* Graphique balance lissé */}
                {botHistory.length > 1 && (() => {
                  const pts = [...botHistory].reverse().map(t => parseFloat(t.balance_after || 0)).filter(v => v > 0);
                  if (pts.length < 2) return null;
                  const W = 500, H = 80, pad = 8;
                  const min = Math.min(...pts), max = Math.max(...pts);
                  const range = max - min || 1;
                  const coords = pts.map((v, i) => ({
                    x: pad + (i / (pts.length - 1)) * (W - 2 * pad),
                    y: H - pad - ((v - min) / range) * (H - 2 * pad),
                  }));
                  const smooth = coords.map((p, i) => {
                    if (i === 0) return `M ${p.x},${p.y}`;
                    const prev = coords[i - 1];
                    const cx = (prev.x + p.x) / 2;
                    return `C ${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
                  }).join(" ");
                  const fill = `${smooth} L ${coords[coords.length-1].x},${H} L ${coords[0].x},${H} Z`;
                  const last = pts[pts.length - 1], first = pts[0];
                  const color = last >= first ? "#00c98d" : "#ff4d4d";
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 6 }}>
                        <span>COURBE DE BALANCE</span>
                        <span style={{ color, fontWeight: "bold" }}>{last >= first ? "+" : ""}{((last - first) / first * 100).toFixed(1)}%</span>
                      </div>
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }}>
                        <defs>
                          <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={fill} fill="url(#balGrad)" />
                        <path d={smooth} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
                        <circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r="3" fill={color} />
                      </svg>
                    </div>
                  );
                })()}

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
                              <td style={{ ...s.td, fontWeight: "bold", color: t.direction === "bull" ? "#00c98d" : "#ff4d4d" }}>{t.direction === "bull" ? "▲ BULL" : "▼ BEAR"}</td>
                              <td style={{ ...s.td, fontFamily: "monospace" }}>${parseFloat(t.amount || 0).toFixed(2)}</td>
                              <td style={s.td}>
                                <span style={{ padding: "2px 8px", borderRadius: 2, fontSize: 11, fontWeight: "bold", background: t.result === "win" ? "#0d2818" : "#2a0f0f", color: t.result === "win" ? "#00c98d" : "#ff4d4d" }}>
                                  {t.result === "win" ? "✓ WIN" : "✗ LOSS"}
                                </span>
                              </td>
                              <td style={{ ...s.td, fontWeight: "bold", color: parseFloat(t.profit || 0) >= 0 ? "#00c98d" : "#ff4d4d" }}>
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
                <div style={{ background: "#050508", borderRadius: 3, padding: "16px 18px", marginBottom: 10, border: "1px solid #12121e" }}>
                  <div style={{ fontSize: 9, color: "#374151", marginBottom: 14, letterSpacing: 1, fontWeight: "700" }}>INFORMATIONS DU COMPTE</div>
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
                <div style={{ background: "#050508", borderRadius: 3, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>CHANGER LE MOT DE PASSE</div>
                  {[
                    { label: "Mot de passe actuel", key: "current" },
                    { label: "Nouveau mot de passe", key: "next" },
                    { label: "Confirmer le nouveau", key: "confirm" },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{f.label}</div>
                      <input type="password" value={pwForm[f.key]} onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                  ))}
                  {pwMsg && <div style={{ fontSize: 12, marginBottom: 8, color: pwMsg.ok ? "#00c98d" : "#ff4d4d" }}>{pwMsg.ok || pwMsg.error}</div>}
                  <button onClick={changePassword} style={{ padding: "8px 20px", background: "#7c3aed", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                    Mettre à jour
                  </button>
                </div>

                {/* Parrainage */}
                <div style={{ background: "#050508", borderRadius: 3, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>PARRAINAGE</div>
                  <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 14 }}>Invitez un ami avec votre code — il s'inscrit, vous recevez <strong style={{ color: "#00c98d" }}>1 mois gratuit</strong> sur votre plan.</p>
                  {referralCode && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ flex: 1, background: "#0a0a14", border: "1px solid #7c3aed44", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 18, fontWeight: "bold", color: "#a78bfa", letterSpacing: 3 }}>
                        {referralCode}
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(`https://www.cryptosignal.cloud?ref=${referralCode}`)}
                        style={{ padding: "10px 14px", background: "#12121e", border: "none", borderRadius: 2, color: "#9ca3af", cursor: "pointer", fontSize: 12 }}>
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
                <div style={{ background: "#050508", borderRadius: 3, padding: 20, marginBottom: 16, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>ALERTES TELEGRAM</div>
                  <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 10 }}>Obtenez votre Chat ID sur <strong>@userinfobot</strong> Telegram.</p>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Chat ID Telegram</div>
                    <input value={tgChatId} onChange={e => setTgChatId(e.target.value)} placeholder="ex: 123456789"
                      style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Confiance minimum</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[40, 50, 60, 70, 80].map(v => (
                        <button key={v} onClick={() => setTgPrefs(p => ({ ...p, minConf: v }))}
                          style={{ padding: "4px 12px", borderRadius: 2, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tgPrefs.minConf === v ? "bold" : "normal", background: tgPrefs.minConf === v ? "#7c3aed" : "#0a0a14", color: tgPrefs.minConf === v ? "#fff" : "#666" }}>
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
                          style={{ padding: "4px 10px", borderRadius: 2, border: "none", cursor: "pointer", fontSize: 12, background: tgPrefs.pairs.includes(p) ? "#7c3aed" : "#0a0a14", color: tgPrefs.pairs.includes(p) ? "#fff" : "#666" }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  {tgMsg && <div style={{ fontSize: 12, marginBottom: 8, color: tgMsg.ok ? "#00c98d" : "#ff4d4d" }}>{tgMsg.ok || tgMsg.error}</div>}
                  <button onClick={saveTelegram} style={{ padding: "8px 20px", background: "#7c3aed", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
                    Sauvegarder
                  </button>
                </div>

                {/* Clé privée */}
                <div style={{ background: "#050508", borderRadius: 3, padding: 20, border: "1px solid #1f1f35" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: 1 }}>CLÉ PRIVÉE (CHIFFRÉE)</div>
                  <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 12 }}>Sauvegardez votre clé privée chiffrée (AES-256) pour ne pas avoir à la ressaisir à chaque démarrage du bot.</p>
                  {savedKey ? (
                    <div>
                      <div style={{ background: "#0a0a14", border: "1px solid #00c98d33", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, color: "#00c98d", marginBottom: 10 }}>
                        🔒 {savedKey}
                      </div>
                      <button onClick={deleteKey} style={{ padding: "7px 14px", background: "none", border: "1px solid #ff4d4d", borderRadius: 2, color: "#ff4d4d", cursor: "pointer", fontSize: 12 }}>
                        Supprimer la clé
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="0x..."
                        style={{ width: "100%", background: "#0a0a14", border: "1px solid #1f1f35", borderRadius: 2, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />
                      {keyMsg && <div style={{ fontSize: 12, marginBottom: 8, color: keyMsg.ok ? "#00c98d" : "#ff4d4d" }}>{keyMsg.ok || keyMsg.error}</div>}
                      <button onClick={saveKey} style={{ padding: "8px 20px", background: "#7c3aed", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
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
      </div>
    </>
  );
}

const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";
const s = {
  page: { height: "100vh", display: "flex", flexDirection: "column", background: "#050507", fontFamily: "'Inter', system-ui, sans-serif", color: "#c9d1d9", overflow: "hidden" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", height: 40, borderBottom: "1px solid #0d0d1a", background: "#07070e", flexShrink: 0, gap: 12 },
  sidebar: { width: 176, flexShrink: 0, background: "#030305", borderRight: "1px solid #0d0d1a", display: "flex", flexDirection: "column", overflowY: "auto" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#050507" },
  sectionHead: { display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: "1px solid #0d0d1a", background: "#07070e", flexShrink: 0, minHeight: 36 },
  sectionTitle: { fontSize: 10, fontWeight: "700", color: "#a78bfa", letterSpacing: 1.5, textTransform: "uppercase" },
  logo: { fontSize: 14, fontWeight: "bold", color: "#e2e8f0", fontFamily: MONO, letterSpacing: 2 },
  planBadge: { padding: "2px 7px", borderRadius: 2, fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  upgradeBtn: { padding: "5px 12px", background: "#7c3aed", border: "none", borderRadius: 2, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 11, letterSpacing: 0.5 },
  logoutBtn: { padding: "5px 10px", background: "none", border: "1px solid #1a1a2e", borderRadius: 2, color: "#4b5563", cursor: "pointer", fontSize: 11 },
  sodBanner: { background: "#080810", borderRadius: 3, padding: "10px 14px", marginBottom: 10, border: "1px solid #12121e", borderLeft: "3px solid #7c3aed" },
  topRow: { display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  fgBox: { background: "#080810", borderRadius: 3, padding: "12px 14px", border: "1px solid #12121e", minWidth: 140 },
  pairsGrid: { flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  pairCard: { background: "#080810", borderRadius: 3, padding: "10px 12px", border: "1px solid #12121e" },
  statsBar: { display: "flex", background: "#080810", borderRadius: 3, padding: "8px 20px", marginBottom: 10, border: "1px solid #12121e", gap: 0, alignItems: "center" },
  statItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 },
  statDivider: { width: 1, height: 24, background: "#12121e" },
  panel: { background: "#080810", borderRadius: 3, padding: "16px 18px", border: "1px solid #12121e" },
  tabBar: { display: "flex", gap: 0, marginBottom: 18, borderBottom: "1px solid #12121e", flexWrap: "wrap" },
  tab: { padding: "9px 16px", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -1, color: "#4b5563", cursor: "pointer", fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase" },
  tabActive: { padding: "9px 16px", background: "none", border: "none", borderBottom: "2px solid #7c3aed", marginBottom: -1, color: "#a78bfa", cursor: "pointer", fontSize: 11, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase" },
  indCard: { background: "#050508", borderRadius: 3, padding: "10px 14px", minWidth: 90, border: "1px solid #12121e" },
  upgradeBanner: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0815", borderRadius: 3, padding: "10px 14px", border: "1px solid #7c3aed22", flexWrap: "wrap", gap: 10 },
  th: { textAlign: "left", padding: "7px 10px", fontWeight: "700", color: "#374151", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", background: "#050508", whiteSpace: "nowrap" },
  td: { padding: "8px 10px", color: "#9ca3af", fontSize: 12 },
};
