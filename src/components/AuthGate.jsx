import { useState, useEffect } from "react";

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCK_SECS = 30;
const SALT = "cardiq-v1-2026";

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + SALT);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── NUMPAD ──────────────────────────────────────────────────────────────────
const KEYS = [
  ["1","2","3"],
  ["4","5","6"],
  ["7","8","9"],
  [null,"0","del"],
];

function Numpad({ onDigit, onDelete, disabled }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, width: 264 }}>
      {KEYS.flat().map((k, i) => {
        if (k === null) return <div key={i} />;
        const isDel = k === "del";
        return (
          <button
            key={i}
            onClick={() => isDel ? onDelete() : onDigit(k)}
            disabled={disabled}
            style={{
              height: 72, borderRadius: 18,
              background: isDel ? "transparent" : "#1c1c1e",
              border: isDel ? "none" : "1px solid #2a2a2a",
              color: "#fff", fontSize: isDel ? 22 : 28,
              fontWeight: 400, cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.4 : 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              transition: "background 0.1s",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseDown={e => e.currentTarget.style.background = isDel ? "rgba(255,255,255,0.05)" : "#2c2c2e"}
            onMouseUp={e => e.currentTarget.style.background = isDel ? "transparent" : "#1c1c1e"}
            onMouseLeave={e => e.currentTarget.style.background = isDel ? "transparent" : "#1c1c1e"}
          >
            {isDel ? "⌫" : k}
          </button>
        );
      })}
    </div>
  );
}

// ─── DOT INDICATORS ──────────────────────────────────────────────────────────
function PinDots({ filled, total = PIN_LENGTH, accent = "#4286f4", error }) {
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: "50%",
          background: i < filled ? (error ? "#e94560" : accent) : "transparent",
          border: `2px solid ${i < filled ? (error ? "#e94560" : accent) : "#444"}`,
          transition: "background 0.15s, border-color 0.15s",
        }} />
      ))}
    </div>
  );
}

// ─── AUTH GATE ───────────────────────────────────────────────────────────────
export default function AuthGate({ children }) {
  const [mode, setMode]         = useState(null); // 'setup' | 'confirm' | 'login'
  const [pin, setPin]           = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [error, setError]       = useState("");
  const [shake, setShake]       = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(null);
  const [lockSecs, setLockSecs] = useState(0);
  const [authed, setAuthed]     = useState(false);

  // Check session / whether PIN is already set
  useEffect(() => {
    if (sessionStorage.getItem("cardiq-session") === "1") { setAuthed(true); return; }
    const stored = localStorage.getItem("cardiq-pin");
    setMode(stored ? "login" : "setup");
  }, []);

  // Lockout countdown
  useEffect(() => {
    if (!lockUntil) return;
    const id = setInterval(() => {
      const rem = Math.ceil((lockUntil - Date.now()) / 1000);
      if (rem <= 0) { setLockUntil(null); setLockSecs(0); setAttempts(0); }
      else setLockSecs(rem);
    }, 500);
    return () => clearInterval(id);
  }, [lockUntil]);

  const triggerShake = (msg) => {
    setError(msg);
    setHasError(true);
    setShake(true);
    setPin("");
    setTimeout(() => { setShake(false); }, 550);
    setTimeout(() => setHasError(false), 1200);
  };

  const authenticate = () => {
    sessionStorage.setItem("cardiq-session", "1");
    setAuthed(true);
  };

  const handleDigit = (d) => {
    if (lockUntil || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (error) setError("");
    if (next.length === PIN_LENGTH) handleComplete(next);
  };

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    if (error) setError("");
  };

  const handleComplete = async (entered) => {
    if (mode === "setup") {
      setSetupPin(entered);
      setPin("");
      setMode("confirm");
      return;
    }

    if (mode === "confirm") {
      if (entered === setupPin) {
        const hash = await hashPin(entered);
        localStorage.setItem("cardiq-pin", hash);
        authenticate();
      } else {
        triggerShake("PINs don't match — try again");
        setMode("setup");
        setSetupPin("");
      }
      return;
    }

    // login
    const stored = localStorage.getItem("cardiq-pin");
    const hash = await hashPin(entered);
    if (hash === stored) {
      authenticate();
    } else {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCK_SECS * 1000;
        setLockUntil(until);
        setLockSecs(LOCK_SECS);
        triggerShake(`Too many attempts — locked for ${LOCK_SECS}s`);
      } else {
        triggerShake(`Incorrect PIN · ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? "" : "s"} left`);
      }
    }
  };

  const handleForgot = () => {
    if (!window.confirm("Reset CardIQ? This will erase all your cards and data.")) return;
    localStorage.clear();
    sessionStorage.clear();
    setMode("setup");
    setPin(""); setSetupPin("");
    setAttempts(0); setLockUntil(null);
    setError(""); setHasError(false);
  };

  if (authed) return children;
  if (mode === null) return null;

  const isLocked = !!lockUntil;
  const titles = { setup: "Create PIN", confirm: "Confirm PIN", login: "Welcome back" };
  const subs   = { setup: "Set a 6-digit PIN to secure your cards", confirm: "Re-enter your PIN to confirm", login: "Enter your PIN to continue" };

  return (
    <div style={{
      width: "100%", maxWidth: 390, height: "100dvh", maxHeight: 844,
      background: "#0a0a0a", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "space-between",
      padding: "60px 24px 40px", position: "relative", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(66,134,244,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Top section */}
      <div style={{ textAlign: "center" }}>
        {/* App icon */}
        <div style={{
          width: 72, height: 72, borderRadius: 20, margin: "0 auto 20px",
          background: "linear-gradient(135deg, #1a1a2e, #16213e)",
          border: "1px solid #2a2a2a",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, boxShadow: "0 8px 32px rgba(66,134,244,0.2)",
        }}>💳</div>

        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 8, letterSpacing: -0.5 }}>
          CardIQ
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
          {titles[mode]}
        </div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 36 }}>
          {isLocked ? `Locked · try again in ${lockSecs}s` : subs[mode]}
        </div>

        {/* Dots */}
        <div style={{
          animation: shake ? "pinShake 0.5s ease" : "none",
          marginBottom: 16,
        }}>
          <PinDots filled={pin.length} error={hasError} />
        </div>

        {/* Error message */}
        <div style={{
          height: 18, fontSize: 13, color: "#e94560", fontWeight: 500,
          transition: "opacity 0.2s", opacity: error ? 1 : 0,
        }}>
          {error}
        </div>
      </div>

      {/* Numpad */}
      <Numpad onDigit={handleDigit} onDelete={handleDelete} disabled={isLocked} />

      {/* Bottom */}
      <div style={{ textAlign: "center" }}>
        {mode === "login" && (
          <button onClick={handleForgot} style={{
            background: "none", border: "none", color: "#444",
            fontSize: 13, cursor: "pointer", padding: "8px 16px",
          }}>
            Forgot PIN?
          </button>
        )}
        {mode === "setup" && (
          <div style={{ fontSize: 12, color: "#333", marginTop: 8 }}>
            Your PIN is stored securely on this device
          </div>
        )}
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-10px); }
          30%      { transform: translateX(10px); }
          45%      { transform: translateX(-8px); }
          60%      { transform: translateX(8px); }
          75%      { transform: translateX(-4px); }
          90%      { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
