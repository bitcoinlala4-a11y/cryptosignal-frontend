import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = useState("email"); // email | code | done
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`${API}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) return setError(data.error);
    setStep("code");
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`${API}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) return setError(data.error);
    setStep("done");
  }

  return (
    <>
      <Head><title>Mot de passe oublié — CryptoSignal Pro</title></Head>
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.icon}>🔑</div>
          <h1 style={s.title}>
            {step === "done" ? "Mot de passe réinitialisé !" : "Mot de passe oublié"}
          </h1>

          {step === "email" && (
            <>
              <p style={s.sub}>Entrez votre email pour recevoir un code de réinitialisation.</p>
              <form onSubmit={handleSend} style={s.form}>
                <input style={s.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                {error && <p style={s.error}>{error}</p>}
                <button style={s.button} type="submit" disabled={loading}>
                  {loading ? "Envoi..." : "Envoyer le code"}
                </button>
              </form>
            </>
          )}

          {step === "code" && (
            <>
              <p style={s.sub}>Code envoyé à <strong style={{ color: "#a78bfa" }}>{email}</strong><br />Entrez le code et votre nouveau mot de passe.</p>
              <form onSubmit={handleReset} style={s.form}>
                <input style={{ ...s.input, textAlign: "center", letterSpacing: 8, fontSize: 22 }} type="text" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
                <input style={s.input} type="password" placeholder="Nouveau mot de passe" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                {error && <p style={s.error}>{error}</p>}
                <button style={s.button} type="submit" disabled={loading || code.length !== 6}>
                  {loading ? "Réinitialisation..." : "Réinitialiser"}
                </button>
              </form>
            </>
          )}

          {step === "done" && (
            <>
              <p style={s.sub}>Votre mot de passe a été mis à jour avec succès.</p>
              <button style={s.button} onClick={() => router.push("/")}>Se connecter</button>
            </>
          )}

          <p style={s.back} onClick={() => router.push("/")}>← Retour</p>
        </div>
      </div>
    </>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" },
  card: { background: "#1a1a2e", borderRadius: 16, padding: 40, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", textAlign: "center" },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { color: "#fff", margin: "0 0 8px", fontSize: 22 },
  sub: { color: "#9ca3af", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: { padding: "12px 16px", background: "#0f0f1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" },
  button: { padding: "13px 0", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer" },
  error: { color: "#f87171", fontSize: 13, margin: 0 },
  back: { marginTop: 16, color: "#4b5563", fontSize: 13, cursor: "pointer" },
};
