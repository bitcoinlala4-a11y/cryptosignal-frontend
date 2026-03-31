import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [signalStats, setSignalStats] = useState(null);
  const [recentSignals, setRecentSignals] = useState([]);

  useEffect(() => {
    // Charger les stats publiques
    fetch(`${API}/api/signals/stats`)
      .then(r => r.json())
      .then(d => { if (d.overall) setSignalStats(d); })
      .catch(() => {});

    fetch(`${API}/api/signals/public`)
      .then(r => r.json())
      .then(d => { if (d.signals) setRecentSignals(d.signals.slice(0, 5)); })
      .catch(() => {});
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
      </Head>
      <div style={s.page}>

        {/* Nav */}
        <nav style={s.nav}>
          <span style={s.logo}>📈 CryptoSignal Pro</span>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={s.btnOutline} onClick={() => { setMode("login"); setShowAuth(true); }}>Connexion</button>
            <button style={s.btnPrimary} onClick={() => { setMode("register"); setShowAuth(true); }}>Commencer gratuitement</button>
          </div>
        </nav>

        {/* Hero */}
        <section style={s.hero}>
          <div style={s.heroBadge}>
            {winRate ? `Win rate actuel : ${winRate}% sur ${signalStats.overall.total} signaux` : "Signaux crypto en temps réel"}
          </div>
          <h1 style={s.heroTitle}>
            Des signaux crypto<br />
            <span style={{ color: "#7c3aed" }}>qui performent</span>
          </h1>
          <p style={s.heroSub}>
            RSI, EMA, MACD et Momentum analysés toutes les minutes sur BTC, ETH, BNB et SOL.
            Chaque signal est évalué automatiquement et son résultat affiché en temps réel.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{ ...s.btnPrimary, padding: "14px 32px", fontSize: 16 }} onClick={() => { setMode("register"); setShowAuth(true); }}>
              Essayer gratuitement
            </button>
            <button style={{ ...s.btnOutline, padding: "14px 32px", fontSize: 16 }} onClick={() => router.push("/pricing")}>
              Voir les tarifs
            </button>
          </div>
        </section>

        {/* Stats */}
        <section style={s.statsSection}>
          {[
            { label: "Win rate global", value: winRate ? `${winRate}%` : "—", color: "#34d399" },
            { label: "Signaux évalués", value: signalStats?.overall?.total || "—", color: "#a78bfa" },
            { label: "Paires suivies", value: "4", color: "#60a5fa" },
            { label: "Évaluation", value: "15 min", color: "#fbbf24" },
          ].map((stat) => (
            <div key={stat.label} style={s.statBox}>
              <div style={{ ...s.statVal, color: stat.color }}>{stat.value}</div>
              <div style={s.statLbl}>{stat.label}</div>
            </div>
          ))}
        </section>

        {/* Signaux récents */}
        {recentSignals.length > 0 && (
          <section style={s.signalsSection}>
            <h2 style={s.sectionTitle}>Derniers signaux</h2>
            <div style={s.signalsList}>
              {recentSignals.map((sig, i) => (
                <div key={i} style={s.signalCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold", color: "#a78bfa" }}>{sig.pair?.replace("USDT", "/USDT")}</span>
                    <span style={{ fontSize: 11, color: "#555" }}>{new Date(sig.created_at).toLocaleTimeString("fr-FR")}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span style={{ color: sig.direction === "long" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                      {sig.direction === "long" ? "▲ LONG" : "▼ SHORT"} — {sig.type?.toUpperCase()}
                    </span>
                    <span style={{ color: sig.result === "win" ? "#34d399" : sig.result === "loss" ? "#f87171" : "#555", fontSize: 13 }}>
                      {sig.result === "win" ? "✓ WIN" : sig.result === "loss" ? "✗ LOSS" : "⏳ En cours"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, background: "#0f0f1a", borderRadius: 4, height: 4 }}>
                    <div style={{ width: `${(sig.confidence || 0) * 100}%`, height: "100%", background: "#7c3aed", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Confiance : {Math.round((sig.confidence || 0) * 100)}%</div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", color: "#555", fontSize: 13, marginTop: 16 }}>
              <span style={{ cursor: "pointer", color: "#7c3aed" }} onClick={() => { setMode("register"); setShowAuth(true); }}>
                Créer un compte gratuit pour voir tous les signaux →
              </span>
            </p>
          </section>
        )}

        {/* Features */}
        <section style={s.features}>
          <h2 style={s.sectionTitle}>Pourquoi CryptoSignal Pro ?</h2>
          <div style={s.featureGrid}>
            {[
              { icon: "📊", title: "Win rate transparent", desc: "Chaque signal est évalué automatiquement 15 minutes après sa génération. Aucune manipulation, tout est visible." },
              { icon: "⚡", title: "Temps réel", desc: "Signaux générés toutes les minutes sur 4 paires majeures. Alertes Telegram instantanées pour les abonnés Pro." },
              { icon: "🤖", title: "4 indicateurs", desc: "RSI, EMA 9/21, MACD et Momentum combinés pour filtrer les signaux les plus fiables." },
              { icon: "🔒", title: "Sans risque", desc: "Plan gratuit disponible. Pas de carte bancaire requise. Paiement uniquement en crypto (USDT)." },
            ].map((f) => (
              <div key={f.title} style={s.featureCard}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{f.title}</h3>
                <p style={{ color: "#9ca3af", fontSize: 14, margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={s.cta}>
          <h2 style={{ fontSize: 32, fontWeight: "bold", margin: "0 0 12px" }}>Prêt à commencer ?</h2>
          <p style={{ color: "#9ca3af", margin: "0 0 28px" }}>Gratuit, sans carte bancaire.</p>
          <button style={{ ...s.btnPrimary, padding: "16px 40px", fontSize: 16 }} onClick={() => { setMode("register"); setShowAuth(true); }}>
            Créer un compte gratuit
          </button>
        </section>

        {/* Footer */}
        <footer style={s.footer}>
          <p>LaLa © 2026</p>
          <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 8 }}>
            <span style={{ cursor: "pointer", color: "#555" }} onClick={() => router.push("/pricing")}>Tarifs</span>
            <span style={{ cursor: "pointer", color: "#555" }} onClick={() => { setMode("login"); setShowAuth(true); }}>Connexion</span>
          </div>
        </footer>

        {/* Modal Auth */}
        {showAuth && (
          <div style={s.overlay} onClick={() => setShowAuth(false)}>
            <div style={s.authBox} onClick={(e) => e.stopPropagation()}>
              <button style={s.closeBtn} onClick={() => setShowAuth(false)}>✕</button>
              <div style={s.authLogo}>📈</div>
              <h2 style={s.authTitle}>CryptoSignal Pro</h2>
              <div style={s.tabs}>
                <button style={mode === "login" ? s.tabActive : s.tab} onClick={() => setMode("login")}>Connexion</button>
                <button style={mode === "register" ? s.tabActive : s.tab} onClick={() => setMode("register")}>Inscription</button>
              </div>
              <form onSubmit={handleSubmit} style={s.form}>
                <input style={s.input} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <input style={s.input} type="password" placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                {error && <p style={s.error}>{error}</p>}
                <button style={s.button} type="submit" disabled={loading}>
                  {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer un compte"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", fontFamily: "system-ui", color: "#fff" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid #1f1f35" },
  logo: { fontSize: 20, fontWeight: "bold" },
  btnPrimary: { padding: "10px 20px", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 14 },
  btnOutline: { padding: "10px 20px", background: "none", border: "1px solid #333", borderRadius: 8, color: "#e5e7eb", cursor: "pointer", fontSize: 14 },
  hero: { textAlign: "center", padding: "80px 40px 60px" },
  heroBadge: { display: "inline-block", background: "#1f1535", color: "#a78bfa", padding: "6px 16px", borderRadius: 20, fontSize: 13, marginBottom: 24, border: "1px solid #7c3aed44" },
  heroTitle: { fontSize: 52, fontWeight: "bold", margin: "0 0 20px", lineHeight: 1.15 },
  heroSub: { fontSize: 18, color: "#9ca3af", maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.7 },
  statsSection: { display: "flex", justifyContent: "center", gap: 20, padding: "0 40px 60px", flexWrap: "wrap" },
  statBox: { background: "#1a1a2e", borderRadius: 12, padding: "24px 36px", textAlign: "center", border: "1px solid #2d2d4e" },
  statVal: { fontSize: 32, fontWeight: "bold", marginBottom: 4 },
  statLbl: { fontSize: 13, color: "#666" },
  signalsSection: { maxWidth: 700, margin: "0 auto 60px", padding: "0 40px" },
  signalsList: { display: "flex", flexDirection: "column", gap: 10 },
  signalCard: { background: "#1a1a2e", borderRadius: 10, padding: 16, border: "1px solid #2d2d4e" },
  sectionTitle: { textAlign: "center", fontSize: 28, fontWeight: "bold", margin: "0 0 32px" },
  features: { padding: "0 40px 80px", maxWidth: 1000, margin: "0 auto" },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 },
  featureCard: { background: "#1a1a2e", borderRadius: 12, padding: 24, border: "1px solid #2d2d4e" },
  cta: { textAlign: "center", padding: "60px 40px", background: "#1a1a2e", borderTop: "1px solid #2d2d4e", borderBottom: "1px solid #2d2d4e" },
  footer: { textAlign: "center", padding: "32px 40px", color: "#555", fontSize: 13 },
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  authBox: { background: "#1a1a2e", borderRadius: 16, padding: 40, width: 380, position: "relative", border: "1px solid #2d2d4e" },
  closeBtn: { position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#666", fontSize: 18, cursor: "pointer" },
  authLogo: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  authTitle: { textAlign: "center", margin: "0 0 20px", fontSize: 20 },
  tabs: { display: "flex", marginBottom: 20, background: "#0f0f1a", borderRadius: 8, padding: 4 },
  tab: { flex: 1, padding: "8px 0", background: "none", border: "none", color: "#666", cursor: "pointer", borderRadius: 6, fontSize: 14 },
  tabActive: { flex: 1, padding: "8px 0", background: "#7c3aed", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 14 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: { padding: "12px 16px", background: "#0f0f1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" },
  button: { padding: "13px 0", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer" },
  error: { color: "#f87171", fontSize: 13, margin: 0, textAlign: "center" },
};
