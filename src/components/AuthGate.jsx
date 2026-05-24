import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"

// ─── LOADING SCREEN ──────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={S.viewport}>
      <div style={{ textAlign: "center" }}>
        <div style={S.icon}>💳</div>
        <div style={S.appName}>CardIQ</div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 8 }}>Loading…</div>
      </div>
    </div>
  )
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
function Input({ label, type = "text", value, onChange, placeholder, autoFocus }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: "100%", padding: "14px 16px", borderRadius: 14,
          background: "#1c1c1e", border: "1px solid #2a2a2a",
          color: "#fff", fontSize: 16, outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  )
}

// ─── AUTH GATE ───────────────────────────────────────────────────────────────
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [mode, setMode]       = useState("signin") // signin | signup | reset
  const [email, setEmail]     = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const [info, setInfo]       = useState("")

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const clear = () => { setError(""); setInfo("") }

  const handleSignIn = async () => {
    if (!email || !password) return setError("Enter email and password")
    setLoading(true); clear()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  const handleSignUp = async () => {
    if (!email || !password) return setError("Enter email and password")
    if (password.length < 6) return setError("Password must be at least 6 characters")
    setLoading(true); clear()
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else setInfo("Check your email to confirm your account, then sign in.")
  }

  const handleReset = async () => {
    if (!email) return setError("Enter your email address")
    setLoading(true); clear()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setInfo("Password reset link sent — check your email.")
  }

  const handleSubmit = () => {
    if (mode === "signin") handleSignIn()
    else if (mode === "signup") handleSignUp()
    else handleReset()
  }

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSubmit() }

  if (session === undefined) return <Splash />
  if (session) return children

  const titles = { signin: "Welcome back", signup: "Create account", reset: "Reset password" }
  const subs   = { signin: "Sign in to access your cards", signup: "Your cards, saved to the cloud", reset: "We'll email you a reset link" }
  const btnLabel = { signin: "Sign In", signup: "Create Account", reset: "Send Reset Link" }

  return (
    <div style={S.viewport} onKeyDown={handleKeyDown}>
      <div style={S.screen}>
        {/* Glow */}
        <div style={S.glow} />

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={S.icon}>💳</div>
          <div style={S.appName}>CardIQ</div>
          <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginTop: 16 }}>{titles[mode]}</div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>{subs[mode]}</div>
        </div>

        {/* Form */}
        <div style={{ width: "100%" }}>
          <Input label="EMAIL" type="email" value={email} onChange={v => { setEmail(v); clear() }} placeholder="you@example.com" autoFocus />
          {mode !== "reset" && (
            <Input label="PASSWORD" type="password" value={password} onChange={v => { setPassword(v); clear() }} placeholder="••••••••" />
          )}

          {error && <div style={{ color: "#e94560", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}
          {info  && <div style={{ color: "#34e89e", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{info}</div>}

          <button onClick={handleSubmit} disabled={loading} style={S.btn}>
            {loading ? "…" : btnLabel[mode]}
          </button>
        </div>

        {/* Mode toggles */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 24 }}>
          {mode === "signin" && <>
            <button onClick={() => { setMode("signup"); clear() }} style={S.link}>Don't have an account? Sign up</button>
            <button onClick={() => { setMode("reset"); clear() }}  style={{ ...S.link, color: "#444" }}>Forgot password?</button>
          </>}
          {mode === "signup" && (
            <button onClick={() => { setMode("signin"); clear() }} style={S.link}>Already have an account? Sign in</button>
          )}
          {mode === "reset" && (
            <button onClick={() => { setMode("signin"); clear() }} style={S.link}>Back to sign in</button>
          )}
        </div>

        <div style={{ marginTop: 32, fontSize: 11, color: "#333", textAlign: "center" }}>
          Your data is encrypted and stored securely
        </div>
      </div>
    </div>
  )
}

const S = {
  viewport: {
    width: "100vw", minHeight: "100dvh",
    background: "#0a0a0a",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
  },
  screen: {
    width: "100%", maxWidth: 390,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "40px 28px", position: "relative", overflow: "hidden",
  },
  glow: {
    position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)",
    width: 320, height: 320, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(66,134,244,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  icon: {
    width: 72, height: 72, borderRadius: 20, margin: "0 auto 16px",
    background: "linear-gradient(135deg, #1a1a2e, #16213e)",
    border: "1px solid #2a2a2a", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 32,
    boxShadow: "0 8px 32px rgba(66,134,244,0.2)",
  },
  appName: { fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: -0.5 },
  btn: {
    width: "100%", padding: "15px", borderRadius: 14, border: "none",
    background: "linear-gradient(90deg, #4286f4, #34e89e)",
    color: "#000", fontSize: 16, fontWeight: 800, cursor: "pointer",
    marginTop: 4,
  },
  link: {
    background: "none", border: "none", color: "#4286f4",
    fontSize: 13, cursor: "pointer", padding: "4px 0",
  },
}
