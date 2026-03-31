import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function Verify() {
  const router = useRouter();
  const { email } = router.query;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`${API}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) return setError(data.error);
    localStorage.setItem("token", data.token);
    router.push("/pricing");
  }

  async function handleResend() {
    setResent(false);
    await fetch(`${API}/api/auth/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResent(true);
  }

  return (
    <>
      <Head><title>Vérification — CryptoSignal Pro</title></Head>
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.icon}>📧</div>
          <h1 style={s.title}>Vérifiez votre email</h1>
          <p style={s.sub}>Un code à 6 chiffres a été envoyé à<br /><strong style={{ color: "#a78bfa" }}>{email}</strong></p>
          <form onSubmit={handleVerify} style={s.form}>
            <input
              style={s.input}
              type="text"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
            {error && <p style={s.error}>{error}</p>}
            <button style={s.button} type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Vérification..." : "Confirmer"}
            </button>
          </form>
          <button style={s.resend} onClick={handleResend}>
            {resent ? "✓ Code renvoyé !" : "Renvoyer le code"}
          </button>
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
  sub: { color: "#9ca3af", fontSize: 14, margin: "0 0 28px", lineHeight: 1.6 },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: { padding: "16px", background: "#0f0f1a", border: "1px solid #7c3aed", borderRadius: 8, color: "#fff", fontSize: 28, textAlign: "center", letterSpacing: 12, outline: "none" },
  button: { padding: "13px 0", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer" },
  error: { color: "#f87171", fontSize: 13, margin: 0 },
  resend: { marginTop: 16, background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 },
  back: { marginTop: 12, color: "#4b5563", fontSize: 13, cursor: "pointer" },
};
