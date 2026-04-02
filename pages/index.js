import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PARTICLES = [
  { symbol: "₿", x: 8, y: 15, size: 22, opacity: 0.12, speed: 18 },
  { symbol: "Ξ", x: 20, y: 60, size: 18, opacity: 0.10, speed: 24 },
  { symbol: "◎", x: 75, y: 20, size: 20, opacity: 0.11, speed: 20 },
  { symbol: "⬡", x: 88, y: 70, size: 16, opacity: 0.09, speed: 28 },
  { symbol: "₿", x: 50, y: 80, size: 14, opacity: 0.08, speed: 32 },
  { symbol: "Ξ", x: 35, y: 35, size: 24, opacity: 0.07, speed: 22 },
  { symbol: "◎", x: 62, y: 55, size: 12, opacity: 0.10, speed: 26 },
  { symbol: "⬡", x: 15, y: 85, size: 18, opacity: 0.08, speed: 30 },
];

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [signalStats, setSignalStats] = useState(null);
  const [recentSignals, setRecentSignals] = useState([]);
  const [ticker, setTicker] = useState([]);
  const canvasRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/signals/stats`)
      .then(r => r.json())
      .then(d => { if (d.overall) setSignalStats(d); })
      .catch(() => {});

    fetch(`${API}/api/signals/public`)
      .then(r => r.json())
      .then(d => { if (d.signals) setRecentSignals(d.signals.slice(0, 5)); })
      .catch(() => {});

    fetch(`${API}/api/market/overview`)
      .then(r => r.json())
      .then(d => { if (d.overview) setTicker(d.overview); })
      .catch(() => {});
  }, []);

  // Canvas background — grille + courbe animée
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let frame;
    let t = 0;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Grille
      ctx.strokeStyle = "rgba(124,58,237,0.07)";
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Courbe animée style chart
      const pts = 120;
      const step = canvas.width / pts;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(124,58,237,0.35)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#7c3aed";
      ctx.shadowBlur = 10;
      for (let i = 0; i <= pts; i++) {
        const x = i * step;
        const y = canvas.height * 0.55
          + Math.sin(i * 0.12 + t) * 55
          + Math.sin(i * 0.05 + t * 0.7) * 35
          + Math.cos(i * 0.2 + t * 1.3) * 20;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Deuxième courbe verte
      ctx.beginPath();
      ctx.strokeStyle = "rgba(52,211,153,0.18)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= pts; i++) {
        const x = i * step;
        const y = canvas.height * 0.45
          + Math.sin(i * 0.09 + t * 1.1 + 1) * 40
          + Math.cos(i * 0.15 + t * 0.5) * 25;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      t += 0.008;
      frame = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.error) return setError(data.error);
      if (mode === "register") {
        router.push(`/verify?email=${encodeURIComponent(form.email)}`);
      } else if (data.needsVerification) {
        router.push(`/verify?email=${encodeURIComponent(form.email)}`);
      } else {
        localStorage.setItem("token", data.token);
        router.push("/dashboard");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Le serveur met du temps à répondre, réessaie dans quelques secondes.");
      } else {
        setError("Impossible de joindre le serveur. Vérifie ta connexion.");
      }
    } finally {
      setLoading(false);
    }
  }

  const winRate = signalStats?.overall?.total > 0
    ? ((signalStats.overall.wins / signalStats.overall.total) * 100).toFixed(1)
    : null;

  return (
    <>
      <Head>
        <title>CryptoSignal Pro — Signaux de trading crypto en temps réel</title>
        <meta name="description" content="Signaux RSI, EMA, MACD et Momentum sur BTC, ETH, BNB et SOL. Analyse multi-timeframe en temps réel. Alertes Telegram instantanées." />
        <style>{`
          @keyframes float { 0%, 100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-20px) rotate(5deg); } }
          @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(124,58,237,0.3); } 50% { box-shadow: 0 0 40px rgba(124,58,237,0.6), 0 0 60px rgba(124,58,237,0.2); } }
          @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes banner-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
          @keyframes neon-flicker { 0%, 100% { text-shadow: 0 0 8px #34d399, 0 0 20px #34d39966; } 50% { text-shadow: 0 0 12px #34d399, 0 0 30px #34d39988, 0 0 50px #34d39944; } }
          .hero-anim { animation: fade-up 0.8s ease forwards; }
          .hero-anim-2 { animation: fade-up 0.8s 0.15s ease forwards; opacity: 0; }
          .hero-anim-3 { animation: fade-up 0.8s 0.3s ease forwards; opacity: 0; }
          .hero-anim-4 { animation: fade-up 0.8s 0.45s ease forwards; opacity: 0; }
          .cta-btn:hover { filter: brightness(1.15); transform: translateY(-2px); transition: all 0.2s; }
          .outline-btn:hover { border-color: #7c3aed; color: #a78bfa; transition: all 0.2s; }
          .feature-card:hover { border-color: #7c3aed55; transform: translateY(-4px); transition: all 0.2s; background: #1e1e35 !important; }
          .signal-card:hover { border-color: #7c3aed44; transition: border 0.2s; }
          .neon-label { animation: neon-flicker 2s ease-in-out infinite; color: #34d399; }
          .urgency-banner { animation: banner-pulse 3s ease-in-out infinite; }
          .blur-signal { filter: blur(5px); user-select: none; pointer-events: none; }
        `}</style>
      </Head>

      <div style={{ minHeight: "100vh", background: "#070711", fontFamily: "system-ui, -apple-system, sans-serif", color: "#fff", overflowX: "hidden" }}>

        {/* Canvas background */}
        <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, zIndex: 0, pointerEvents: "none" }} />

        {/* Particules flottantes */}
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: "fixed", left: `${p.x}%`, top: `${p.y}%`,
            fontSize: p.size, opacity: p.opacity, zIndex: 0,
            animation: `float ${p.speed}s ease-in-out infinite`,
            animationDelay: `${i * 1.5}s`,
            color: "#7c3aed", pointerEvents: "none", userSelect: "none",
          }}>{p.symbol}</div>
        ))}

        {/* Glow radial centre */}
        <div style={{
          position: "fixed", top: "30%", left: "50%", transform: "translate(-50%,-50%)",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)",
          zIndex: 0, pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>

          {/* Ticker live */}
          {ticker.length > 0 && (
            <div style={{ background: "rgba(10,10,20,0.9)", borderBottom: "1px solid #1f1f35", padding: "8px 0", overflow: "hidden" }}>
              <div style={{ display: "flex", animation: "ticker-scroll 30s linear infinite", width: "200%" }}>
                {[...ticker, ...ticker].map((t, i) => (
                  <span key={i} style={{ whiteSpace: "nowrap", padding: "0 32px", fontSize: 13, color: parseFloat(t.change) >= 0 ? "#34d399" : "#f87171" }}>
                    <span style={{ color: "#9ca3af", marginRight: 8 }}>{t.pair}/USDT</span>
                    ${t.price?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    <span style={{ marginLeft: 8 }}>{parseFloat(t.change) >= 0 ? "▲" : "▼"} {Math.abs(t.change)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Nav */}
          <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", backdropFilter: "blur(10px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #7c3aed, #4f46e5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📈</div>
              <span style={{ fontSize: 18, fontWeight: "bold", letterSpacing: "-0.3px" }}>CryptoSignal <span style={{ color: "#7c3aed" }}>Pro</span></span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button style={{ padding: "9px 20px", background: "none", border: "1px solid #2d2d4e", borderRadius: 8, color: "#e5e7eb", cursor: "pointer", fontSize: 14 }} className="outline-btn"
                onClick={() => { setMode("login"); setShowAuth(true); }}>Connexion</button>
              <button style={{ padding: "9px 20px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 14, animation: "pulse-glow 3s ease infinite" }} className="cta-btn"
                onClick={() => { setMode("register"); setShowAuth(true); }}>Commencer gratuitement</button>
            </div>
          </nav>

          {/* Hero */}
          <section style={{ textAlign: "center", padding: "90px 40px 70px" }}>
            <div className="hero-anim" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(124,58,237,0.12)", color: "#a78bfa", padding: "6px 18px", borderRadius: 20, fontSize: 13, marginBottom: 28, border: "1px solid rgba(124,58,237,0.3)" }}>
              <span style={{ width: 6, height: 6, background: "#7c3aed", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 6px #7c3aed" }} />
              Détection de Tendance Institutionnelle — 6 paires majeures
            </div>
            <h1 className="hero-anim-2" style={{ fontSize: 62, fontWeight: 800, margin: "0 0 20px", lineHeight: 1.1, letterSpacing: "-1.5px" }}>
              L'intelligence algorithmique<br />
              <span style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                au service de vos trades
              </span>
            </h1>
            <p className="hero-anim-3" style={{ fontSize: 18, color: "#9ca3af", maxWidth: 600, margin: "0 auto 36px", lineHeight: 1.75 }}>
              Notre algorithme analyse les flux de liquidité et détecte les mouvements institutionnels avant qu'ils se produisent. Score de Confiance Algorithmique calculé en temps réel sur BTC, ETH, BNB, SOL, DOGE et AVAX.
            </p>
            <div className="hero-anim-4" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="cta-btn" style={{ padding: "15px 36px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 10, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 16 }}
                onClick={() => { setMode("register"); setShowAuth(true); }}>
                Accéder aux signaux →
              </button>
              <button className="outline-btn" style={{ padding: "15px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid #2d2d4e", borderRadius: 10, color: "#e5e7eb", cursor: "pointer", fontSize: 16 }}
                onClick={() => router.push("/pricing")}>
                Voir les offres
              </button>
            </div>
          </section>

          {/* Stats */}
          <section style={{ display: "flex", justifyContent: "center", gap: 16, padding: "0 40px 70px", flexWrap: "wrap" }}>
            {[
              { label: "Signaux évalués", value: signalStats?.overall?.total || "—", color: "#a78bfa", icon: "📊" },
              { label: "Paires suivies", value: "4", color: "#60a5fa", icon: "🔗" },
              { label: "Timeframes", value: "7", color: "#fbbf24", icon: "⏱" },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "rgba(26,26,46,0.8)", backdropFilter: "blur(10px)", borderRadius: 16, padding: "24px 40px", textAlign: "center", border: "1px solid #2d2d4e", minWidth: 160 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{stat.icon}</div>
                <div style={{ fontSize: 34, fontWeight: "bold", color: stat.color, marginBottom: 4 }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stat.label}</div>
              </div>
            ))}
          </section>

          {/* Showroom Profit — 3 derniers signaux terminés */}
          <section style={{ maxWidth: 760, margin: "0 auto 70px", padding: "0 40px" }}>
            <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: "bold", margin: "0 0 8px" }}>
              Performances <span style={{ color: "#7c3aed" }}>récentes</span>
            </h2>
            <p style={{ textAlign: "center", color: "#555", fontSize: 13, margin: "0 0 28px" }}>Signaux clôturés — résultats vérifiables en temps réel</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recentSignals.length > 0 ? recentSignals.map((sig, i) => (
                <div key={i} className="signal-card" style={{ background: "rgba(26,26,46,0.85)", backdropFilter: "blur(8px)", borderRadius: 12, padding: "16px 20px", border: `1px solid ${sig.result === "win" ? "#34d39933" : "#f8717133"}`, display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: sig.result === "win" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {sig.result === "win" ? "✅" : "❌"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "bold", color: "#e5e7eb", fontSize: 15 }}>
                        {sig.pair?.replace("USDT", "")}/USDT
                        <span style={{ marginLeft: 8, fontSize: 12, color: sig.direction === "long" ? "#34d399" : "#f87171" }}>
                          {sig.direction === "long" ? "▲ LONG" : "▼ SHORT"}
                        </span>
                      </span>
                      <span style={{ fontSize: 18, fontWeight: "bold", color: parseFloat(sig.pnl_pct) >= 0 ? "#34d399" : "#f87171" }}>
                        {parseFloat(sig.pnl_pct) >= 0 ? "+" : ""}{parseFloat(sig.pnl_pct || 0).toFixed(2)}%
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: "#555" }}>Score de Confiance Algorithmique</span>
                      <div style={{ flex: 1, background: "#0f0f1a", borderRadius: 4, height: 3 }}>
                        <div style={{ width: `${(sig.confidence || 0) * 100}%`, height: "100%", background: "linear-gradient(90deg, #7c3aed, #a78bfa)", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: "bold" }}>{Math.round((sig.confidence || 0) * 100)}%</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: "center", padding: "30px", color: "#333", fontSize: 13 }}>Signaux en cours d'évaluation...</div>
              )}
            </div>

            {/* Signal EN DIRECT flouté */}
            <div style={{ marginTop: 16, position: "relative", borderRadius: 12, overflow: "hidden" }}>
              <div className="blur-signal" style={{ background: "rgba(26,26,46,0.85)", borderRadius: 12, padding: "16px 20px", border: "1px solid #7c3aed44", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>▲</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: "bold", color: "#e5e7eb" }}>███/USDT <span style={{ color: "#34d399" }}>▲ LONG</span></span>
                    <span style={{ color: "#34d399", fontWeight: "bold" }}>EN COURS</span>
                  </div>
                  <div style={{ marginTop: 6, background: "#0f0f1a", borderRadius: 4, height: 3 }}>
                    <div style={{ width: "87%", height: "100%", background: "linear-gradient(90deg, #34d399, #7c3aed)", borderRadius: 4 }} />
                  </div>
                </div>
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(7,7,17,0.6)", backdropFilter: "blur(2px)", borderRadius: 12, gap: 10 }}>
                <div style={{ fontSize: 24 }}>🔒</div>
                <div style={{ fontSize: 13, color: "#e5e7eb", fontWeight: "bold" }}>SIGNAL EN DIRECT</div>
                <button className="cta-btn" style={{ padding: "8px 20px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}
                  onClick={() => { setMode("register"); setShowAuth(true); }}>
                  Débloquer le plan PRO →
                </button>
              </div>
            </div>
          </section>

          {/* Features */}
          <section style={{ padding: "0 40px 80px", maxWidth: 1060, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: "bold", margin: "0 0 10px" }}>Pourquoi <span style={{ color: "#7c3aed" }}>CryptoSignal Pro</span> ?</h2>
            <p style={{ textAlign: "center", color: "#555", fontSize: 14, margin: "0 0 36px" }}>Tout ce dont un trader a besoin, sans bruit</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
              {[
                { icon: "🧠", title: "Détection Institutionnelle", desc: "Notre algorithme identifie les mouvements de capitaux institutionnels avant qu'ils impactent le marché. Anticipez, ne subissez plus.", color: "#34d399" },
                { icon: "⚡", title: "Alertes Instantanées", desc: "Notifications Telegram en temps réel dès qu'une opportunité à fort potentiel est détectée. Ne ratez plus aucune fenêtre d'entrée.", color: "#fbbf24" },
                { icon: "📊", title: "Score de Confiance Algorithmique", desc: "Chaque signal est noté de 0 à 100. Seules les opportunités dépassant le seuil de viabilité vous sont transmises.", color: "#a78bfa" },
                { icon: "💧", title: "Analyse de Flux de Liquidité", desc: "Détection des zones de liquidité et des pics de volume anormaux qui précèdent les grands mouvements directionnels.", color: "#f97316" },
                { icon: "🎯", title: "Niveaux de Sortie Calculés", desc: "Chaque signal intègre un niveau de protection et un objectif de profit optimisés selon la volatilité actuelle du marché.", color: "#60a5fa" },
                { icon: "🐋", title: "Whale Tracker en Temps Réel", desc: "Détectez les mouvements des baleines : chaque transaction >500 000$ sur Binance est analysée et catégorisée (accumulation ou distribution). Réservé ELITE.", color: "#22d3ee" },
                { icon: "🎯", title: "Arbitrage Polymarket", desc: "Détection automatique d'écarts de prix entre Polymarket et Manifold Markets. Scans toutes les 10 min, signal FORT/MODÉRÉ/FAIBLE, cross-marché et interne. Actif 24h/24.", color: "#e879f9" },
                { icon: "🔒", title: "Sans engagement", desc: "Accès gratuit immédiat. Plans hebdomadaires en USDT. Annulation à tout moment. Zéro frais cachés.", color: "#818cf8" },
              ].map((f) => (
                <div key={f.title} className="feature-card" style={{ background: "rgba(26,26,46,0.7)", backdropFilter: "blur(8px)", borderRadius: 14, padding: "22px 20px", border: "1px solid #2d2d4e" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15, color: f.color }}>{f.title}</h3>
                  <p style={{ color: "#6b7280", fontSize: 13, margin: 0, lineHeight: 1.65 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Polymarket Section ─────────────────────────────────────── */}
          <section style={{ padding: "0 40px 80px", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ display: "inline-block", background: "rgba(232,121,249,0.1)", border: "1px solid #e879f944", borderRadius: 4, padding: "4px 14px", fontSize: 11, fontWeight: "bold", color: "#e879f9", letterSpacing: 2, marginBottom: 14 }}>
                NOUVEAU · ARBITRAGE PRÉDICTIF
              </div>
              <h2 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 12px" }}>
                Outil <span style={{ color: "#e879f9" }}>Polymarket</span>
              </h2>
              <p style={{ color: "#6b7280", fontSize: 15, maxWidth: 560, margin: "0 auto" }}>
                Détectez les écarts de probabilité entre Polymarket et Manifold Markets avant que le marché ne se rééquilibre. Scanner automatique toutes les 10 minutes.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Left: How it works */}
              <div style={{ background: "rgba(15,10,30,0.8)", borderRadius: 8, border: "1px solid #2d2d4e", padding: "28px 28px" }}>
                <h3 style={{ margin: "0 0 20px", fontSize: 16, color: "#e2e8f0" }}>Comment ça marche</h3>
                {[
                  { step: "01", title: "Scan toutes les 10 min", desc: "Notre bot analyse les marchés Polymarket actifs — probabilités, liquidités, spreads." },
                  { step: "02", title: "Cross-matching Manifold", desc: "Comparaison automatique avec les marchés équivalents sur Manifold Markets." },
                  { step: "03", title: "Détection d'écarts", desc: "Tout écart ≥ 3% est signalé avec score FORT/MODÉRÉ/FAIBLE et direction d'arbitrage." },
                  { step: "04", title: "Signal actionnable", desc: "Vous voyez le gap %, les probabilités des deux plateformes et un lien direct vers l'event." },
                ].map(item => (
                  <div key={item.step} style={{ display: "flex", gap: 14, marginBottom: 16 }}>
                    <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 2, background: "rgba(232,121,249,0.1)", border: "1px solid #e879f944", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", color: "#e879f9", fontFamily: "monospace" }}>{item.step}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: "bold", color: "#e2e8f0", marginBottom: 3 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Signal preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "rgba(15,10,30,0.8)", borderRadius: 8, border: "1px solid #ef444433", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ background: "#1a0003", color: "#ef4444", border: "1px solid #ef444444", borderRadius: 2, fontSize: 10, fontWeight: "bold", padding: "2px 8px" }}>🔴 FORT</span>
                    <span style={{ color: "#ef4444", fontSize: 16, fontWeight: "bold", fontFamily: "monospace" }}>8.4%</span>
                    <span style={{ fontSize: 10, color: "#6b7280", background: "#111", padding: "2px 8px", borderRadius: 2 }}>CROSS-MARCHÉ</span>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: "#d1d5db" }}>Will the Fed cut rates in Q3 2025?</p>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#9ca3af" }}>
                    <span>Poly <strong style={{ color: "#e2e8f0" }}>34.1%</strong></span>
                    <span>Manifold <strong style={{ color: "#e2e8f0" }}>42.5%</strong></span>
                    <span style={{ color: "#00c98d" }}>▲ POLY SOUS-ÉVALUÉ</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#4b5563" }}>Score 82/100 · Liq $12.4k · Spread 1.8%</div>
                </div>

                <div style={{ background: "rgba(15,10,30,0.8)", borderRadius: 8, border: "1px solid #f59e0b33", padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ background: "#120c00", color: "#f59e0b", border: "1px solid #f59e0b44", borderRadius: 2, fontSize: 10, fontWeight: "bold", padding: "2px 8px" }}>🟡 MODÉRÉ</span>
                    <span style={{ color: "#f59e0b", fontSize: 16, fontWeight: "bold", fontFamily: "monospace" }}>4.7%</span>
                    <span style={{ fontSize: 10, color: "#6b7280", background: "#111", padding: "2px 8px", borderRadius: 2 }}>ARBITRAGE INTERNE</span>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: "#d1d5db" }}>Bitcoin above $100k before Dec 2025</p>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>Score 51/100 · Liq $8.1k · Spread 3.2%</div>
                </div>

                <div style={{ background: "rgba(15,10,30,0.6)", borderRadius: 8, border: "1px solid #7c3aed33", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Accès complet aux signaux Polymarket avec un compte Pro ou Elite</span>
                  <button className="cta-btn" style={{ flexShrink: 0, padding: "7px 16px", background: "#7c3aed", border: "none", borderRadius: 4, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 12 }}
                    onClick={() => { setMode("register"); setShowAuth(true); }}>
                    Essayer
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing teaser */}
          <section style={{ padding: "0 40px 80px", maxWidth: 900, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: "bold", margin: "0 0 36px" }}>Choisissez votre <span style={{ color: "#7c3aed" }}>plan</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {[
                { plan: "Free", price: "0 USDT", period: "", color: "#9ca3af", badge: null, features: ["5 signaux/jour", "BTC & ETH uniquement", "Données différées (30 min)", "Score de confiance visible"], cta: "Commencer gratuitement" },
                { plan: "Pro", price: "7 USDT", period: "/ semaine", color: "#a78bfa", badge: "⚡ Le plus populaire", features: ["Signaux illimités temps réel", "6 paires (BTC/ETH/BNB/SOL/DOGE/AVAX)", "Tous les timeframes (5m→4h)", "Alertes Telegram instantanées", "Matrice de confluence multi-TF", "Score de Confiance Algorithmique"], cta: "Démarrer Pro", highlight: true },
                { plan: "Elite", price: "15 USDT", period: "/ semaine", color: "#fbbf24", badge: "👑 Accès total", features: ["Tout Pro inclus", "Timeframe 1D", "Whale Tracker temps réel", "Signaux PancakeSwap (pépites)", "Détection de tendance institutionnelle", "Support prioritaire 24h", "Bot de trading automatisé"], cta: "Devenir Elite" },
              ].map((p) => (
                <div key={p.plan} style={{ background: p.highlight ? "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(79,70,229,0.1))" : "rgba(26,26,46,0.7)", backdropFilter: "blur(8px)", borderRadius: 16, padding: "28px 24px", border: p.highlight ? "1px solid rgba(124,58,237,0.5)" : "1px solid #2d2d4e", textAlign: "center", position: "relative" }}>
                  {p.badge && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: p.highlight ? "#7c3aed" : "#f59e0b", color: "#fff", fontSize: 11, fontWeight: "bold", padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>{p.badge}</div>}
                  <div style={{ fontSize: 13, color: p.color, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{p.plan}</div>
                  <div style={{ marginBottom: 20 }}>
                    <span style={{ fontSize: 32, fontWeight: "bold" }}>{p.price}</span>
                    <span style={{ fontSize: 14, color: "#666", marginLeft: 4 }}>{p.period}</span>
                  </div>
                  <ul style={{ list: "none", padding: 0, margin: "0 0 24px", textAlign: "left" }}>
                    {p.features.map(f => (
                      <li key={f} style={{ padding: "5px 0", fontSize: 13, color: "#9ca3af", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: p.color }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button className="cta-btn" style={{ width: "100%", padding: "11px 0", background: p.highlight ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.06)", border: p.highlight ? "none" : "1px solid #2d2d4e", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 14 }}
                    onClick={() => { setMode("register"); setShowAuth(true); }}>
                    {p.cta}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* CTA final */}
          <section style={{ textAlign: "center", padding: "70px 40px", background: "linear-gradient(180deg, transparent, rgba(124,58,237,0.08), transparent)", borderTop: "1px solid #1f1f35" }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.5px" }}>Prêt à trader plus intelligemment ?</h2>
            <p style={{ color: "#6b7280", margin: "0 0 30px", fontSize: 16 }}>Gratuit, sans carte bancaire. Accès immédiat.</p>
            <button className="cta-btn" style={{ padding: "16px 44px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 12, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 17, animation: "pulse-glow 3s ease infinite" }}
              onClick={() => { setMode("register"); setShowAuth(true); }}>
              Créer un compte gratuit
            </button>
          </section>

          {/* Footer */}
          <footer style={{ textAlign: "center", padding: "28px 40px", color: "#444", fontSize: 12, borderTop: "1px solid #1f1f35" }}>
            <p style={{ margin: "0 0 8px" }}>LaLa © 2026 CryptoSignal Pro — Le trading comporte des risques.</p>
            <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
              <span style={{ cursor: "pointer" }} onClick={() => router.push("/pricing")}>Tarifs</span>
              <span style={{ cursor: "pointer" }} onClick={() => { setMode("login"); setShowAuth(true); }}>Connexion</span>
            </div>
          </footer>
        </div>

        {/* Modal Auth */}
        {showAuth && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => setShowAuth(false)}>
            <div style={{ background: "#111122", borderRadius: 18, padding: 40, width: 380, position: "relative", border: "1px solid #2d2d4e", boxShadow: "0 0 60px rgba(124,58,237,0.2)" }}
              onClick={(e) => e.stopPropagation()}>
              <button style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer" }} onClick={() => setShowAuth(false)}>✕</button>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, background: "linear-gradient(135deg, #7c3aed, #4f46e5)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, margin: "0 auto 10px" }}>📈</div>
                <div style={{ fontWeight: "bold", fontSize: 18 }}>CryptoSignal Pro</div>
              </div>
              <div style={{ display: "flex", marginBottom: 20, background: "#0a0a14", borderRadius: 8, padding: 4 }}>
                <button style={{ flex: 1, padding: "8px 0", background: mode === "login" ? "#7c3aed" : "none", border: "none", color: mode === "login" ? "#fff" : "#666", cursor: "pointer", borderRadius: 6, fontSize: 14 }} onClick={() => setMode("login")}>Connexion</button>
                <button style={{ flex: 1, padding: "8px 0", background: mode === "register" ? "#7c3aed" : "none", border: "none", color: mode === "register" ? "#fff" : "#666", cursor: "pointer", borderRadius: 6, fontSize: 14 }} onClick={() => setMode("register")}>Inscription</button>
              </div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input style={{ padding: "12px 16px", background: "#0a0a14", border: "1px solid #2d2d4e", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" }} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <input style={{ padding: "12px 16px", background: "#0a0a14", border: "1px solid #2d2d4e", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" }} type="password" placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0, textAlign: "center" }}>{error}</p>}
                <button style={{ padding: "13px 0", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer" }} type="submit" disabled={loading}>
                  {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer un compte"}
                </button>
                {mode === "login" && (
                  <p style={{ textAlign: "center", margin: 0 }}>
                    <span style={{ color: "#7c3aed", fontSize: 13, cursor: "pointer" }} onClick={() => router.push("/forgot-password")}>
                      Mot de passe oublié ?
                    </span>
                  </p>
                )}
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
