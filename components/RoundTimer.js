import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function RoundTimer({ market = "BNB" }) {
  const [round, setRound] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [phase, setPhase] = useState("betting"); // betting | locked
  const timerRef = useRef(null);

  useEffect(() => {
    loadRound();
    const interval = setInterval(loadRound, 15000); // refresh toutes les 15s
    return () => { clearInterval(interval); clearInterval(timerRef.current); };
  }, [market]);

  async function loadRound() {
    try {
      const res = await fetch(`${API}/api/round/${market}`);
      const data = await res.json();
      if (data.error) return;
      setRound(data);
      startCountdown(data);
    } catch {}
  }

  function startCountdown(data) {
    clearInterval(timerRef.current);

    // Initialiser immédiatement sans attendre 1 seconde
    const now = Math.floor(Date.now() / 1000);
    const toLockInit = data.lockTimestamp - now;
    const toCloseInit = data.closeTimestamp - now;
    if (toLockInit > 0) { setPhase("betting"); setSecondsLeft(toLockInit); }
    else if (toCloseInit > 0) { setPhase("locked"); setSecondsLeft(toCloseInit); }

    timerRef.current = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const toLock = data.lockTimestamp - now;
      const toClose = data.closeTimestamp - now;

      if (toLock > 0) {
        setPhase("betting");
        setSecondsLeft(toLock);
      } else if (toClose > 0) {
        setPhase("locked");
        setSecondsLeft(toClose);
      } else {
        clearInterval(timerRef.current); // stopper l'interval avant de recharger
        setSecondsLeft(0);
        loadRound();
      }
    }, 1000);
  }

  if (!round) return null;

  const mins = Math.floor((secondsLeft || 0) / 60);
  const secs = ((secondsLeft || 0) % 60).toString().padStart(2, "0");
  const total = round.closeTimestamp - round.lockTimestamp + (round.lockTimestamp - (round.lockTimestamp - 300));
  const elapsed = total - (secondsLeft || 0);
  const progress = Math.min((elapsed / total) * 100, 100);

  const bullPct = round.totalAmount > 0 ? ((round.bullAmount / round.totalAmount) * 100).toFixed(1) : "50.0";
  const bearPct = round.totalAmount > 0 ? ((round.bearAmount / round.totalAmount) * 100).toFixed(1) : "50.0";
  const bullWins = round.totalAmount > 0 && round.bullAmount > 0 ? (round.totalAmount / round.bullAmount * 0.97).toFixed(2) : "—";
  const bearWins = round.totalAmount > 0 && round.bearAmount > 0 ? (round.totalAmount / round.bearAmount * 0.97).toFixed(2) : "—";

  const phaseBg = phase === "betting" ? "#7c3aed22" : "#f59e0b22";
  const phaseStyle = { ...s.phase, background: phaseBg, color: "#a78bfa", border: "1px solid #7c3aed44" };

  return (
    <div style={s.container}>
      {/* Epoch + phase */}
      <div style={s.top}>
        <div style={s.epoch}>Round #{round.epoch}</div>
        <div style={phaseStyle}>
          {phase === "betting" ? "Paris ouverts" : "Locked"}
        </div>
        <div style={s.epoch}>Round #{round.epoch + 1} ›</div>
      </div>

      {/* Timer */}
      <div style={s.timerBox}>
        <div style={s.timerLabel}>{phase === "betting" ? "Fermeture dans" : "Résultat dans"}</div>
        <div style={s.timerValue}>{mins}:{secs}</div>

        {/* Barre de progression */}
        <div style={s.progressBg}>
          <div style={{ ...s.progressFill, width: `${progress}%`, background: phase === "betting" ? "#7c3aed" : "#f59e0b" }} />
        </div>
      </div>

      {/* Multiplicateurs + Lock price */}
      <div style={s.multiRow}>
        <div style={s.multiBull}>
          <div style={s.multiLabel}>▲ BULL</div>
          <div style={s.multiValue}>x{bullWins}</div>
          <div style={s.multiPct}>{bullPct}%</div>
          <div style={s.multiAmount}>{round.bullAmount.toFixed(3)} BNB</div>
        </div>

        <div style={s.multiCenter}>
          {round.lockPrice ? (
            <>
              <div style={s.lockLabel}>Prix bloqué</div>
              <div style={s.lockPrice}>${round.lockPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </>
          ) : (
            <>
              <div style={s.lockLabel}>Pool total</div>
              <div style={s.lockPrice}>{round.totalAmount.toFixed(3)}</div>
              <div style={{ color: "#555", fontSize: 10 }}>BNB</div>
            </>
          )}
        </div>

        <div style={s.multiBear}>
          <div style={s.multiLabel}>▼ BEAR</div>
          <div style={{ ...s.multiValue, color: "#f87171" }}>x{bearWins}</div>
          <div style={s.multiPct}>{bearPct}%</div>
          <div style={s.multiAmount}>{round.bearAmount.toFixed(3)} BNB</div>
        </div>
      </div>

      {/* Barre bull/bear */}
      <div style={s.splitBar}>
        <div style={{ height: "100%", width: `${bullPct}%`, background: "#34d399", borderRadius: "4px 0 0 4px", transition: "width 0.5s" }} />
        <div style={{ height: "100%", width: `${bearPct}%`, background: "#f87171", borderRadius: "0 4px 4px 0", transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

const s = {
  container: { background: "#1a1a2e", borderRadius: 12, padding: 20, marginBottom: 16 },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  epoch: { color: "#555", fontSize: 13 },
  phase: { padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: "bold" },
  timerBox: { textAlign: "center", marginBottom: 20 },
  timerLabel: { color: "#666", fontSize: 12, marginBottom: 4 },
  timerValue: { fontSize: 42, fontWeight: "bold", color: "#fff", letterSpacing: 2, fontVariantNumeric: "tabular-nums" },
  progressBg: { height: 4, background: "#0f0f1a", borderRadius: 4, margin: "10px auto 0", maxWidth: 200 },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 1s linear" },
  pools: { display: "flex", flexDirection: "column", gap: 8 },
  splitBar: { display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 12 },
  multiRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 },
  multiBull: { flex: 1, background: "#0d2d1f", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1px solid #34d39933" },
  multiBear: { flex: 1, background: "#2d0d0d", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1px solid #f8717133" },
  multiCenter: { textAlign: "center", minWidth: 90 },
  multiLabel: { fontSize: 11, fontWeight: "bold", color: "#34d399", marginBottom: 2 },
  multiValue: { fontSize: 22, fontWeight: "bold", color: "#34d399", letterSpacing: 1 },
  multiPct: { fontSize: 11, color: "#666", marginTop: 2 },
  multiAmount: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  lockLabel: { fontSize: 10, color: "#666", marginBottom: 2 },
  lockPrice: { fontSize: 15, fontWeight: "bold", color: "#f59e0b" },
};
