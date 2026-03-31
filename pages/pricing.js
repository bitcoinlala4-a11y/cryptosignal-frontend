import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    color: "#6b7280",
    features: [
      "5 signaux par jour",
      "BTC & ETH uniquement",
      "Win rate global",
      "Dashboard basique",
    ],
    missing: ["Signaux illimités", "Toutes les paires", "Alertes Telegram", "Stats détaillées par signal", "Support prioritaire"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    color: "#7c3aed",
    badge: "Populaire",
    features: [
      "Signaux illimités",
      "BTC, ETH, BNB, SOL",
      "Alertes Telegram instantanées",
      "Win rate détaillé par signal",
      "Historique 30 jours",
      "Dashboard complet",
    ],
    missing: ["Support prioritaire", "Backtesting custom"],
  },
  {
    id: "elite",
    name: "Elite",
    price: 79,
    color: "#f59e0b",
    badge: "Meilleur",
    features: [
      "Tout le plan Pro",
      "Backtesting sur 90 jours",
      "Signaux custom configurables",
      "Support prioritaire 24/7",
      "Accès API",
      "Rapport hebdomadaire par email",
    ],
    missing: [],
  },
];

export default function Pricing() {
  const router = useRouter();
  const [loading, setLoading] = useState(null);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [token, setToken] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem("token");
    setToken(t);
    if (t) {
      fetch(`${API}/api/billing/plan`, { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json())
        .then(d => { if (d.plan) setCurrentPlan(d.plan); })
        .catch(() => {});
    }
    if (router.query.upgrade === "success") {
      alert("Abonnement activé ! Merci et bienvenue.");
    }
  }, [router.query]);

  async function handleSubscribe(planId) {
    if (planId === "free") return;
    if (!token) { router.push("/"); return; }
    if (currentPlan === planId) return;

    setLoading(planId);
    try {
      const res = await fetch(`${API}/api/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Erreur lors du paiement");
    } catch {
      alert("Erreur de connexion");
    }
    setLoading(null);
  }

  async function handlePortal() {
    if (!token) return;
    const res = await fetch(`${API}/api/billing/portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  return (
    <>
      <Head><title>Tarifs — CryptoSignal Pro</title></Head>
      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.logo} onClick={() => router.push("/dashboard")} >📈 CryptoSignal Pro</span>
          <div style={{ display: "flex", gap: 12 }}>
            {token ? (
              <>
                {currentPlan !== "free" && (
                  <button style={s.btnOutline} onClick={handlePortal}>Gérer mon abonnement</button>
                )}
                <button style={s.btnPrimary} onClick={() => router.push("/dashboard")}>Dashboard</button>
              </>
            ) : (
              <button style={s.btnPrimary} onClick={() => router.push("/")}>Connexion</button>
            )}
          </div>
        </div>

        {/* Hero */}
        <div style={s.hero}>
          <div style={s.heroBadge}>Win rate prouvé en temps réel</div>
          <h1 style={s.heroTitle}>Des signaux crypto <span style={{ color: "#7c3aed" }}>qui fonctionnent</span></h1>
          <p style={s.heroSub}>RSI, EMA, MACD, Momentum sur BTC, ETH, BNB et SOL — évalués automatiquement toutes les 15 minutes.</p>
        </div>

        {/* Stats live */}
        <div style={s.statsRow}>
          {[
            { label: "Signaux générés", value: "24/7" },
            { label: "Paires suivies", value: "4" },
            { label: "Types de signaux", value: "4" },
            { label: "Évaluation", value: "15 min" },
          ].map((stat) => (
            <div key={stat.label} style={s.statBox}>
              <div style={s.statVal}>{stat.value}</div>
              <div style={s.statLbl}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div style={s.plans}>
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isLoading = loading === plan.id;
            return (
              <div key={plan.id} style={{ ...s.card, borderColor: isCurrent ? plan.color : plan.badge ? plan.color + "44" : "#2d2d4e", borderWidth: isCurrent || plan.badge ? 2 : 1 }}>
                {plan.badge && <div style={{ ...s.badge, background: plan.color }}>{plan.badge}</div>}
                {isCurrent && <div style={{ ...s.badge, background: "#065f46", color: "#34d399" }}>Plan actuel</div>}

                <div style={{ ...s.planName, color: plan.color }}>{plan.name}</div>
                <div style={s.planPrice}>
                  {plan.price === 0 ? <span style={s.priceNum}>Gratuit</span> : (
                    <><span style={s.priceNum}>${plan.price}</span><span style={s.pricePer}>/mois</span></>
                  )}
                </div>

                <div style={s.featureList}>
                  {plan.features.map((f) => (
                    <div key={f} style={s.featureRow}>
                      <span style={{ color: "#34d399", marginRight: 8 }}>✓</span>
                      <span style={{ color: "#e5e7eb" }}>{f}</span>
                    </div>
                  ))}
                  {plan.missing.map((f) => (
                    <div key={f} style={s.featureRow}>
                      <span style={{ color: "#374151", marginRight: 8 }}>✗</span>
                      <span style={{ color: "#4b5563" }}>{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  style={{ ...s.planBtn, background: isCurrent ? "#1f2937" : plan.color, cursor: isCurrent ? "default" : "pointer" }}
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrent || isLoading || plan.id === "free"}
                >
                  {isLoading ? "Chargement..." : isCurrent ? "Plan actuel" : plan.id === "free" ? "Gratuit" : `Choisir ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div style={s.faq}>
          <h2 style={s.faqTitle}>Questions fréquentes</h2>
          {[
            { q: "Comment les signaux sont-ils générés ?", r: "Notre moteur analyse en temps réel 4 indicateurs techniques (RSI, EMA, MACD, Momentum) sur les données Binance toutes les minutes." },
            { q: "Comment le win rate est-il calculé ?", r: "Chaque signal est évalué automatiquement 15 minutes après sa génération. Si le prix a bougé dans la bonne direction, c'est un WIN. Tout est transparent et vérifiable." },
            { q: "Puis-je annuler à tout moment ?", r: "Oui, sans engagement. Vous gérez votre abonnement directement depuis votre espace client Stripe." },
            { q: "Les signaux garantissent-ils des profits ?", r: "Non. Les signaux sont des outils d'aide à la décision basés sur l'analyse technique. Le trading comporte des risques et les performances passées ne garantissent pas les résultats futurs." },
          ].map((item) => (
            <div key={item.q} style={s.faqItem}>
              <div style={s.faqQ}>{item.q}</div>
              <div style={s.faqA}>{item.r}</div>
            </div>
          ))}
        </div>

        <div style={s.footer}>
          <p style={{ color: "#555", fontSize: 13 }}>© 2026 CryptoSignal Pro — Le trading comporte des risques. Investissez uniquement ce que vous pouvez vous permettre de perdre.</p>
        </div>
      </div>
    </>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", fontFamily: "system-ui", color: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid #1f1f35" },
  logo: { fontSize: 20, fontWeight: "bold", cursor: "pointer" },
  btnPrimary: { padding: "9px 20px", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 14 },
  btnOutline: { padding: "9px 20px", background: "none", border: "1px solid #333", borderRadius: 8, color: "#999", cursor: "pointer", fontSize: 14 },
  hero: { textAlign: "center", padding: "80px 40px 40px" },
  heroBadge: { display: "inline-block", background: "#1f1535", color: "#a78bfa", padding: "6px 16px", borderRadius: 20, fontSize: 13, marginBottom: 20, border: "1px solid #7c3aed44" },
  heroTitle: { fontSize: 48, fontWeight: "bold", margin: "0 0 16px", lineHeight: 1.2 },
  heroSub: { fontSize: 18, color: "#9ca3af", maxWidth: 600, margin: "0 auto" },
  statsRow: { display: "flex", justifyContent: "center", gap: 24, padding: "0 40px 60px", flexWrap: "wrap" },
  statBox: { background: "#1a1a2e", borderRadius: 12, padding: "20px 32px", textAlign: "center", border: "1px solid #2d2d4e" },
  statVal: { fontSize: 28, fontWeight: "bold", color: "#a78bfa" },
  statLbl: { fontSize: 12, color: "#666", marginTop: 4 },
  plans: { display: "flex", justifyContent: "center", gap: 24, padding: "0 40px 80px", flexWrap: "wrap", alignItems: "flex-start" },
  card: { background: "#1a1a2e", borderRadius: 16, padding: 32, width: 300, border: "1px solid #2d2d4e", position: "relative" },
  badge: { position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", padding: "4px 16px", borderRadius: 20, fontSize: 12, fontWeight: "bold", color: "#fff", whiteSpace: "nowrap" },
  planName: { fontSize: 22, fontWeight: "bold", marginBottom: 8, marginTop: 8 },
  planPrice: { marginBottom: 24 },
  priceNum: { fontSize: 36, fontWeight: "bold", color: "#fff" },
  pricePer: { fontSize: 14, color: "#666", marginLeft: 4 },
  featureList: { marginBottom: 28 },
  featureRow: { display: "flex", alignItems: "flex-start", marginBottom: 10, fontSize: 14 },
  planBtn: { width: "100%", padding: "13px 0", border: "none", borderRadius: 10, color: "#fff", fontWeight: "bold", fontSize: 15 },
  faq: { maxWidth: 700, margin: "0 auto", padding: "0 40px 80px" },
  faqTitle: { fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: 40 },
  faqItem: { borderBottom: "1px solid #1f1f35", paddingBottom: 24, marginBottom: 24 },
  faqQ: { fontSize: 16, fontWeight: "bold", marginBottom: 10, color: "#e5e7eb" },
  faqA: { fontSize: 14, color: "#9ca3af", lineHeight: 1.6 },
  footer: { textAlign: "center", padding: "0 40px 40px" },
};
