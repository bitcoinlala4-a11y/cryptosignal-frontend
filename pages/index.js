import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function Home() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) return setError(data.error);
    localStorage.setItem("token", data.token);
    router.push("/dashboard");
  }

  return (
    <>
      <Head><title>PancakeBot Pro</title></Head>
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logo}>🥞</div>
          <h1 style={s.title}>PancakeBot Pro</h1>
          <p style={s.subtitle}>Bot de trading automatique PancakeSwap</p>
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
    </>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" },
  card: { background: "#1a1a2e", borderRadius: 16, padding: 40, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  logo: { fontSize: 48, textAlign: "center", marginBottom: 8 },
  title: { color: "#fff", textAlign: "center", margin: "0 0 4px", fontSize: 24 },
  subtitle: { color: "#666", textAlign: "center", margin: "0 0 24px", fontSize: 13 },
  tabs: { display: "flex", marginBottom: 24, background: "#0f0f1a", borderRadius: 8, padding: 4 },
  tab: { flex: 1, padding: "8px 0", background: "none", border: "none", color: "#666", cursor: "pointer", borderRadius: 6, fontSize: 14 },
  tabActive: { flex: 1, padding: "8px 0", background: "#7c3aed", border: "none", color: "#fff", cursor: "pointer", borderRadius: 6, fontSize: 14 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: { padding: "12px 16px", background: "#0f0f1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" },
  button: { padding: "13px 0", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer", marginTop: 4 },
  error: { color: "#f87171", fontSize: 13, margin: 0, textAlign: "center" },
};
