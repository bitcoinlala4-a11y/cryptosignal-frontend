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
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) return setError(data.error);
    if (mode === "register") {
      router.push(`/verify?email=${encodeURIComponent(form.email)}`);
    } else if (data.needsVerification) {
      router.push(`/verify?email=${encodeURIComponent(form.email)}`);
    } else {
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    }
  }

  const winRate = signalStats?.overall?.total > 0
    ? ((signalStats.overall.wins / signalStats.overall.total) * 100).toFixed(1)
    : null;

  return (
    <>
      <Head>
        <title>CryptoSignal Pro — Signaux de trading crypto en temps réel</title>
        <meta name="description" content="Signaux RSI, EMA, MACD et Momentum sur BTC, ETH, BNB et SOL. Win rate prouvé en temps réel. Alertes Telegram instantanées." />
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(5deg); }
          }
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(124,58,237,0.3); }
            50% { box-shadow: 0 0 40px rgba(124,58,237,0.6), 0 0 60px rgba(124,58,237,0.2); }
          }
          @keyframes ticker-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes fade-up {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .hero-anim { animation: fade-up 0.8s ease forwards; }
          .hero-anim-2 { animation: fade-up 0.8s 0.15s ease forwards; opacity: 0; }
          .hero-anim-3 { animation: fade-up 0.8s 0.3s ease forwards; opacity: 0; }
          .hero-anim-4 { animation: fade-up 0.8s 0.45s ease forwards; opacity: 0; }
          .cta-btn:hover { filter: brightness(1.15); transform: translateY(-2px); transition: all 0.2s; }
          .outline-btn:hover { border-color: #7c3aed; color: #a78bfa; transition: all 0.2s; }
          .feature-card:hover { border-color: #7c3aed55; transform: translateY(-4px); transition: all 0.2s; background: #1e1e35 !important; }
          .signal-card:hover { border-color: #7c3aed44; transition: border 0.2s; }
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
              {"Signaux crypto en temps réel — 4 paires majeures"}
            </div>
            <h1 className="hero-anim-2" style={{ fontSize: 62, fontWeight: 800, margin: "0 0 20px", lineHeight: 1.1, letterSpacing: "-1.5px" }}>
              Des signaux crypto<br />
              <span style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                qui performent
              </span>
            </h1>
            <p className="hero-anim-3" style={{ fontSize: 18, color: "#9ca3af", maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.75 }}>
              RSI, EMA, MACD et Momentum analysés toutes les minutes sur BTC, ETH, BNB et SOL.
              Chaque signal inclut Stop-Loss, Take-Profit et ratio R:R calculés en temps réel.
            </p>
            <div className="hero-anim-4" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="cta-btn" style={{ padding: "15px 36px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", border: "none", borderRadius: 10, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 16 }}
                onClick={() => { setMode("register"); setShowAuth(true); }}>
                Essayer gratuitement →
              </button>
              <button className="outline-btn" style={{ padding: "15px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid #2d2d4e", borderRadius: 10, color: "#e5e7eb", cursor: "pointer", fontSize: 16 }}
                onClick={() => router.push("/pricing")}>
                Voir les tarifs
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

          {/* Signaux récents */}
          {recentSignals.length > 0 && (
            <section style={{ maxWidth: 720, margin: "0 auto 70px", padding: "0 40px" }}>
              <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: "bold", margin: "0 0 28px" }}>
                Derniers signaux <span style={{ color: "#7c3aed" }}>en direct</span>
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentSignals.map((sig, i) => (
                  <div key={i} className="signal-card" style={{ background: "rgba(26,26,46,0.85)", backdropFilter: "blur(8px)", borderRadius: 12, padding: "14px 18px", border: "1px solid #2d2d4e", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: sig.direction === "long" ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {sig.direction === "long" ? "▲" : "▼"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "bold", color: "#e5e7eb" }}>{sig.pair?.replace("USDT", "")} <span style={{ color: "#555", fontWeight: "normal", fontSize: 12 }}>— {sig.type?.toUpperCase()}</span></span>
                        <span style={{ fontSize: 11, color: "#444" }}>{new Date(sig.created_at).toLocaleTimeString("fr-FR")}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                        <div style={{ flex: 1, background: "#0f0f1a", borderRadius: 4, height: 4 }}>
                          <div style={{ width: `${(sig.confidence || 0) * 100}%`, height: "100%", background: "linear-gradient(90deg, #7c3aed, #a78bfa)", borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#666" }}>{Math.round((sig.confidence || 0) * 100)}%</span>
                        <span style={{ fontSize: 12, fontWeight: "bold", color: sig.result === "win" ? "#34d399" : sig.result === "loss" ? "#f87171" : "#555" }}>
                          {sig.result === "win" ? "✓ WIN" : sig.result === "loss" ? "✗ LOSS" : "⏳"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ textAlign: "center", color: "#555", fontSize: 13, marginTop: 18 }}>
                <span style={{ cursor: "pointer", color: "#7c3aed" }} onClick={() => { setMode("register"); setShowAuth(true); }}>
                  Créer un compte gratuit pour voir tous les signaux →
                </span>
              </p>
            </section>
          )}

          {/* Features */}
          <section style={{ padding: "0 40px 80px", maxWidth: 1060, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: "bold", margin: "0 0 10px" }}>Pourquoi <span style={{ color: "#7c3aed" }}>CryptoSignal Pro</span> ?</h2>
            <p style={{ textAlign: "center", color: "#555", fontSize: 14, margin: "0 0 36px" }}>Tout ce dont un trader a besoin, sans bruit</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
              {[
                { icon: "🎯", title: "Win rate transparent", desc: "Chaque signal est évalué automatiquement. Aucune manipulation, les résultats sont visibles par tous.", color: "#34d399" },
                { icon: "⚡", title: "Temps réel", desc: "Signaux générés toutes les minutes. Alertes Telegram instantanées dès qu'un signal dépasse 60% de confiance.", color: "#fbbf24" },
                { icon: "📐", title: "SL / TP / R:R", desc: "Chaque signal calcule automatiquement le Stop-Loss et Take-Profit via ATR. Ratio risque/récompense affiché.", color: "#a78bfa" },
                { icon: "🔥", title: "Volume Spike", desc: "Détection automatique des pics de volume anormaux. Indicateur 🔥 sur les signaux avec volume x2.", color: "#f97316" },
                { icon: "🗂", title: "Multi-timeframe", desc: "Analyse simultanée sur 7 timeframes de 5m à 1D. Matrice de confluence pour valider les entrées.", color: "#60a5fa" },
                { icon: "🔒", title: "Sans risque", desc: "Plan gratuit disponible sans carte bancaire. Paiement uniquement en crypto (USDT). Annulation à tout moment.", color: "#818cf8" },
              ].map((f) => (
                <div key={f.title} className="feature-card" style={{ background: "rgba(26,26,46,0.7)", backdropFilter: "blur(8px)", borderRadius: 14, padding: "22px 20px", border: "1px solid #2d2d4e" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15, color: f.color }}>{f.title}</h3>
                  <p style={{ color: "#6b7280", fontSize: 13, margin: 0, lineHeight: 1.65 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Pricing teaser */}
          <section style={{ padding: "0 40px 80px", maxWidth: 900, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", fontSize: 26, fontWeight: "bold", margin: "0 0 36px" }}>Choisissez votre <span style={{ color: "#7c3aed" }}>plan</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {[
                { plan: "Free", price: "0 USDT", color: "#9ca3af", features: ["5 signaux/jour", "BTC & ETH seulement", "Timeframe 1h", "Résultats en temps réel"], cta: "Commencer" },
                { plan: "Pro", price: "19 USDT/mois", color: "#a78bfa", features: ["Signaux illimités", "4 paires (BTC/ETH/BNB/SOL)", "6 timeframes (5m→4h)", "Alertes Telegram", "Matrice multi-TF"], cta: "Essayer Pro", highlight: true },
                { plan: "Elite", price: "49 USDT/mois", color: "#fbbf24", features: ["Tout Pro +", "Timeframe 1D", "PancakeSwap prédictions", "Signaux prioritaires", "Support dédié"], cta: "Devenir Elite" },
              ].map((p) => (
                <div key={p.plan} style={{ background: p.highlight ? "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(79,70,229,0.1))" : "rgba(26,26,46,0.7)", backdropFilter: "blur(8px)", borderRadius: 16, padding: "28px 24px", border: p.highlight ? "1px solid rgba(124,58,237,0.5)" : "1px solid #2d2d4e", textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: p.color, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{p.plan}</div>
                  <div style={{ fontSize: 26, fontWeight: "bold", marginBottom: 20 }}>{p.price}</div>
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
