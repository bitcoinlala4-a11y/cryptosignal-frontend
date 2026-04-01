import { useState, useEffect } from "react";
import Head from "next/head";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [planForm, setPlanForm] = useState({ plan: "pro", months: 1 });

  async function login() {
    const res = await fetch(`${API}/api/admin/stats`, { headers: { "x-admin-secret": secret } });
    if (res.status === 403) return setError("Secret incorrect");
    const d = await res.json();
    setStats(d);
    setAuthed(true);
    loadUsers();
  }

  async function loadUsers() {
    const res = await fetch(`${API}/api/admin/users`, { headers: { "x-admin-secret": secret } });
    const d = await res.json();
    if (d.users) setUsers(d.users);
  }

  async function updatePlan() {
    await fetch(`${API}/api/admin/users/${editUser.id}/plan`, {
      method: "PUT",
      headers: { "x-admin-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(planForm),
    });
    setEditUser(null);
    loadUsers();
  }

  async function deleteUser(id) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    await fetch(`${API}/api/admin/users/${id}`, { method: "DELETE", headers: { "x-admin-secret": secret } });
    setUsers(u => u.filter(x => x.id !== id));
  }

  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()));

  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#070711", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <Head><title>Admin — CryptoSignal Pro</title></Head>
      <div style={{ background: "#0f0f1e", border: "1px solid #1f1f35", borderRadius: 16, padding: 40, width: 320 }}>
        <div style={{ fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 4 }}>📈 Admin</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>CryptoSignal Pro</div>
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)} onKeyDown={e => e.key === "Enter" && login()}
          placeholder="Secret admin" style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "10px 12px", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
        {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <button onClick={login} style={{ width: "100%", padding: "10px 0", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: 14 }}>
          Connexion
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#070711", fontFamily: "system-ui", color: "#e5e7eb" }}>
      <Head><title>Admin — CryptoSignal Pro</title></Head>
      <div style={{ background: "#0a0a1a", borderBottom: "1px solid #1f1f35", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: "bold", fontSize: 16 }}>📈 Admin Panel</span>
        <button onClick={() => setAuthed(false)} style={{ background: "none", border: "1px solid #1f1f35", borderRadius: 6, color: "#555", cursor: "pointer", padding: "6px 12px", fontSize: 12 }}>Déconnexion</button>
      </div>

      <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Stats globales */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Utilisateurs", value: stats.totalUsers, color: "#a78bfa" },
              { label: "Pro", value: stats.proUsers, color: "#7c3aed" },
              { label: "Elite", value: stats.eliteUsers, color: "#f59e0b" },
              { label: "Signaux", value: stats.totalSignals, color: "#34d399" },
              { label: "Trades", value: stats.totalTrades, color: "#60a5fa" },
            ].map(item => (
              <div key={item.label} style={{ background: "#0f0f1e", borderRadius: 10, padding: "14px 18px", border: "1px solid #1f1f35" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 28, fontWeight: "bold", color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Recherche */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par email..."
          style={{ background: "#0f0f1e", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "8px 12px", fontSize: 13, width: "100%", maxWidth: 400, marginBottom: 16, boxSizing: "border-box" }} />

        {/* Table */}
        <div style={{ background: "#0f0f1e", borderRadius: 10, border: "1px solid #1f1f35", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1f1f35" }}>
                {["ID", "Email", "Plan", "Expiration", "Telegram", "Filleuls", "Trades", "Inscrit le", "Actions"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#444", fontWeight: "normal", fontSize: 11, letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} style={{ borderBottom: "1px solid #111128" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#111128"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 14px", color: "#555" }}>{u.id}</td>
                  <td style={{ padding: "10px 14px", color: "#e5e7eb" }}>{u.email}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: "bold", background: u.plan === "elite" ? "#1a1200" : u.plan === "pro" ? "#1f1535" : "#1a1a2e", color: u.plan === "elite" ? "#f59e0b" : u.plan === "pro" ? "#a78bfa" : "#555" }}>
                      {u.plan?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#555", fontSize: 11 }}>
                    {u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", color: u.telegram_chat_id ? "#34d399" : "#333", fontSize: 11 }}>
                    {u.telegram_chat_id ? "✓" : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#9ca3af" }}>{u.referral_count || 0}</td>
                  <td style={{ padding: "10px 14px", color: "#9ca3af" }}>{u.trade_count || 0}</td>
                  <td style={{ padding: "10px 14px", color: "#555", fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString("fr-FR")}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditUser(u); setPlanForm({ plan: u.plan, months: 1 }); }}
                        style={{ padding: "4px 10px", background: "#7c3aed", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11 }}>
                        Plan
                      </button>
                      <button onClick={() => deleteUser(u.id)}
                        style={{ padding: "4px 10px", background: "none", border: "1px solid #f87171", borderRadius: 4, color: "#f87171", cursor: "pointer", fontSize: 11 }}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Aucun utilisateur trouvé</div>}
        </div>
      </div>

      {/* Modal edit plan */}
      {editUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#0f0f1e", border: "1px solid #1f1f35", borderRadius: 12, padding: 28, width: 320 }}>
            <div style={{ fontWeight: "bold", marginBottom: 16, color: "#fff" }}>Modifier le plan de {editUser.email}</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Plan</div>
              <select value={planForm.plan} onChange={e => setPlanForm(p => ({ ...p, plan: e.target.value }))}
                style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "8px 10px", fontSize: 13 }}>
                {["free", "pro", "elite"].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Durée (mois)</div>
              <input type="number" value={planForm.months} onChange={e => setPlanForm(p => ({ ...p, months: parseInt(e.target.value) || 1 })} min={1} max={24}
                style={{ width: "100%", background: "#111128", border: "1px solid #1f1f35", borderRadius: 6, color: "#fff", padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={updatePlan} style={{ flex: 1, padding: "9px 0", background: "#7c3aed", border: "none", borderRadius: 6, color: "#fff", fontWeight: "bold", cursor: "pointer" }}>Appliquer</button>
              <button onClick={() => setEditUser(null)} style={{ flex: 1, padding: "9px 0", background: "none", border: "1px solid #1f1f35", borderRadius: 6, color: "#555", cursor: "pointer" }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
