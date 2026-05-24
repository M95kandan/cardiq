import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { CARD_DB, searchCards } from "../data/creditCards";
import { extractPDFLines, parseTransactions as parsePDFTxns, categoryIcon, parseBillingSummary, parseCardIdentity } from "../lib/statementParser";

// ─── RESPONSIVE HOOK ──────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { name: "Crimson",  color: ["#1a1a2e","#16213e"], accent: "#e94560" },
  { name: "Emerald",  color: ["#0f3443","#0d2137"], accent: "#34e89e" },
  { name: "Sapphire", color: ["#373b44","#1e2a5e"], accent: "#4286f4" },
  { name: "Violet",   color: ["#2d1b4e","#3d1b6e"], accent: "#c084fc" },
  { name: "Rose",     color: ["#2a0a14","#5c1a2e"], accent: "#f43f5e" },
  { name: "Jade",     color: ["#0a2a1a","#1a4a2e"], accent: "#4ade80" },
  { name: "Amber",    color: ["#2a1a00","#5c3a00"], accent: "#f59e0b" },
  { name: "Steel",    color: ["#1e2a3a","#2d3f55"], accent: "#60a5fa" },
];

const categories = ["Dining", "Travel", "Fuel", "Shopping", "Entertainment", "Online Shopping", "Groceries", "Other"];
const categoryRewardKey = {
  Dining: "dining", Travel: "travel", Fuel: "fuel", Shopping: "shopping",
  Entertainment: "shopping", "Online Shopping": "shopping", Groceries: "other", Other: "other",
};

const tabs = ["Cards", "Smart Pay", "Bills", "Transactions", "Insights", "Budget"];
const tabIcons = ["💳", "🧠", "🗓️", "📋", "📊", "🎯"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getBestCard(category, amount, txnType = "card", cards) {
  const key = categoryRewardKey[category] || "other";
  return cards
    .filter(c => txnType === "qr" ? c.supportsQR : true)
    .map(card => {
      const rate = card.rewardRate[key] || 1;
      const pts = Math.floor((amount / 100) * rate);
      const value = pts * card.pointValue;
      const offer = (card.offers || []).find(o => o.category === category);
      return { card, rate, pts, value, offer };
    })
    .sort((a, b) => b.value - a.value);
}

function getDaysUntil(dateStr) {
  const due = new Date(dateStr);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((due - now) / 86400000);
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtCurrency(n) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString()}`;
}

// ─── SHARED INPUT STYLE ───────────────────────────────────────────────────────
const ST = {
  label:    { fontSize: 10, fontWeight: 800, color: "#555", letterSpacing: 2, marginBottom: 8 },
  input:    { width: "100%", padding: "12px 14px", borderRadius: 12, background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" },
  pill:     { padding: "5px 10px", borderRadius: 16, border: "1px solid", fontSize: 11, cursor: "pointer" },
  cardPill: { padding: "6px 12px", borderRadius: 16, border: "1px solid", fontSize: 12, cursor: "pointer" },
  toggle:   { padding: "10px", borderRadius: 12, border: "1px solid", fontSize: 12, cursor: "pointer" },
};

// ─── QR PAY MODAL ─────────────────────────────────────────────────────────────
function QRPayModal({ card, onClose, onTransaction }) {
  const [step, setStep]       = useState("scan");   // scan | confirm | success
  const [upiData, setUpiData] = useState(null);     // { pa, pn, am, tn }
  const [camErr, setCamErr]   = useState(null);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);

  // Start camera when modal opens
  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (e) {
        setCamErr("Camera access denied. Allow camera in browser settings.");
      }
    })();
    return () => {
      stopped = true;
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  // Continuously scan video frames for QR codes
  const scanFrame = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const jsQR = (await import("jsqr")).default;
    const code = jsQR(img.data, img.width, img.height);
    if (code) {
      const raw = code.data;
      // Parse UPI URI: upi://pay?pa=...&pn=...&am=...&tn=...
      const parsed = parseUpiUri(raw);
      if (parsed) {
        stopCamera();
        setUpiData(parsed);
        setStep("confirm");
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, []);

  // Start scanning once video is playing
  const handleVideoPlay = () => {
    rafRef.current = requestAnimationFrame(scanFrame);
  };

  const parseUpiUri = (raw) => {
    try {
      const url = raw.startsWith("upi://") ? new URL(raw.replace("upi://", "https://upi/")) : new URL(raw);
      const pa  = url.searchParams.get("pa");
      if (!pa) return null;
      return {
        pa,
        pn:  url.searchParams.get("pn") || pa.split("@")[0],
        am:  parseFloat(url.searchParams.get("am")) || null,
        tn:  url.searchParams.get("tn") || "",
        raw,
      };
    } catch { return null; }
  };

  const handleOpenUpiApp = () => {
    // Build UPI deep link — OS shows all installed UPI apps (GPay, PhonePe, Paytm, Navi…)
    const link = new URL("upi://pay");
    link.searchParams.set("pa", upiData.pa);
    link.searchParams.set("pn", upiData.pn);
    if (upiData.am) link.searchParams.set("am", upiData.am.toFixed(2));
    link.searchParams.set("cu", "INR");
    link.searchParams.set("tn", upiData.tn || "CardIQ Payment");
    // Log the transaction in the app then redirect
    if (upiData.am) {
      onTransaction({ cardId: card.id, merchant: upiData.pn, category: "Other", amount: upiData.am, type: "qr", icon: "⬛" });
    }
    window.location.href = link.toString();
    setStep("success");
  };

  return (
    <div style={M.overlay}>
      <div style={M.sheet} onClick={e => e.stopPropagation()}>
        <div style={M.handle} />

        {step === "scan" && <>
          <div style={M.title}>Scan & Pay</div>
          <div style={M.subtitle}>{card.name} · {card.upiId || "UPI Credit Card"}</div>
          <div style={M.badge}><span style={{ color: card.accent, fontWeight: 800 }}>⬡ RuPay</span><span style={{ color: "#888", marginLeft: 8 }}>UPI Credit Card</span></div>

          {/* Live camera viewfinder */}
          <div style={{ ...M.finder, overflow: "hidden", borderRadius: 16, background: "#000" }}>
            {["tl", "tr", "bl", "br"].map(p => <div key={p} style={{ ...M.corner(p, card.accent), zIndex: 2 }} />)}
            {camErr ? (
              <div style={{ color: "#e94560", fontSize: 12, textAlign: "center", padding: 16 }}>{camErr}</div>
            ) : (
              <video ref={videoRef} onPlay={handleVideoPlay} muted playsInline
                style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 8 }} />
            )}
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div style={M.scanLine} className="qr-scan" />
          </div>

          <div style={{ fontSize: 12, color: "#666", textAlign: "center", marginTop: 10 }}>
            Point camera at any UPI / Bharat QR code
          </div>
          <div style={M.note}>🇮🇳 Your UPI apps (GPay, PhonePe, Navi…) will open automatically</div>
          <button onClick={onClose} style={M.ghost}>Cancel</button>
        </>}

        {step === "confirm" && upiData && <>
          <div style={M.title}>Open UPI App</div>
          <div style={M.mBox}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏪</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{upiData.pn}</div>
            <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{upiData.pa}</div>
            {upiData.am ? (
              <div style={{ color: card.accent, fontWeight: 900, fontSize: 32, marginTop: 12 }}>₹{upiData.am.toLocaleString("en-IN")}</div>
            ) : (
              <div style={{ color: "#888", fontSize: 14, marginTop: 12 }}>Amount set in UPI app</div>
            )}
            {upiData.tn ? <div style={{ color: "#666", fontSize: 11, marginTop: 6 }}>{upiData.tn}</div> : null}
          </div>
          <div style={M.payWith}>
            <div style={{ fontSize: 10, color: "#666", letterSpacing: 2 }}>PAYING WITH</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ width: 32, height: 20, borderRadius: 4, background: `linear-gradient(135deg,${card.color[0]},${card.color[1]})` }} />
              <div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{card.name}</div>
                <div style={{ color: "#666", fontSize: 10 }}>•••• {card.last4} · {card.upiId}</div>
              </div>
            </div>
          </div>
          <button onClick={handleOpenUpiApp} style={{ ...M.btn, background: "linear-gradient(90deg,#6c3fc7,#c084fc)" }}>
            Open GPay / PhonePe / Navi →
          </button>
          <button onClick={() => { setStep("scan"); streamRef.current === null && window.location.reload(); }} style={M.ghost}>Scan Again</button>
        </>}

        {step === "success" && <div style={{ textAlign: "center", paddingTop: 20 }}>
          <div style={M.ring}><div style={M.check}>✓</div></div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginTop: 20 }}>Redirected to UPI App</div>
          <div style={{ color: "#888", fontSize: 13, marginTop: 6 }}>Complete payment in your UPI app</div>
          <div style={{ ...M.note, marginTop: 16 }}>Transaction logged in CardIQ once you confirm</div>
          <button onClick={onClose} style={{ ...M.btn, marginTop: 24 }}>Done</button>
        </div>}
      </div>
    </div>
  );
}

// ─── BILL MODAL ───────────────────────────────────────────────────────────────
function BillModal({ card, onClose }) {
  const days = getDaysUntil(card.dueDate);
  const urgency = days <= 3 ? "#e94560" : days <= 7 ? "#f97316" : "#34e89e";
  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={{ ...M.sheet, paddingBottom: 50 }} onClick={e => e.stopPropagation()}>
        <div style={M.handle} />
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#666", letterSpacing: 2, marginBottom: 4 }}>BILL DUE</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{card.name}</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>•••• {card.last4}{card.billCycle ? ` · Cycle closes ${card.billCycle}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: "#111", borderRadius: 14, padding: "14px", border: "1px solid #1e1e1e", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>DUE DATE</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: urgency, marginTop: 4 }}>{fmtDate(card.dueDate)}</div>
            <div style={{ fontSize: 11, color: urgency, marginTop: 2 }}>{days <= 0 ? "OVERDUE" : `${days} days left`}</div>
          </div>
          <div style={{ flex: 1, background: "#111", borderRadius: 14, padding: "14px", border: "1px solid #1e1e1e", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>TOTAL DUE</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#e94560", marginTop: 4 }}>{fmtCurrency(card.totalDue)}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>full balance</div>
          </div>
        </div>
        <div style={{ background: "#111", borderRadius: 14, padding: "14px 16px", border: "1px solid #1e1e1e", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>MINIMUM DUE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f97316", marginTop: 4 }}>₹{card.minDue.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>STATEMENT</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 4 }}>{fmtCurrency(card.spent)}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, background: "#1a1a1a", borderRadius: 8, padding: "8px 10px", fontSize: 10, color: "#888" }}>
            ⚠️ Paying only minimum will incur ~3.5% monthly interest
          </div>
        </div>
        <button style={{ ...M.btn, background: "linear-gradient(90deg,#e94560,#f97316)" }}>Pay Now →</button>
        <button onClick={onClose} style={M.ghost}>Close</button>
      </div>
    </div>
  );
}

// ─── SPEND ALERT ──────────────────────────────────────────────────────────────
function AlertBanner({ cards }) {
  const alerts = cards.filter(c => c.limit > 0 && (c.spent / c.limit) * 100 >= c.alertThreshold);
  const [dismissed, setDismissed] = useState([]);
  const visible = alerts.filter(a => !dismissed.includes(a.id));
  if (!visible.length) return null;
  const a = visible[0];
  const pct = ((a.spent / a.limit) * 100).toFixed(0);
  return (
    <div style={{ margin: "0 0 8px", background: "linear-gradient(135deg,#2a1400,#1a0a00)", border: "1px solid #f97316", borderRadius: 14, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 18 }}>⚠️</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "#fb923c", fontWeight: 700 }}>{a.name} at {pct}% utilization</div>
        <div style={{ fontSize: 10, color: "#9a6040", marginTop: 2 }}>{fmtCurrency(a.limit - a.spent)} remaining</div>
      </div>
      <button onClick={() => setDismissed(d => [...d, a.id])} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: 4 }}>✕</button>
    </div>
  );
}

// ─── ADD TRANSACTION MODAL ────────────────────────────────────────────────────
function AddTxnModal({ cards, onAdd, onClose }) {
  const [sel, setSel] = useState(cards[0].id);
  const [cat, setCat] = useState("Dining");
  const [amt, setAmt] = useState("");
  const [merch, setMerch] = useState("");
  const [type, setType] = useState("card");

  const catIcons = { Dining: "🍽️", Travel: "✈️", Fuel: "⛽", Shopping: "🛍️", Entertainment: "🎬", "Online Shopping": "📦", Groceries: "🛒", Other: "💸" };

  const handleAdd = () => {
    if (!amt || !merch) return;
    const card = cards.find(c => c.id === sel);
    const key = categoryRewardKey[cat] || "other";
    const rate = card.rewardRate[key] || 1;
    const pts = Math.floor((parseFloat(amt) / 100) * rate);
    onAdd({ cardId: sel, merchant: merch, category: cat, amount: parseFloat(amt), type, icon: catIcons[cat] || "💸", points: pts });
    onClose();
  };

  const selectedCard = cards.find(c => c.id === sel);

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={{ ...M.sheet, paddingBottom: 50 }} onClick={e => e.stopPropagation()}>
        <div style={M.handle} />
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 16 }}>Log Transaction</div>

        <div style={ST.label}>CARD</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
          {cards.map(c => (
            <button key={c.id} onClick={() => { setSel(c.id); if (!c.supportsQR) setType("card"); }}
              style={{ ...ST.cardPill, borderColor: sel === c.id ? c.accent : "#2a2a2a", color: sel === c.id ? c.accent : "#888", background: sel === c.id ? "#111" : "transparent", flexShrink: 0 }}>
              {c.bank} {c.last4}
            </button>
          ))}
        </div>

        <div style={ST.label}>PAYMENT TYPE</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["card", "💳 Card"], ["qr", "⬛ QR/UPI"]].map(([v, l]) => (
            <button key={v} onClick={() => setType(v)} disabled={v === "qr" && !selectedCard?.supportsQR}
              style={{ ...ST.toggle, flex: 1, borderColor: type === v ? (v === "qr" ? "#c084fc" : "#4286f4") : "#2a2a2a", color: type === v ? (v === "qr" ? "#c084fc" : "#4286f4") : "#555", background: type === v ? (v === "qr" ? "#1a0533" : "#0d1a33") : "transparent", opacity: v === "qr" && !selectedCard?.supportsQR ? 0.4 : 1 }}>{l}</button>
          ))}
        </div>

        <div style={ST.label}>MERCHANT</div>
        <input value={merch} onChange={e => setMerch(e.target.value)} placeholder="e.g. Zomato, Flipkart…" style={{ ...ST.input, marginBottom: 14 }} />

        <div style={ST.label}>CATEGORY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              style={{ ...ST.pill, borderColor: cat === c ? "#4286f4" : "#2a2a2a", color: cat === c ? "#4286f4" : "#666", background: cat === c ? "#0d1a33" : "transparent" }}>
              {catIcons[c]} {c}
            </button>
          ))}
        </div>

        <div style={ST.label}>AMOUNT (₹)</div>
        <input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="0" style={{ ...ST.input, marginBottom: 16 }} />

        <button onClick={handleAdd} style={M.btn}>Add Transaction</button>
        <button onClick={onClose} style={M.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ─── CARD NAME AUTOCOMPLETE ───────────────────────────────────────────────────
function CardSearchInput({ value, onChange, onSelectCard }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (v) => {
    onChange(v);
    const res = searchCards(v);
    setResults(res);
    setOpen(res.length > 0 && v.length >= 2);
  };

  const handleSelect = (card) => {
    onChange(card.name);
    onSelectCard(card);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 14 }}>
      <div style={ST.label}>CARD NAME — start typing to auto-fill details</div>
      <input
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder="e.g. ICICI RubyX, HDFC Swiggy…"
        style={{ ...ST.input, borderColor: open ? "#4286f4" : "#2a2a2a" }}
        autoFocus
      />
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999,
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 14,
          overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.8)",
        }}>
          {results.map((card, i) => (
            <button key={card.slug} onClick={() => handleSelect(card)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              padding: "12px 16px", background: "transparent", border: "none",
              color: "#fff", cursor: "pointer", textAlign: "left",
              borderBottom: i < results.length - 1 ? "1px solid #1e1e1e" : "none",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#1a1a1a"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width: 40, height: 26, borderRadius: 6, flexShrink: 0,
                background: `linear-gradient(135deg, ${card.color[0]}, ${card.color[1]})`,
                border: `1px solid ${card.accent}44`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{card.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {card.bank} · {card.network}
                  {card.supportsQR && <span style={{ color: "#c084fc", marginLeft: 8 }}>⬡ RuPay QR</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: card.accent, fontWeight: 700 }}>
                  Best: {Math.max(...Object.values(card.rewardRate))}X
                </div>
                <div style={{ fontSize: 10, color: "#555" }}>
                  {card.annualFee === 0 ? "Lifetime free" : `₹${card.annualFee}/yr`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ADD / EDIT CARD MODAL ────────────────────────────────────────────────────
function FormField({ label, placeholder, value, onChange, type = "text", children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={ST.label}>{label}</div>
      {children || <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={ST.input} />}
    </div>
  );
}

function AddEditCardModal({ card, onSave, onClose }) {
  const isEdit = !!card;
  const blank = {
    name: "", bank: "", last4: "", network: "Visa",
    color: COLOR_PRESETS[0].color, accent: COLOR_PRESETS[0].accent,
    limit: "", spent: "", totalDue: "", minDue: "", dueDate: "", billCycle: "",
    alertThreshold: 75, points: "0", pointValue: "0.25",
    rewardRate: { dining: 2, travel: 2, fuel: 1, shopping: 2, other: 1 },
    supportsQR: false, upiId: "", offers: [],
  };
  const [f, setF] = useState(isEdit ? {
    ...card,
    limit: String(card.limit), spent: String(card.spent),
    totalDue: String(card.totalDue), minDue: String(card.minDue),
    points: String(card.points), pointValue: String(card.pointValue),
  } : blank);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setRate = (k, v) => setF(p => ({ ...p, rewardRate: { ...p.rewardRate, [k]: Number(v) || 1 } }));

  // Auto-fill from card database
  const handleSelectFromDB = (dbCard) => {
    setF(prev => ({
      ...prev,
      name: dbCard.name,
      bank: dbCard.bank,
      network: dbCard.network,
      color: dbCard.color,
      accent: dbCard.accent,
      rewardRate: dbCard.rewardRate,
      pointValue: String(dbCard.pointValue),
      supportsQR: dbCard.supportsQR,
    }));
  };

  const handleSave = () => {
    if (!f.name.trim() || !f.last4 || !f.limit || !f.dueDate) return;
    const spent = parseFloat(f.spent) || 0;
    const totalDue = parseFloat(f.totalDue) || spent;
    onSave({
      ...f,
      id: card?.id || Date.now(),
      limit: parseFloat(f.limit) || 0,
      spent, totalDue,
      minDue: parseFloat(f.minDue) || Math.floor(totalDue * 0.05),
      alertThreshold: parseFloat(f.alertThreshold) || 75,
      points: parseFloat(f.points) || 0,
      pointValue: parseFloat(f.pointValue) || 0.25,
      offers: card?.offers || [],
    });
  };

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={{ ...M.sheet, paddingBottom: 50, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={M.handle} />
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 20 }}>{isEdit ? "Edit Card" : "Add New Card"}</div>

        {/* ── CARD IDENTITY ── */}
        <div style={{ fontSize: 10, fontWeight: 800, color: "#4286f4", letterSpacing: 2, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e1e1e" }}>CARD IDENTITY</div>

        {/* Smart autocomplete — only on Add */}
        {!isEdit && (
          <CardSearchInput
            value={f.name}
            onChange={v => set("name", v)}
            onSelectCard={handleSelectFromDB}
          />
        )}
        {isEdit && <FormField label="CARD NAME" placeholder="e.g. HDFC Regalia" value={f.name} onChange={v => set("name", v)} />}

        {/* Benefits preview if from DB */}
        {!isEdit && (() => {
          const match = CARD_DB.find(c => c.name === f.name);
          return match ? (
            <div style={{ background: "#0d1a33", borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: "1px solid #1a3a5c" }}>
              <div style={{ fontSize: 10, color: "#4286f4", letterSpacing: 1, marginBottom: 8 }}>✓ CARD DETAILS AUTO-FILLED FROM DATABASE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {match.benefits.slice(0, 4).map((b, i) => (
                  <div key={i} style={{ fontSize: 10, color: "#93c5fd", background: "#1a2a4a", borderRadius: 8, padding: "3px 8px" }}>{b}</div>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        <FormField label="BANK / ISSUER" placeholder="e.g. HDFC, Axis, SBI" value={f.bank} onChange={v => set("bank", v)} />
        <FormField label="LAST 4 DIGITS" placeholder="1234" value={f.last4} onChange={v => set("last4", v.slice(0, 4))} type="number" />
        <FormField label="NETWORK">
          <div style={{ display: "flex", gap: 8, marginBottom: 0 }}>
            {["Visa", "Mastercard", "RuPay", "Amex"].map(n => (
              <button key={n} onClick={() => set("network", n)} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `1px solid ${f.network === n ? "#4286f4" : "#2a2a2a"}`, background: f.network === n ? "#0d1a33" : "transparent", color: f.network === n ? "#4286f4" : "#555", fontSize: 11, cursor: "pointer", fontWeight: f.network === n ? 700 : 400 }}>{n}</button>
            ))}
          </div>
        </FormField>
        <FormField label="COLOR THEME">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {COLOR_PRESETS.map(p => (
              <button key={p.name} onClick={() => { set("color", p.color); set("accent", p.accent); }} style={{ height: 38, borderRadius: 10, border: `2px solid ${f.accent === p.accent ? "#fff" : "transparent"}`, background: `linear-gradient(135deg,${p.color[0]},${p.color[1]})`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13 }}>
                {f.accent === p.accent ? "✓" : ""}
              </button>
            ))}
          </div>
        </FormField>

        {/* ── BILLING ── */}
        <div style={{ fontSize: 10, fontWeight: 800, color: "#f97316", letterSpacing: 2, margin: "16px 0 12px", paddingBottom: 8, borderBottom: "1px solid #1e1e1e" }}>CREDIT & BILLING</div>
        <FormField label="CREDIT LIMIT (₹)" placeholder="500000" value={f.limit} onChange={v => set("limit", v)} type="number" />
        <FormField label="CURRENT OUTSTANDING (₹)" placeholder="0" value={f.spent} onChange={v => set("spent", v)} type="number" />
        <FormField label="TOTAL DUE (₹)" placeholder="Leave blank = same as outstanding" value={f.totalDue} onChange={v => set("totalDue", v)} type="number" />
        <FormField label="MINIMUM DUE (₹)" placeholder="Auto = 5% of total due" value={f.minDue} onChange={v => set("minDue", v)} type="number" />
        <FormField label="PAYMENT DUE DATE">
          <input type="date" value={f.dueDate} onChange={e => set("dueDate", e.target.value)} style={{ ...ST.input, colorScheme: "dark" }} />
        </FormField>
        <FormField label="BILL CYCLE CLOSES" placeholder="e.g. 25th" value={f.billCycle} onChange={v => set("billCycle", v)} />
        <FormField label={`SPEND ALERT AT ${f.alertThreshold}% UTILIZATION`}>
          <input type="range" min={30} max={95} step={5} value={f.alertThreshold} onChange={e => set("alertThreshold", Number(e.target.value))} style={{ width: "100%", accentColor: "#f97316", marginTop: 4 }} />
        </FormField>

        {/* ── REWARDS ── */}
        <div style={{ fontSize: 10, fontWeight: 800, color: "#34e89e", letterSpacing: 2, margin: "16px 0 12px", paddingBottom: 8, borderBottom: "1px solid #1e1e1e" }}>REWARD POINTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><div style={ST.label}>POINTS BALANCE</div><input type="number" value={f.points} onChange={e => set("points", e.target.value)} placeholder="0" style={ST.input} /></div>
          <div><div style={ST.label}>₹ PER POINT</div><input type="number" value={f.pointValue} onChange={e => set("pointValue", e.target.value)} placeholder="0.25" step="0.05" style={ST.input} /></div>
        </div>
        <div style={ST.label}>REWARD RATES (pts per ₹100)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14 }}>
          {["dining", "travel", "fuel", "shopping", "other"].map(cat => (
            <div key={cat} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>{cat}</div>
              <input type="number" min={0} max={50} value={f.rewardRate[cat]} onChange={e => setRate(cat, e.target.value)} style={{ ...ST.input, padding: "8px 6px", textAlign: "center" }} />
            </div>
          ))}
        </div>

        {/* ── UPI ── */}
        <div style={{ fontSize: 10, fontWeight: 800, color: "#c084fc", letterSpacing: 2, margin: "16px 0 12px", paddingBottom: 8, borderBottom: "1px solid #1e1e1e" }}>UPI / QR</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a1a", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Supports UPI QR</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>RuPay credit cards only</div>
          </div>
          <button onClick={() => set("supportsQR", !f.supportsQR)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: f.supportsQR ? "#c084fc" : "#333", position: "relative", transition: "background 0.2s" }}>
            <div style={{ position: "absolute", top: 2, left: f.supportsQR ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>
        {f.supportsQR && <FormField label="UPI ID" placeholder="yourname@hdfcbank" value={f.upiId} onChange={v => set("upiId", v)} />}

        <button onClick={handleSave} style={{ ...M.btn, background: isEdit ? "linear-gradient(90deg,#f97316,#e94560)" : "linear-gradient(90deg,#4286f4,#34e89e)", marginTop: 8 }}>
          {isEdit ? "Save Changes ✓" : "Add Card →"}
        </button>
        <button onClick={onClose} style={M.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ─── SIDEBAR NAV (desktop) ────────────────────────────────────────────────────
function SidebarNav({ activeTab, setActiveTab, cards, onSignOut }) {
  const totalLimit = cards.reduce((s, c) => s + c.limit, 0);
  const totalSpent = cards.reduce((s, c) => s + c.spent, 0);
  const util = totalLimit > 0 ? ((totalSpent / totalLimit) * 100).toFixed(0) : 0;
  const utilColor = util < 30 ? "#34e89e" : util < 60 ? "#f97316" : "#e94560";

  return (
    <div style={{ width: 240, borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", padding: "24px 16px", gap: 4, flexShrink: 0, overflowY: "auto" }}>
      {cards.length > 0 && (
        <div style={{ background: "#111", borderRadius: 14, padding: "14px", marginBottom: 20, border: "1px solid #1e1e1e" }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>AVAILABLE CREDIT</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#34e89e" }}>{fmtCurrency(totalLimit - totalSpent)}</div>
          <div style={{ height: 4, background: "#1e1e1e", borderRadius: 2, marginTop: 10 }}>
            <div style={{ width: `${Math.min(util, 100)}%`, height: "100%", background: utilColor, borderRadius: 2, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#555" }}>{util}% used</span>
            <span style={{ fontSize: 10, color: "#555" }}>{cards.length} card{cards.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}

      {tabs.map((tab, i) => (
        <button key={tab} onClick={() => setActiveTab(i)} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
          borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
          background: activeTab === i ? "#1a1a1a" : "transparent",
          color: activeTab === i ? "#fff" : "#666",
          fontWeight: activeTab === i ? 700 : 400,
          fontSize: 14, transition: "all 0.15s",
        }}
          onMouseEnter={e => { if (activeTab !== i) e.currentTarget.style.background = "#111"; e.currentTarget.style.color = "#aaa"; }}
          onMouseLeave={e => { if (activeTab !== i) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#666"; } }}
        >
          <span style={{ fontSize: 18 }}>{tabIcons[i]}</span>
          <span>{tab}</span>
          {activeTab === i && <div style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: "50%", background: "#4286f4" }} />}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <button onClick={onSignOut} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
        borderRadius: 12, border: "none", cursor: "pointer", background: "transparent",
        color: "#555", fontSize: 14, marginTop: 8, width: "100%",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "#111"; e.currentTarget.style.color = "#e94560"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#555"; }}
      >
        <span>↩</span><span>Sign out</span>
      </button>
    </div>
  );
}

// ─── CARDS TAB ────────────────────────────────────────────────────────────────
function CardsTab({ cards, txns, onSelect, selected, onQRPay, onAdd, onEdit, onDelete, isDesktop }) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  if (cards.length === 0) return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <div style={{ fontSize: 60, marginBottom: 20 }}>💳</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No cards yet</div>
      <div style={{ fontSize: 14, color: "#555", marginBottom: 32 }}>Add your credit cards to track spending, bills and rewards</div>
      <button onClick={onAdd} style={{ ...M.btn, width: "auto", padding: "14px 40px", display: "inline-block" }}>+ Add Your First Card</button>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={S.secLabel}>MY CARDS ({cards.length})</div>
        <button onClick={onAdd} style={{ background: "#0d1a33", border: "1px solid #4286f4", color: "#4286f4", borderRadius: 12, padding: "6px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Add Card</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(2, 1fr)" : "1fr", gap: 12, alignItems: "start" }}>
        {cards.map((card, i) => (
          <div key={card.id} style={{ minWidth: 0 }}>
            <div onClick={() => onSelect(selected?.id === card.id ? null : card)}
              style={{
                background: `linear-gradient(135deg,${card.color[0]},${card.color[1]})`,
                borderRadius: 20, padding: "18px 20px", cursor: "pointer",
                border: selected?.id === card.id ? `2px solid ${card.accent}` : "2px solid transparent",
                animation: `slideUp 0.4s ease ${i * 60}ms both`, transition: "transform 0.2s",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, textTransform: "uppercase" }}>{card.bank}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 2 }}>{card.name}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {card.supportsQR && <button onClick={e => { e.stopPropagation(); onQRPay(card); }} style={{ background: "#1a0533", border: "1px solid #6c3fc7", color: "#c084fc", borderRadius: 12, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="1.2" stroke="#c084fc" strokeWidth="2" fill="none"/><rect x="3.5" y="3.5" width="4" height="4" rx="0.5" fill="#c084fc"/><rect x="11" y="2" width="7" height="7" rx="1.2" stroke="#c084fc" strokeWidth="2" fill="none"/><rect x="12.5" y="3.5" width="4" height="4" rx="0.5" fill="#c084fc"/><rect x="2" y="11" width="7" height="7" rx="1.2" stroke="#c084fc" strokeWidth="2" fill="none"/><rect x="3.5" y="12.5" width="4" height="4" rx="0.5" fill="#c084fc"/><rect x="11" y="11" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/><rect x="14.5" y="11" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/><rect x="11" y="14.5" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/><rect x="14.5" y="14.5" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/></svg>
                    QR
                  </button>}
                  <div style={{ fontSize: 11, color: card.accent, background: "rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: 20, fontWeight: 700 }}>{card.network}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, letterSpacing: 4, color: "rgba(255,255,255,0.75)", margin: "14px 0 10px", fontFamily: "monospace" }}>•••• •••• •••• {card.last4}</div>

              {/* Utilization row */}
              {(() => {
                const utilPct = card.limit > 0 ? Math.min((card.spent / card.limit) * 100, 100) : 0;
                const unbilledAmt = txns.filter(t => t.cardId === card.id && (t.source === "sms" || t.source === "manual") && t.type !== "credit").reduce((s, t) => s + t.amount, 0);
                const billedAmt = Math.max(0, card.totalDue - unbilledAmt);
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>POINTS</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: card.accent }}>{(card.points || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{fmtCurrency(card.spent)} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>/ {fmtCurrency(card.limit)}</span></div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{utilPct.toFixed(0)}% utilisation</div>
                      </div>
                    </div>

                    {/* Stacked utilization bar: billed (red) + unbilled (purple) */}
                    <div style={{ height: 5, background: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 6 }}>
                      <div style={{ width: `${card.limit > 0 ? Math.min((billedAmt / card.limit) * 100, 100) : 0}%`, height: "100%", background: "#e94560", borderRadius: 3 }} />
                      <div style={{ width: `${card.limit > 0 ? Math.min((unbilledAmt / card.limit) * 100, 100) : 0}%`, height: "100%", background: "#c084fc" }} />
                    </div>

                    {/* Billed / Unbilled / Due label row */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 10, color: "rgba(233,69,96,0.85)" }}>
                        <span style={{ display: "inline-block", width: 6, height: 6, background: "#e94560", borderRadius: 1, marginRight: 4, verticalAlign: "middle" }} />
                        Billed {fmtCurrency(billedAmt)}
                      </div>
                      {unbilledAmt > 0 && (
                        <div style={{ fontSize: 10, color: "rgba(192,132,252,0.9)" }}>
                          <span style={{ display: "inline-block", width: 6, height: 6, background: "#c084fc", borderRadius: 1, marginRight: 4, verticalAlign: "middle" }} />
                          Unbilled {fmtCurrency(unbilledAmt)}
                        </div>
                      )}
                      {(() => { const d = getDaysUntil(card.dueDate); const col = d <= 3 ? "#e94560" : d <= 7 ? "#f97316" : "#34e89e"; return (
                        <div style={{ marginLeft: "auto", fontSize: 10, color: col }}>🗓 Due {fmtDate(card.dueDate)}</div>
                      ); })()}
                    </div>
                  </>
                );
              })()}
            </div>
            {selected?.id === card.id && (
              <div style={{ borderRadius: "0 0 16px 16px", padding: "14px 16px", marginBottom: 4, background: "#111", border: `1px solid ${card.accent}44`, borderTop: "none" }}>
                <div style={S.secLabel}>REWARD RATES</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14 }}>
                  {Object.entries(card.rewardRate).map(([cat, rate]) => (
                    <div key={cat} style={{ background: "#1a1a1a", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#aaa", textTransform: "capitalize" }}>{cat}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: card.accent }}>{rate}X</div>
                    </div>
                  ))}
                </div>
                {card.supportsQR && <div style={{ marginBottom: 12, background: "#1a0533", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "#888", letterSpacing: 1 }}>UPI ID</div>
                  <div style={{ fontSize: 13, color: "#c084fc", fontWeight: 700, marginTop: 2 }}>{card.upiId}</div>
                </div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={e => { e.stopPropagation(); onEdit(card); }} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1px solid #4286f4", background: "#0d1a33", color: "#4286f4", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>
                  {confirmDelete === card.id
                    ? <button onClick={e => { e.stopPropagation(); onDelete(card.id); setConfirmDelete(null); }} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1px solid #e94560", background: "#e94560", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Confirm Delete</button>
                    : <button onClick={e => { e.stopPropagation(); setConfirmDelete(card.id); }} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer" }}>🗑 Delete</button>
                  }
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SMART PAY TAB ────────────────────────────────────────────────────────────
function SmartPayTab({ cards, category, setCategory, amount, setAmount, txnType, setTxnType, onAnalyze, recommendations, onQRPay }) {
  if (cards.length === 0) return <div style={{ textAlign: "center", padding: "80px 20px" }}><div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No cards to compare</div><div style={{ fontSize: 14, color: "#555" }}>Add cards to get smart payment recommendations</div></div>;

  const catIcons = { Dining: "🍽️", Travel: "✈️", Fuel: "⛽", Shopping: "🛍️", Entertainment: "🎬", "Online Shopping": "📦", Groceries: "🛒", Other: "💸" };

  return (
    <div>
      <div style={S.secLabel}>SMART PURCHASE ADVISOR</div>
      <div style={{ background: "#111", borderRadius: 20, padding: "20px", marginBottom: 16, border: "1px solid #1e1e1e" }}>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Pick a category + amount to find the best card for maximum rewards 🎯</div>

        <div style={S.secLabel}>PAYMENT TYPE</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            ["card", <>💳 Card Swipe</>],
            ["qr", <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="3.5" y="3.5" width="4" height="4" rx="0.5" fill="currentColor"/>
                <rect x="11" y="2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="12.5" y="3.5" width="4" height="4" rx="0.5" fill="currentColor"/>
                <rect x="2" y="11" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="3.5" y="12.5" width="4" height="4" rx="0.5" fill="currentColor"/>
                <rect x="11" y="11" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
                <rect x="14.5" y="11" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
                <rect x="11" y="14.5" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
                <rect x="14.5" y="14.5" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
              </svg>
              QR / UPI
            </span>],
          ].map(([v, l]) => (
            <button key={v} onClick={() => setTxnType(v)} style={{ ...ST.toggle, flex: 1, textAlign: "center", borderColor: txnType === v ? (v === "qr" ? "#c084fc" : "#4286f4") : "#2a2a2a", color: txnType === v ? (v === "qr" ? "#c084fc" : "#4286f4") : "#555", background: txnType === v ? (v === "qr" ? "#1a0533" : "#0d1a33") : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{l}</button>
          ))}
        </div>

        <div style={S.secLabel}>CATEGORY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${category === c ? "#4286f4" : "#2a2a2a"}`, background: category === c ? "#0d1a33" : "transparent", color: category === c ? "#4286f4" : "#666", fontSize: 13, cursor: "pointer" }}>
              {catIcons[c]} {c}
            </button>
          ))}
        </div>

        <div style={S.secLabel}>AMOUNT (₹)</div>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...ST.input, marginBottom: 16 }} placeholder="Enter amount" />

        {txnType === "qr" && <div style={{ marginBottom: 16, background: "#1a0533", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#c084fc" }}>⬛ QR mode — only RuPay credit cards eligible</div>}
        <button onClick={onAnalyze} style={M.btn}>Find Best Card →</button>
      </div>

      {recommendations && <>
        <div style={S.secLabel}>RECOMMENDATIONS</div>
        {recommendations.map(({ card, rate, pts, value, offer }, i) => (
          <div key={card.id} style={{ background: "#111", borderRadius: 16, padding: "16px", marginBottom: 10, border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? card.accent : "#2a2a2a"}`, animation: `slideUp 0.35s ease ${i * 80}ms both` }}>
            {i === 0 && <div style={{ fontSize: 9, fontWeight: 800, color: card.accent, letterSpacing: 1, marginBottom: 10 }}>⭐ BEST CHOICE</div>}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ flex: "0 0 40px", height: 26, borderRadius: 8, background: `linear-gradient(135deg,${card.color[0]},${card.color[1]})`, marginRight: 12 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{card.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>•••• {card.last4}{card.supportsQR && <span style={{ color: "#c084fc", marginLeft: 6 }}>· RuPay QR ✓</span>}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: card.accent, fontWeight: 800, fontSize: 16 }}>{rate}X</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  {(card.pointValue || 0) >= 1
                    ? `+₹${value.toFixed(0)} cashback`
                    : `+${pts} pts (~₹${value.toFixed(0)})`}
                </div>
              </div>
            </div>
            {offer && <div style={{ display: "flex", alignItems: "center", marginTop: 10, background: "rgba(52,232,158,0.06)", borderRadius: 8, padding: "6px 10px" }}>
              <span>{offer.icon}</span>
              <span style={{ marginLeft: 6, fontSize: 11, color: "#f0e68c" }}>{offer.discount} on {offer.partner} · Exp {offer.expiry}</span>
            </div>}
            {card.supportsQR && txnType === "qr" && <button onClick={() => onQRPay(card)} style={{ ...M.btn, marginTop: 10, padding: "10px", fontSize: 13, background: "linear-gradient(90deg,#6c3fc7,#c084fc)" }}>⬛ Open QR Scanner →</button>}
          </div>
        ))}
      </>}
    </div>
  );
}

// ─── MARK PAID MODAL ──────────────────────────────────────────────────────────
function MarkPaidModal({ card, onConfirm, onClose }) {
  const [mode, setMode]     = useState("full"); // "full" | "min" | "custom"
  const [custom, setCustom] = useState("");

  const amount = mode === "full" ? card.totalDue : mode === "min" ? card.minDue : parseFloat(custom) || 0;

  return (
    <div style={{ ...M.overlay, alignItems: "center", padding: "0 16px" }} onClick={onClose}>
      <div style={{ ...M.sheet, borderRadius: 24, padding: 24, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Mark as Paid</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 14px", background: "#0d0d0d", borderRadius: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${card.color[0]},${card.color[1]})`, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{card.name}</div>
            <div style={{ fontSize: 11, color: "#666" }}>···· {card.last4}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#555" }}>outstanding</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e94560" }}>₹{card.totalDue.toLocaleString("en-IN")}</div>
          </div>
        </div>

        {/* Payment type selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "full", label: "Full payment", value: card.totalDue, color: "#34e89e" },
            { key: "min",  label: "Minimum due",  value: card.minDue,   color: "#f97316" },
            { key: "custom", label: "Custom",     value: null,           color: "#4286f4" },
          ].map(opt => (
            <button key={opt.key} onClick={() => setMode(opt.key)} style={{
              flex: 1, padding: "10px 6px", borderRadius: 12,
              border: `1px solid ${mode === opt.key ? opt.color : "#2a2a2a"}`,
              background: mode === opt.key ? `${opt.color}18` : "transparent",
              color: mode === opt.key ? opt.color : "#555",
              fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center",
            }}>
              <div>{opt.label}</div>
              {opt.value != null && <div style={{ fontSize: 13, marginTop: 2 }}>₹{opt.value.toLocaleString("en-IN")}</div>}
            </button>
          ))}
        </div>

        {mode === "custom" && (
          <input
            type="number" placeholder="Enter amount paid" value={custom}
            onChange={e => setCustom(e.target.value)}
            style={{ ...ST.input, width: "100%", marginBottom: 16, boxSizing: "border-box" }}
            autoFocus
          />
        )}

        <button
          onClick={() => amount > 0 && onConfirm(card.id, amount, mode)}
          disabled={amount <= 0}
          style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: amount > 0 ? "linear-gradient(90deg,#34e89e,#4286f4)" : "#1e1e1e", color: amount > 0 ? "#000" : "#444", fontWeight: 800, fontSize: 15, cursor: amount > 0 ? "pointer" : "not-allowed" }}>
          ✓ Paid ₹{amount > 0 ? amount.toLocaleString("en-IN") : "—"}
        </button>
      </div>
    </div>
  );
}

// ─── BILLS TAB ────────────────────────────────────────────────────────────────
function BillsTab({ cards, txns, onViewBill, onMarkPaid }) {
  const [payingCard, setPayingCard] = useState(null);

  if (cards.length === 0) return <div style={{ textAlign: "center", padding: "80px 20px" }}><div style={{ fontSize: 48, marginBottom: 16 }}>🗓️</div><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No cards added</div><div style={{ fontSize: 14, color: "#555" }}>Add cards from the Cards tab to track bills</div></div>;

  const sorted = [...cards].sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate));
  const totalDue = cards.reduce((s, c) => s + (c.totalDue || 0), 0);
  const totalMin = cards.reduce((s, c) => s + (c.minDue || 0), 0);

  // Unbilled = manually added (sms/manual) transactions per card
  const getUnbilled = (card) => txns.filter(t =>
    t.cardId === card.id && (t.source === "sms" || t.source === "manual") && t.type !== "credit"
  );
  const totalUpcoming = cards.reduce((s, c) => s + getUnbilled(c).reduce((a, t) => a + t.amount, 0), 0);

  return (
    <div>
      {payingCard && (
        <MarkPaidModal
          card={payingCard}
          onConfirm={(id, amount, mode) => { onMarkPaid(id, amount, mode); setPayingCard(null); }}
          onClose={() => setPayingCard(null)}
        />
      )}

      <div style={S.secLabel}>UPCOMING BILLS</div>
      <div style={{ background: "#111", borderRadius: 20, padding: "20px", marginBottom: 16, border: "1px solid #1e1e1e" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>TOTAL OUTSTANDING</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#e94560", marginTop: 4 }}>{fmtCurrency(totalDue)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>MIN TOTAL DUE</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f97316", marginTop: 4 }}>{fmtCurrency(totalMin)}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <div style={{ flex: 1, background: "rgba(233,69,96,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#e94560" }}>PAY FULL BALANCE</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 4 }}>{fmtCurrency(totalDue)}</div>
          </div>
          <div style={{ flex: 1, background: "rgba(249,115,22,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#f97316" }}>MINIMUM PAYMENT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 4 }}>{fmtCurrency(totalMin)}</div>
          </div>
          {totalUpcoming > 0 && (
            <div style={{ flex: 1, background: "rgba(196,132,252,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#c084fc" }}>UPCOMING</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 4 }}>{fmtCurrency(totalUpcoming)}</div>
            </div>
          )}
        </div>
      </div>

      {sorted.map((card, i) => {
        const days = getDaysUntil(card.dueDate);
        const urgency = days <= 3 ? "#e94560" : days <= 7 ? "#f97316" : "#34e89e";
        const pct = card.limit > 0 ? (card.spent / card.limit) * 100 : 0;
        const isPaid = (card.totalDue || 0) === 0;
        const unbilledTxns = getUnbilled(card);
        const unbilledAmt  = unbilledTxns.reduce((s, t) => s + t.amount, 0);
        return (
          <div key={card.id}
            style={{ background: "#111", borderRadius: 16, padding: "16px", marginBottom: 10, border: `1px solid ${isPaid ? "#1e3a1e" : days <= 3 ? "#e94560" : days <= 7 ? "#f97316" : "#1e1e1e"}`, animation: `slideUp 0.35s ease ${i * 80}ms both` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }} onClick={() => onViewBill(card)}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg,${card.color[0]},${card.color[1]})`, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{card.name}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{card.billCycle ? `Cycle closes ${card.billCycle}` : "—"}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: isPaid ? "#34e89e" : "#e94560" }}>{isPaid ? "✓ Paid" : fmtCurrency(card.totalDue)}</div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{isPaid ? "cleared" : "total due"}</div>
              </div>
            </div>

            {/* Upcoming / unbilled transactions */}
            {unbilledAmt > 0 && (
              <div style={{ marginTop: 10, background: "rgba(196,132,252,0.07)", border: "1px solid #2a1a3a", borderRadius: 10, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#c084fc", fontWeight: 700, letterSpacing: 0.5 }}>⏳ UPCOMING OUTSTANDING</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{unbilledTxns.length} txn{unbilledTxns.length !== 1 ? "s" : ""} not yet in statement</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#c084fc" }}>{fmtCurrency(unbilledAmt)}</div>
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, height: 4, background: "#1e1e1e", borderRadius: 2 }}>
                <div style={{ width: `${Math.max(0, Math.min(100, (14 - days) / 14 * 100))}%`, height: "100%", background: isPaid ? "#34e89e" : urgency, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: isPaid ? "#34e89e" : urgency, whiteSpace: "nowrap" }}>
                {isPaid ? "Bill cleared" : days <= 0 ? "OVERDUE!" : days === 1 ? "Due tomorrow" : `Due in ${days}d`} · {fmtDate(card.dueDate)}
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Min due: <span style={{ color: "#f97316", fontWeight: 700 }}>₹{(card.minDue || 0).toLocaleString()}</span></div>
              <div style={{ fontSize: 12, color: "#555" }}>Util: <span style={{ color: pct >= 80 ? "#e94560" : pct >= 60 ? "#f97316" : "#34e89e", fontWeight: 700 }}>{pct.toFixed(0)}%</span></div>
              {isPaid ? (
                <div style={{ fontSize: 11, color: "#34e89e", fontWeight: 700 }}>✓ Cleared</div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setPayingCard(card); }}
                  style={{ fontSize: 11, fontWeight: 700, color: "#000", background: "linear-gradient(90deg,#34e89e,#4286f4)", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
                  Mark Paid
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PDF PASSWORD MODAL ───────────────────────────────────────────────────────
function PDFPasswordModal({ isWrong, onSubmit, onClose }) {
  const [pw, setPw] = useState("");
  return (
    <div style={M.overlay}>
      <div style={M.sheet}>
        <div style={M.handle} />
        <div style={M.title}>🔒 PDF Password</div>
        <div style={M.subtitle}>{isWrong ? "Incorrect password — try again" : "This PDF is password protected"}</div>
        <input
          autoFocus type="password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSubmit(pw)}
          placeholder="Enter PDF password"
          style={{ ...ST.input, margin: "16px 0" }}
        />
        <button onClick={() => onSubmit(pw)} style={M.btn}>Unlock & Parse</button>
        <button onClick={onClose} style={M.ghost}>Cancel</button>
      </div>
    </div>
  );
}

// ─── STATEMENT REVIEW MODAL ───────────────────────────────────────────────────
function StatementReviewModal({ parsedTxns, rawLines, billing, identity, cards, onImport, onClose }) {
  // Auto-match: try last4 first, then single card from same bank
  const autoMatch = identity
    ? (cards.find(c => identity.last4 && c.last4 === identity.last4) ||
       (identity.bank && cards.filter(c => c.bank?.toLowerCase().includes(identity.bank.split(" ")[0].toLowerCase())).length === 1
         ? cards.find(c => c.bank?.toLowerCase().includes(identity.bank.split(" ")[0].toLowerCase()))
         : null))
    : null;

  const [cardId, setCardId]           = useState(autoMatch?.id ?? cards[0]?.id ?? "");
  const [items, setItems]             = useState(parsedTxns);
  const [saveBilling, setSaveBilling] = useState(!!(billing?.totalDue || billing?.dueDate));

  const toggle    = (i) => setItems(p => p.map((t, j) => j === i ? { ...t, selected: !t.selected } : t));
  const setCat    = (i, cat) => setItems(p => p.map((t, j) => j === i ? { ...t, category: cat, icon: categoryIcon(cat) } : t));
  const selectAll = (v) => setItems(p => p.map(t => ({ ...t, selected: v })));

  const selected   = items.filter(t => t.selected);
  const totalDebit = selected.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const totalCredit = selected.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0a", zIndex: 600, display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Statement Import</div>
          {identity?.bank || identity?.last4 ? (
            <div style={{ fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: autoMatch ? "#34e89e" : "#f97316" }}>{autoMatch ? "✓" : "?"}</span>
              <span style={{ color: "#aaa" }}>
                {identity.bank ?? "Unknown Bank"}
                {identity.last4 && !identity.last4.startsWith("X") ? ` •••• ${identity.last4}` : identity.last4 ? ` •••• ${identity.last4.slice(-4)}` : ""}
              </span>
              {autoMatch && <span style={{ color: "#555" }}>· auto-matched</span>}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{items.length} transactions found · {selected.length} selected</div>
          )}
        </div>
        <button
          onClick={() => onImport(cardId, selected, billing, saveBilling)}
          disabled={(!saveBilling && selected.length === 0) || !cardId}
          style={{ background: "linear-gradient(90deg,#4286f4,#34e89e)", border: "none", color: "#000", borderRadius: 12, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: (saveBilling || selected.length > 0) ? "pointer" : "not-allowed", opacity: (saveBilling || selected.length > 0) ? 1 : 0.4 }}>
          {selected.length > 0 ? `Import ${selected.length}` : "Save Billing"}
        </button>
      </div>

      {/* Card selector + summary */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e1e1e", flexShrink: 0, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", flex: 1 }}>
          {cards.map(c => (
            <button key={c.id} onClick={() => setCardId(c.id)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${cardId === c.id ? c.accent : "#2a2a2a"}`, background: cardId === c.id ? "#111" : "transparent", color: cardId === c.id ? c.accent : "#666", fontSize: 12, cursor: "pointer", flexShrink: 0, fontWeight: cardId === c.id ? 700 : 400 }}>
              {c.bank} {c.last4}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e94560" }}>₹{totalDebit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>DEBITS</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#34e89e" }}>₹{totalCredit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>CREDITS</div>
          </div>
        </div>
      </div>

      {/* Billing summary */}
      {billing && (billing.totalDue > 0 || billing.dueDate) && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e1e1e", background: "#0d0d0d", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            {billing.totalDue > 0 && <div><div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>TOTAL DUE</div><div style={{ fontSize: 16, fontWeight: 800, color: "#e94560" }}>₹{billing.totalDue.toLocaleString("en-IN")}</div></div>}
            {billing.minDue   > 0 && <div><div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>MIN DUE</div><div style={{ fontSize: 16, fontWeight: 800, color: "#f97316" }}>₹{billing.minDue.toLocaleString("en-IN")}</div></div>}
            {billing.dueDate       && <div><div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>DUE DATE</div><div style={{ fontSize: 16, fontWeight: 800, color: "#34e89e" }}>{fmtDate(billing.dueDate)}</div></div>}
            {billing.stmtDate      && <div><div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>STMT DATE</div><div style={{ fontSize: 15, fontWeight: 700, color: "#aaa" }}>{fmtDate(billing.stmtDate)}</div></div>}
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginLeft: "auto" }}>
              <input type="checkbox" checked={saveBilling} onChange={e => setSaveBilling(e.target.checked)} style={{ accentColor: "#34e89e", width: 14, height: 14 }} />
              <span style={{ fontSize: 11, color: "#aaa", whiteSpace: "nowrap" }}>Save to card</span>
            </label>
          </div>
        </div>
      )}

      {/* Select all / deselect — only when there are transactions */}
      {items.length > 0 && <div style={{ padding: "8px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", gap: 12, flexShrink: 0 }}>
        <button onClick={() => selectAll(true)}  style={{ fontSize: 12, background: "none", border: "none", color: "#4286f4", cursor: "pointer" }}>Select all</button>
        <button onClick={() => selectAll(false)} style={{ fontSize: 12, background: "none", border: "none", color: "#555",   cursor: "pointer" }}>Deselect all</button>
        <button onClick={() => selectAll(false) || setItems(p => p.map(t => ({ ...t, selected: t.type === "debit" })))}
          style={{ fontSize: 12, background: "none", border: "none", color: "#555", cursor: "pointer" }}>Debits only</button>
      </div>}

      {/* Transaction list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }} className="scroll-area">
        {items.length === 0 && (() => {
          const joinedRaw = (rawLines || []).join(" ").toLowerCase();
          const isLoanStmt = /payment advice.*loan|loan account|dial for cash|emi instalment|installment plan/i.test(joinedRaw);
          return (
            <div style={{ padding: "20px 0", color: "#555" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{isLoanStmt ? "🏦" : "🔍"}</div>
                {isLoanStmt ? (
                  <>
                    <div style={{ color: "#f97316", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Loan Account Statement</div>
                    <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, marginBottom: 18 }}>
                      This is a <b style={{ color: "#fff" }}>loan repayment advice</b> (e.g. Dial for Cash / EMI),<br />
                      not a credit card purchases statement.<br />
                      No purchase transactions to import — but the billing summary<br />
                      (Total Due, Min Due, Due Date) has been extracted above.
                    </div>
                    {billing && (billing.totalDue || billing.dueDate) && (
                      <button
                        onClick={() => onImport(cardId, [], billing, true)}
                        disabled={!cardId}
                        style={{ background: "linear-gradient(90deg,#4286f4,#34e89e)", border: "none", color: "#000", borderRadius: 14, padding: "12px 28px", fontWeight: 800, fontSize: 15, cursor: cardId ? "pointer" : "not-allowed", opacity: cardId ? 1 : 0.4 }}>
                        💾 Save Billing to Card
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ color: "#aaa", fontWeight: 600, marginBottom: 6 }}>No transactions matched</div>
                    <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                      Could not find transaction rows in this PDF.<br />
                      Make sure you uploaded a credit card <b style={{ color: "#999" }}>purchases statement</b>,<br />
                      not a payment receipt or account summary.
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
        {items.map((txn, i) => (
          <div key={i} onClick={() => toggle(i)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            borderRadius: 12, marginBottom: 6, cursor: "pointer",
            background: txn.selected ? "#111" : "transparent",
            border: `1px solid ${txn.selected ? "#2a2a2a" : "transparent"}`,
            opacity: txn.selected ? 1 : 0.45,
          }}>
            {/* Checkbox */}
            <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${txn.selected ? "#4286f4" : "#444"}`, background: txn.selected ? "#4286f4" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: "#fff" }}>
              {txn.selected ? "✓" : ""}
            </div>

            {/* Icon */}
            <div style={{ fontSize: 18, flexShrink: 0 }}>{txn.icon}</div>

            {/* Description + date */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txn.description}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{txn.date}</div>
            </div>

            {/* Category picker */}
            <select
              value={txn.category}
              onClick={e => e.stopPropagation()}
              onChange={e => { e.stopPropagation(); setCat(i, e.target.value); }}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa", borderRadius: 8, padding: "4px 6px", fontSize: 11, cursor: "pointer", maxWidth: 120 }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Amount + type */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, color: txn.type === "credit" ? "#34e89e" : "#fff", fontSize: 13 }}>
                {txn.type === "credit" ? "+" : "-"}₹{txn.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 10, color: txn.type === "credit" ? "#34e89e" : "#e94560", marginTop: 2, fontWeight: 700 }}>
                {txn.type === "credit" ? "CREDIT" : "DEBIT"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SMS TRANSACTION PARSER ───────────────────────────────────────────────────
function parseBankSMS(raw) {
  const amtM    = raw.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const amount  = amtM ? parseFloat(amtM[1].replace(/,/g, "")) : null;
  const cardM   = raw.match(/(?:XX|x{2,}|ending\s*(?:in\s*)?|card[^0-9]{0,10})(\d{4})\b/i);
  const last4   = cardM ? cardM[1] : null;
  const merchM  = raw.match(/(?:\bat\b|\bto\b)\s+([A-Z][A-Z0-9*&\s\-\.]{2,30?})(?=\s+on\b|\s+dated|\s+for\b|[.,]|$)/i);
  const merchant = merchM ? merchM[1].trim() : null;
  const isCredit = /credited|refund|cashback|reversed|reversal/i.test(raw);
  const datePatterns = [/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\b/, /\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b/, /\b([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\b/];
  let date = null;
  for (const p of datePatterns) { const m = raw.match(p); if (m) { date = m[1]; break; } }
  return { amount, last4, merchant, type: isCredit ? "credit" : "debit", date };
}

function SMSParseModal({ cards, onAdd, onClose }) {
  const [smsText, setSmsText]   = useState("");
  const [parsed, setParsed]     = useState(null);
  const [cardId, setCardId]     = useState(cards[0]?.id || "");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount]     = useState("");
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [type, setType]         = useState("debit");
  const [submitting, setSubmitting] = useState(false);

  // Auto-parse whenever SMS text changes
  useEffect(() => {
    if (!smsText.trim()) { setParsed(null); return; }
    const r = parseBankSMS(smsText);
    setParsed(r.amount || r.merchant ? r : null);
    if (r.amount)   setAmount(String(r.amount));
    if (r.merchant) setMerchant(r.merchant);
    if (r.type)     setType(r.type);
    if (r.date)     setDate(r.date);
    if (r.last4) {
      const match = cards.find(c => c.last4 === r.last4);
      if (match) setCardId(match.id);
    }
  }, [smsText]);

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={{ ...M.sheet, paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
        <div style={M.handle} />
        <div style={M.title}>Add from SMS / Alert</div>
        <div style={M.subtitle}>Paste your bank transaction SMS — fields fill automatically</div>
        <textarea
          value={smsText} onChange={e => setSmsText(e.target.value)}
          placeholder={"Example:\nYour HDFC Credit Card XX5870 used for Rs.450.00 at SWIGGY on 24-05-26."}
          style={{ width: "100%", minHeight: 90, background: "#0d0d0d", border: `1px solid ${parsed ? "#34e89e44" : "#2a2a2a"}`, borderRadius: 12, color: "#aaa", fontSize: 13, padding: "12px", boxSizing: "border-box", resize: "none", fontFamily: "inherit", marginBottom: parsed ? 12 : 0 }}
          autoFocus
        />
        {smsText.trim() && !parsed && (
          <div style={{ fontSize: 11, color: "#666", textAlign: "center", padding: "8px 0 12px" }}>
            Could not auto-detect fields — fill in manually below
          </div>
        )}

        {(parsed || smsText.trim()) && <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>MERCHANT</div>
              <input value={merchant} onChange={e => setMerchant(e.target.value)} style={{ ...ST.input, width: "100%", boxSizing: "border-box" }} placeholder="Merchant name" />
            </div>
            <div style={{ width: 110 }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>AMOUNT (₹)</div>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...ST.input, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>DATE</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...ST.input, width: "100%", boxSizing: "border-box", colorScheme: "dark" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>TYPE</div>
              <select value={type} onChange={e => setType(e.target.value)} style={{ ...ST.input, width: "100%", boxSizing: "border-box" }}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 1, marginBottom: 4 }}>CARD</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {cards.map(c => (
                <button key={c.id} onClick={() => setCardId(c.id)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${cardId === c.id ? c.accent : "#2a2a2a"}`, background: cardId === c.id ? "#111" : "transparent", color: cardId === c.id ? c.accent : "#555", fontSize: 11, cursor: "pointer", fontWeight: cardId === c.id ? 700 : 400 }}>
                  {c.name} ···· {c.last4}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={async () => {
              if (submitting || !merchant || !amount || !cardId) return;
              setSubmitting(true);
              await onAdd({ cardId, merchant, amount: parseFloat(amount), type, date, category: "Other", icon: "💳" });
              setSubmitting(false);
            }}
            disabled={submitting || !merchant || !amount || !cardId}
            style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: (merchant && amount && cardId && !submitting) ? "linear-gradient(90deg,#4286f4,#34e89e)" : "#1e1e1e", color: (merchant && amount && cardId && !submitting) ? "#000" : "#333", fontWeight: 800, fontSize: 15, cursor: (merchant && amount && cardId && !submitting) ? "pointer" : "not-allowed" }}>
            {submitting ? "Adding…" : "Add Transaction"}
          </button>
        </>}
      </div>
    </div>
  );
}

// ─── BUDGET TAB ───────────────────────────────────────────────────────────────
function BudgetTab({ txns, cards }) {
  const stored      = () => JSON.parse(localStorage.getItem("cardiq_budget") || "{}");
  const [limit, setLimit]       = useState(stored().monthlyLimit || 0);
  const [editing, setEditing]   = useState(!stored().monthlyLimit);
  const [inputVal, setInputVal] = useState(String(stored().monthlyLimit || ""));

  const save = () => {
    const v = parseFloat(inputVal) || 0;
    setLimit(v);
    localStorage.setItem("cardiq_budget", JSON.stringify({ monthlyLimit: v }));
    setEditing(false);
  };

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthName  = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const thisMonth  = txns.filter(t => t.type !== "credit" && t.date >= monthStart);
  const spent      = thisMonth.reduce((s, t) => s + (t.amount || 0), 0);
  const pct        = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const remaining  = limit - spent;
  const barColor   = pct >= 90 ? "#e94560" : pct >= 70 ? "#f97316" : "#34e89e";

  const catSpend = {};
  thisMonth.forEach(t => { catSpend[t.category] = (catSpend[t.category] || 0) + t.amount; });
  const topCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]);

  const catIcons = { Dining:"🍽️", Travel:"✈️", Fuel:"⛽", Shopping:"🛍️", Entertainment:"🎬", "Online Shopping":"📦", Groceries:"🛒", Other:"💳" };

  return (
    <div>
      <div style={S.secLabel}>MONTHLY SPEND BUDGET</div>

      {/* Limit setter */}
      <div style={{ background: "#111", borderRadius: 20, padding: 20, marginBottom: 16, border: "1px solid #1e1e1e" }}>
        {editing ? (
          <>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>Set your monthly spending limit across all cards</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && save()}
                placeholder="e.g. 50000" autoFocus
                style={{ ...ST.input, flex: 1, fontSize: 20, fontWeight: 800 }} />
              <button onClick={save} style={{ padding: "0 20px", borderRadius: 14, border: "none", background: "linear-gradient(90deg,#4286f4,#34e89e)", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Set</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>MONTHLY LIMIT</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", marginTop: 4 }}>{fmtCurrency(limit)}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{monthName}</div>
            </div>
            <button onClick={() => { setInputVal(String(limit)); setEditing(true); }}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#555", borderRadius: 10, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>Edit</button>
          </div>
        )}
      </div>

      {limit > 0 && (
        <>
          {/* Progress */}
          <div style={{ background: "#111", borderRadius: 20, padding: 20, marginBottom: 16, border: `1px solid ${pct >= 90 ? "#e94560" : "#1e1e1e"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>SPENT THIS MONTH</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: barColor, marginTop: 4 }}>{fmtCurrency(spent)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>{remaining >= 0 ? "REMAINING" : "OVER BUDGET"}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: remaining >= 0 ? "#34e89e" : "#e94560", marginTop: 4 }}>{fmtCurrency(Math.abs(remaining))}</div>
              </div>
            </div>
            <div style={{ height: 10, background: "#1e1e1e", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 5, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>{fmtCurrency(spent)} / {fmtCurrency(limit)}</span>
              <span style={{ fontSize: 11, color: barColor, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
            </div>
            {pct >= 80 && (
              <div style={{ marginTop: 12, background: pct >= 90 ? "rgba(233,69,96,0.1)" : "rgba(249,115,22,0.1)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: pct >= 90 ? "#e94560" : "#f97316", fontWeight: 600 }}>
                {pct >= 90 ? "🚨 You've nearly hit your monthly limit!" : "⚠️ You're approaching your monthly limit"}
              </div>
            )}
          </div>

          {/* Per-card breakdown */}
          <div style={S.secLabel}>SPEND BY CARD</div>
          {cards.map(card => {
            const cardSpent = thisMonth.filter(t => t.cardId === card.id).reduce((s, t) => s + t.amount, 0);
            if (!cardSpent) return null;
            const cp = limit > 0 ? (cardSpent / limit) * 100 : 0;
            return (
              <div key={card.id} style={{ background: "#111", borderRadius: 14, padding: "14px 16px", marginBottom: 8, border: "1px solid #1e1e1e" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 32, height: 20, borderRadius: 4, background: `linear-gradient(135deg,${card.color[0]},${card.color[1]})` }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{card.name}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: card.accent }}>{fmtCurrency(cardSpent)}</div>
                </div>
                <div style={{ height: 4, background: "#1e1e1e", borderRadius: 2 }}>
                  <div style={{ width: `${Math.min(cp, 100)}%`, height: "100%", background: card.accent, borderRadius: 2 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#555" }}>{fmtCurrency(cardSpent)} / {fmtCurrency(limit)}</span>
                  <span style={{ fontSize: 10, color: card.accent, fontWeight: 700 }}>{cp.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}

          {/* Per-category breakdown */}
          {topCats.length > 0 && <>
            <div style={S.secLabel}>SPEND BY CATEGORY</div>
            {topCats.map(([cat, catAmt]) => {
              const cp = limit > 0 ? (catAmt / limit) * 100 : 0;
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 20, flexShrink: 0 }}>{catIcons[cat] || "💳"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{cat}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtCurrency(catAmt)}</span>
                    </div>
                    <div style={{ height: 4, background: "#1e1e1e", borderRadius: 2 }}>
                      <div style={{ width: `${Math.min(cp, 100)}%`, height: "100%", background: "#4286f4", borderRadius: 2 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: "#555" }}>{fmtCurrency(catAmt)} of {fmtCurrency(limit)}</span>
                      <span style={{ fontSize: 10, color: "#4286f4", fontWeight: 700 }}>{cp.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>}
        </>
      )}

      {/* SMS / Unbilled section */}
      <div style={S.secLabel}>UNBILLED TRANSACTIONS</div>
      <div style={{ background: "#111", borderRadius: 16, padding: 16, border: "1px solid #1e1e1e" }}>
        <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
          Banks don't expose real-time APIs publicly. The fastest way to track unbilled spends is to <b style={{ color: "#fff" }}>paste the transaction SMS/alert</b> your bank sends for every purchase — go to <b style={{ color: "#4286f4" }}>Transactions → Add from SMS</b>.
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["HDFC", "ICICI", "SBI", "Axis", "RBL"].map(b => (
            <span key={b} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 20, padding: "4px 12px", fontSize: 11, color: "#555" }}>✓ {b}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TRANSACTIONS TAB ─────────────────────────────────────────────────────────
function TransactionsTab({ txns, cards, onAdd, onUploadStatement, onAddFromSMS }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? txns : filter === "qr" ? txns.filter(t => t.type === "qr") : txns.filter(t => t.cardId === filter);
  const totalSpent = filtered.reduce((s, t) => s + t.amount, 0);
  const totalPts = filtered.reduce((s, t) => s + (t.points || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, marginTop: 4, gap: 8, flexWrap: "wrap" }}>
        <div style={S.secLabel}>TRANSACTIONS</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onUploadStatement} style={{ background: "#1a1a2e", border: "1px solid #c084fc", color: "#c084fc", borderRadius: 12, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📄 Statement</button>
          <button onClick={onAddFromSMS} style={{ background: "#1a1a2e", border: "1px solid #34e89e", color: "#34e89e", borderRadius: 12, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📱 SMS</button>
          <button onClick={onAdd} style={{ background: "#0d1a33", border: "1px solid #4286f4", color: "#4286f4", borderRadius: 12, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Log</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[[fmtCurrency(totalSpent), "#e94560", "SPENT"], [totalPts.toLocaleString(), "#34e89e", "POINTS EARNED"], [txns.filter(t => t.type === "qr").length + "", "#c084fc", "QR TXNs"]].map(([v, c, l]) => (
          <div key={l} style={{ flex: 1, background: "#111", borderRadius: 14, padding: "12px 10px", border: "1px solid #1e1e1e", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 9, color: "#555", marginTop: 4, letterSpacing: 1 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        {[["all", "All"], ["qr", "QR/UPI"], ...cards.map(c => [c.id, c.bank + " " + c.last4])].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${filter === v ? "#4286f4" : "#2a2a2a"}`, background: filter === v ? "#0d1a33" : "transparent", color: filter === v ? "#4286f4" : "#555", fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>

      {filtered.map((txn, i) => {
        const card = cards.find(c => c.id === txn.cardId);
        return (
          <div key={txn.id} style={{ background: "#111", borderRadius: 14, padding: "13px 15px", marginBottom: 8, border: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 12, animation: `slideUp 0.3s ease ${Math.min(i, 8) * 40}ms both` }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${card?.color[0] || "#111"},${card?.color[1] || "#333"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
              {txn.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "#fff", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txn.merchant}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                {txn.category} · {txn.date}
                {txn.type === "qr" && <span style={{ color: "#c084fc", marginLeft: 6 }}>⬛ QR</span>}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{card?.name} •••• {card?.last4}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 800, color: "#fff", fontSize: 15 }}>₹{txn.amount.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: card?.accent || "#34e89e", marginTop: 2 }}>+{txn.points || 0} pts</div>
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <div style={{ textAlign: "center", color: "#555", fontSize: 14, padding: "60px 0" }}>No transactions found</div>}
    </div>
  );
}

// ─── INSIGHTS TAB ─────────────────────────────────────────────────────────────
function InsightsTab({ cards, txns, totalLimit, totalSpent, totalAvailable }) {
  if (cards.length === 0) return <div style={{ textAlign: "center", padding: "80px 20px" }}><div style={{ fontSize: 48, marginBottom: 16 }}>📊</div><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No data yet</div><div style={{ fontSize: 14, color: "#555" }}>Add cards and transactions to see insights</div></div>;

  const totalPoints = cards.reduce((s, c) => s + c.points, 0);
  const totalValue = cards.reduce((s, c) => s + c.points * c.pointValue, 0);
  const catSpend = {};
  txns.forEach(t => { catSpend[t.category] = (catSpend[t.category] || 0) + t.amount; });
  const topCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = topCats[0]?.[1] || 1;
  const utilPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  return (
    <div>
      <div style={S.secLabel}>CREDIT HEALTH</div>
      <div style={{ background: "#111", borderRadius: 20, padding: "20px", border: "1px solid #1e1e1e", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "#666", letterSpacing: 1 }}>TOTAL LIMIT</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", marginTop: 4 }}>{fmtCurrency(totalLimit)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#666", letterSpacing: 1 }}>CREDIT SCORE RISK</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: utilPct < 30 ? "#34e89e" : utilPct < 60 ? "#f97316" : "#e94560", marginTop: 4 }}>
              {utilPct < 30 ? "LOW" : utilPct < 60 ? "MEDIUM" : "HIGH"}
            </div>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, overflow: "hidden", background: "#1e1e1e", display: "flex", marginBottom: 12 }}>
          {cards.map(c => <div key={c.id} style={{ width: `${(c.spent / totalLimit) * 100}%`, background: c.accent }} />)}
        </div>
        {cards.map(c => (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#ccc" }}>{c.name}</span>
              <span style={{ fontSize: 11, color: "#666" }}>{fmtCurrency(c.spent)} / {fmtCurrency(c.limit)} · {((c.spent / c.limit) * 100).toFixed(0)}%</span>
            </div>
            <div style={{ height: 4, background: "#1e1e1e", borderRadius: 2 }}>
              <div style={{ width: `${(c.spent / c.limit) * 100}%`, height: "100%", background: c.accent, borderRadius: 2 }} />
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 16, paddingTop: 16, borderTop: "1px solid #1e1e1e" }}>
          {[[fmtCurrency(totalAvailable), "#34e89e", "AVAILABLE"], [fmtCurrency(totalSpent), "#e94560", "USED"], [cards.filter(c => c.supportsQR).length + "", "#c084fc", "QR-ENABLED"], [cards.length + "", "#fff", "CARDS"]].map(([v, c, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 1, marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {topCats.length > 0 && <>
        <div style={S.secLabel}>SPEND BY CATEGORY</div>
        <div style={{ background: "#111", borderRadius: 16, padding: "16px", border: "1px solid #1e1e1e", marginBottom: 16 }}>
          {topCats.map(([cat, amt], i) => (
            <div key={cat} style={{ marginBottom: i < topCats.length - 1 ? 14 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>{cat}</span>
                <span style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>₹{amt.toLocaleString()}</span>
              </div>
              <div style={{ height: 6, background: "#1e1e1e", borderRadius: 3 }}>
                <div style={{ width: `${(amt / maxCat) * 100}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#4286f4,#34e89e)" }} />
              </div>
            </div>
          ))}
        </div>
      </>}

      <div style={S.secLabel}>POINTS PORTFOLIO</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[[totalPoints.toLocaleString(), "#fff", "Total Points"], ["₹" + totalValue.toFixed(0), "#34e89e", "Points Value"]].map(([v, c, l]) => (
          <div key={l} style={{ background: "#111", borderRadius: 16, padding: "16px", border: "1px solid #1e1e1e" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 6, letterSpacing: 1 }}>{l.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {cards.map((card, i) => (
        <div key={card.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#111", borderRadius: 14, padding: "12px 14px", marginBottom: 8, border: "1px solid #1e1e1e", animation: `slideUp 0.35s ease ${i * 80}ms both` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>{card.name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{(card.points || 0).toLocaleString()} pts · ₹{((card.points || 0) * card.pointValue).toFixed(0)} value</div>
          </div>
          <div style={{ width: 120 }}>
            <div style={{ height: 6, background: "#1e1e1e", borderRadius: 3 }}>
              <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${card.color[1]},${card.accent})`, width: totalPoints > 0 ? `${((card.points || 0) / totalPoints) * 100}%` : "0%" }} />
            </div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 3, textAlign: "right" }}>{totalPoints > 0 ? (((card.points || 0) / totalPoints) * 100).toFixed(0) : 0}%</div>
          </div>
        </div>
      ))}

      <div style={S.secLabel}>BEST CARD BY CATEGORY</div>
      {categories.slice(0, 5).map((cat, i) => {
        const key = categoryRewardKey[cat];
        const best = cards.reduce((a, b) => (a.rewardRate[key] || 1) >= (b.rewardRate[key] || 1) ? a : b);
        const icons = ["🍽️", "✈️", "⛽", "🛍️", "🎬"];
        return (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, background: "#111", borderRadius: 14, padding: "12px 14px", marginBottom: 8, border: "1px solid #1e1e1e", animation: `slideUp 0.35s ease ${i * 60}ms both` }}>
            <div style={{ fontSize: 18 }}>{icons[i]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: "#ddd", fontWeight: 600 }}>{cat}</div></div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: best.accent, fontWeight: 700 }}>{best.name}</div>
              <div style={{ fontSize: 11, color: "#666" }}>{best.rewardRate[key]}X points</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function CardIQ() {
  const width = useWindowWidth();
  const isDesktop = width >= 900;

  const [cards, setCards]     = useState([]);
  const [txns, setTxns]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId]   = useState(null);
  const [activeTab, setActiveTab]     = useState(0);
  const [selectedCard, setSelectedCard] = useState(null);
  const [category, setCategory]   = useState("Dining");
  const [amount, setAmount]       = useState("1000");
  const [txnType, setTxnType]     = useState("card");
  const [recommendations, setRecommendations] = useState(null);
  const [animIn, setAnimIn]       = useState(true);
  const [qrCard, setQrCard]       = useState(null);
  const [billCard, setBillCard]   = useState(null);
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [parsedStatement, setParsedStatement] = useState(null);
  const [statementParsing, setStatementParsing] = useState(false);
  const [pendingPDFFile, setPendingPDFFile]   = useState(null);
  const [pdfPasswordErr, setPdfPasswordErr]   = useState(null); // "PASSWORD_NEEDED" | "PASSWORD_WRONG"
  const [rblAutoSaved, setRblAutoSaved]       = useState(null); // { bank, totalDue, minDue, dueDate }
  const [reconcileResult, setReconcileResult] = useState(null); // { merged, added, card }
  const fileInputRef = useRef(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [editCard, setEditCard]   = useState(null);
  const [showSMSModal, setShowSMSModal] = useState(false);

  const [dbError, setDbError] = useState(null);

  // ── Load from Supabase ────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) { console.error("Auth error:", userErr); }
      if (!user) return;
      setUserId(user.id);
      const [{ data: cardRows, error: cardErr }, { data: txnRows, error: txnErr }] = await Promise.all([
        supabase.from("cards").select("id, data").eq("user_id", user.id).order("created_at"),
        supabase.from("transactions").select("id, card_id, data").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (cardErr) {
        console.error("Cards load error:", cardErr);
        setDbError(cardErr);
      }
      if (txnErr) console.error("Txns load error:", txnErr);
      setCards((cardRows || []).map(r => {
        const stored = { ...r.data, id: r.id };
        // Merge live CARD_DB fields (pointValue, isCashback, rewardRate) so DB records
        // stay up-to-date even if the card was added before these fields existed.
        const dbDef = CARD_DB.find(c => c.slug === stored.slug);
        if (dbDef) {
          stored.pointValue  = dbDef.pointValue;
          stored.isCashback  = dbDef.isCashback ?? false;
          stored.rewardRate  = dbDef.rewardRate;
        }
        return stored;
      }));
      setTxns((txnRows  || []).map(r => ({ ...r.data, id: r.id, cardId: r.card_id })));
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    setAnimIn(false);
    const t = setTimeout(() => setAnimIn(true), 50);
    return () => clearTimeout(t);
  }, [activeTab]);

  useEffect(() => {
    if (!rblAutoSaved) return;
    const t = setTimeout(() => setRblAutoSaved(null), 4000);
    return () => clearTimeout(t);
  }, [rblAutoSaved]);

  useEffect(() => {
    if (!reconcileResult) return;
    const t = setTimeout(() => setReconcileResult(null), 5000);
    return () => clearTimeout(t);
  }, [reconcileResult]);

  const totalLimit     = cards.reduce((s, c) => s + c.limit, 0);
  const totalSpent     = cards.reduce((s, c) => s + c.spent, 0);
  const totalAvailable = totalLimit - totalSpent;

  const handleAnalyze = () => {
    const amt = parseFloat(amount) || 0;
    setRecommendations(getBestCard(category, amt, txnType, cards));
  };

  const handleAddTxn = async (txn) => {
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const updatedCard = cards.find(c => c.id === txn.cardId);
    if (updatedCard) {
      const newCard = {
        ...updatedCard,
        spent:    updatedCard.spent    + txn.amount,
        points:   (updatedCard.points || 0) + (txn.points || 0),
        totalDue: updatedCard.totalDue + txn.amount,
        minDue:   Math.floor((updatedCard.totalDue + txn.amount) * 0.05),
      };
      setCards(prev => prev.map(c => c.id === txn.cardId ? newCard : c));
      const { id, ...cardData } = newCard;
      supabase.from("cards").update({ data: cardData }).eq("id", id);
    }
    const { cardId, id: _id, ...txnData } = txn;
    const { data: rows } = await supabase
      .from("transactions")
      .insert({ user_id: userId, card_id: cardId, data: { ...txnData, date: today, source: "manual" } })
      .select("id, card_id, data");
    if (rows?.[0]) {
      const r = rows[0];
      setTxns(prev => [{ ...r.data, id: r.id, cardId: r.card_id }, ...prev]);
    }
  };

  const handleQRTxn = (txn) => {
    handleAddTxn({ ...txn, points: Math.floor(txn.amount / 100 * 2) });
  };

  const handleSaveCard = async (card) => {
    const { id, ...data } = card;
    if (editCard) {
      setCards(prev => prev.map(c => c.id === id ? card : c));
      setEditCard(null);
      const { error } = await supabase.from("cards").update({ data }).eq("id", id);
      if (error) {
        console.error("Update failed:", error);
        // Reload from DB to revert optimistic update
        const { data: fresh } = await supabase.from("cards").select("id, data").eq("id", id).single();
        if (fresh) setCards(prev => prev.map(c => c.id === id ? { ...fresh.data, id: fresh.id } : c));
      }
    } else {
      const { data: rows, error } = await supabase
        .from("cards")
        .insert({ user_id: userId, data })
        .select("id, data");
      if (error) {
        console.error("Insert failed:", error);
      } else if (rows?.[0]) {
        const r = rows[0];
        setCards(prev => [...prev, { ...r.data, id: r.id }]);
      }
      setShowAddCard(false);
    }
  };

  const handleDeleteCard = async (id) => {
    setCards(prev => prev.filter(c => c.id !== id));
    setTxns(prev  => prev.filter(t => t.cardId !== id));
    setSelectedCard(null);
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) {
      console.error("Delete failed:", error);
      // Reload to restore card if delete failed
      const { data: fresh } = await supabase.from("cards").select("id, data").eq("id", id).single();
      if (fresh) setCards(prev => [...prev, { ...fresh.data, id: fresh.id }]);
    }
  };

  const handleSignOut = () => supabase.auth.signOut();

  // ── Statement upload ───────────────────────────────────────────────────────
  const processPDF = async (file, password) => {
    const lines    = await extractPDFLines(file, password);
    console.log("📄 PDF lines:", lines.length, lines.slice(0, 40));
    const txns     = parsePDFTxns(lines);
    const billing  = parseBillingSummary(lines);
    const identity = parseCardIdentity(lines);
    console.log("✅ Parsed:", txns.length, "txns | billing:", billing, "| identity:", identity);
    setPendingPDFFile(null);
    setPdfPasswordErr(null);

    // RBL: auto-save billing without showing the modal
    if (identity?.bank === "RBL Bank" && billing && (billing.totalDue > 0 || billing.dueDate)) {
      const rblCard = cards.find(c => (c.last4 && identity.last4 && c.last4 === identity.last4 && c.bank === "RBL Bank") || c.bank === "RBL Bank");
      if (rblCard) {
        const updated = {
          ...rblCard,
          ...(billing.totalDue > 0 && { totalDue: billing.totalDue, spent: billing.totalDue }),
          ...(billing.minDue   > 0 && { minDue: billing.minDue }),
          ...(billing.dueDate       && { dueDate: billing.dueDate }),
          ...(billing.stmtDate      && { stmtDate: billing.stmtDate }),
        };
        setCards(prev => prev.map(c => c.id === rblCard.id ? updated : c));
        await supabase.from("cards").update({ data: updated }).eq("id", rblCard.id);
        setRblAutoSaved({ bank: "RBL Bank", totalDue: billing.totalDue, minDue: billing.minDue, dueDate: billing.dueDate });
        return;
      }
    }

    setParsedStatement({ txns, rawLines: lines, billing, identity });
  };

  const handleStatementFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatementParsing(true);
    try {
      await processPDF(file, undefined);
    } catch (err) {
      if (err.isPasswordError) {
        setPendingPDFFile(file);
        setPdfPasswordErr(err.message);
      } else {
        console.error("PDF parse error:", err);
        alert("Could not parse this PDF. Make sure it's a text-based (not scanned) credit card statement.");
      }
    } finally {
      setStatementParsing(false);
    }
  };

  const handlePasswordSubmit = async (password) => {
    const file = pendingPDFFile;
    setPendingPDFFile(null);
    setPdfPasswordErr(null);
    setStatementParsing(true);
    try {
      await processPDF(file, password);
    } catch (err) {
      if (err.isPasswordError) {
        setPendingPDFFile(file);
        setPdfPasswordErr(err.message);
      } else {
        alert("Could not parse this PDF.");
      }
    } finally {
      setStatementParsing(false);
    }
  };

  const handleImportStatement = async (cardId, selectedTxns, billing, saveBilling) => {
    setParsedStatement(null);
    const card = cards.find(c => c.id === cardId);
    const noPointsPattern = /emi|[csig]st|\btax\b|service charge|annual fee|joining fee|renewal fee|overlimit|cash advance|processing fee|insurance premium|finance charge|\bloan\b|instaloan/i;

    // ── Deduplication: match SMS/manual entries against statement rows ──────────
    // Unbilled txns currently in state for this card
    const existingUnbilled = txns.filter(t =>
      t.cardId === cardId && (t.source === "sms" || t.source === "manual") && t.type !== "credit"
    );
    const matchedIds = new Set(); // IDs of unbilled txns reconciled with this statement
    let mergedCount = 0;
    let addedCount  = 0;

    for (const txn of selectedTxns) {
      if (txn.type !== "debit") continue;

      // Find an unmatched existing unbilled txn with the same amount (within ₹1 rounding)
      const match = existingUnbilled.find(t =>
        !matchedIds.has(t.id) && Math.abs(t.amount - txn.amount) < 1
      );

      if (match) {
        // ── MERGE: upgrade existing unbilled txn to confirmed statement entry ──
        matchedIds.add(match.id);
        mergedCount++;
        const key    = categoryRewardKey[txn.category] || "other";
        const rate   = card?.rewardRate?.[key] || 1;
        const isCb   = (card?.pointValue || 0) >= 1;
        const points = noPointsPattern.test(txn.description) ? 0
          : isCb ? Math.round(txn.amount * rate / 100)
          : Math.floor((txn.amount / 100) * rate);
        const merged = { ...match, merchant: txn.description || match.merchant, category: txn.category,
          icon: txn.icon, points, date: txn.date, source: "statement" };
        await supabase.from("transactions").update({ data: merged }).eq("id", match.id);
        setTxns(prev => prev.map(t => t.id === match.id ? { ...merged, id: t.id, cardId: t.cardId } : t));
      } else {
        // ── NEW: insert as a fresh statement transaction ───────────────────────
        addedCount++;
        const key    = categoryRewardKey[txn.category] || "other";
        const rate   = card?.rewardRate?.[key] || 1;
        const isCb   = (card?.pointValue || 0) >= 1;
        const points = noPointsPattern.test(txn.description) ? 0
          : isCb ? Math.round(txn.amount * rate / 100)
          : Math.floor((txn.amount / 100) * rate);
        const { data: rows } = await supabase
          .from("transactions")
          .insert({ user_id: userId, card_id: cardId, data: { merchant: txn.description, category: txn.category, amount: txn.amount, type: "card", icon: txn.icon, points, date: txn.date, source: "statement" } })
          .select("id, card_id, data");
        if (rows?.[0]) {
          const r = rows[0];
          setTxns(prev => [{ ...r.data, id: r.id, cardId: r.card_id }, ...prev]);
        }
      }
    }

    // ── Update card billing info ───────────────────────────────────────────────
    if (saveBilling && billing && card) {
      // Any remaining unbilled (unmatched) txns are genuinely from the NEXT cycle.
      // Add them on top of the statement total so they don't get wiped.
      const unmatchedAmt = existingUnbilled
        .filter(t => !matchedIds.has(t.id))
        .reduce((s, t) => s + t.amount, 0);

      const baseDue = billing.totalDue > 0 ? billing.totalDue : card.totalDue;
      const updated = {
        ...card,
        totalDue: baseDue + unmatchedAmt,
        spent:    baseDue + unmatchedAmt,
        ...(billing.minDue  > 0  && { minDue:    billing.minDue }),
        ...(billing.dueDate      && { dueDate:   billing.dueDate }),
        ...(billing.stmtDate     && { stmtDate:  billing.stmtDate }),
      };
      setCards(prev => prev.map(c => c.id === cardId ? updated : c));
      await supabase.from("cards").update({ data: updated }).eq("id", cardId);
    }

    // Show reconciliation result toast
    if (mergedCount > 0 || addedCount > 0) {
      setReconcileResult({ merged: mergedCount, added: addedCount, card: card?.name });
    }
  };

  const handleMarkPaid = async (cardId, amountPaid, _mode) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const remaining = Math.max(0, (card.totalDue || 0) - amountPaid);
    const updated = {
      ...card,
      totalDue: remaining,
      minDue:   remaining > 0 ? Math.min(card.minDue || 0, remaining) : 0,
      spent:    Math.max(0, (card.spent || 0) - amountPaid),
    };
    setCards(prev => prev.map(c => c.id === cardId ? updated : c));
    await supabase.from("cards").update({ data: updated }).eq("id", cardId);
  };

  const handleSMSAdd = async (txn) => {
    const { cardId, ...rest } = txn;
    const card = cards.find(c => c.id === cardId);
    // Calculate reward points same way as statement import
    const noPointsPattern = /emi|[csig]st|\btax\b|service charge|annual fee|joining fee|renewal fee|overlimit|cash advance|processing fee|insurance premium|finance charge|\bloan\b|instaloan/i;
    const key    = categoryRewardKey[rest.category] || "other";
    const rate   = card?.rewardRate?.[key] || 1;
    const isCb   = (card?.pointValue || 0) >= 1;
    const points = (rest.type !== "debit" || noPointsPattern.test(rest.merchant || "")) ? 0
      : isCb ? Math.round(rest.amount * rate / 100)
      : Math.floor((rest.amount / 100) * rate);

    const { data: rows } = await supabase
      .from("transactions")
      .insert({ user_id: userId, card_id: cardId, data: { ...rest, points, source: "sms" } })
      .select("id, card_id, data");
    if (rows?.[0]) {
      const r = rows[0];
      setTxns(prev => [{ ...r.data, id: r.id, cardId: r.card_id }, ...prev]);
    }
    if (card && rest.type === "debit") {
      const updated = { ...card, spent: card.spent + rest.amount, totalDue: card.totalDue + rest.amount,
        points: (card.points || 0) + points };
      setCards(prev => prev.map(c => c.id === cardId ? updated : c));
      const { id, ...data } = updated;
      supabase.from("cards").update({ data }).eq("id", id);
    }
    setShowSMSModal(false);
  };

  const now   = new Date();
  const hour  = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", flexDirection: "column" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
      <div style={{ color: "#555", fontSize: 14 }}>Loading your cards…</div>
    </div>
  );

  // Show DB setup error banner if Supabase tables are missing / access denied
  const dbErrorBanner = dbError ? (
    <div style={{ background: "#2a0a00", border: "1px solid #e94560", borderRadius: 14, padding: "14px 18px", margin: "16px 0", fontSize: 13 }}>
      <div style={{ color: "#e94560", fontWeight: 700, marginBottom: 6 }}>⚠️ Database Error — {dbError.code}</div>
      <div style={{ color: "#f87171", marginBottom: 10 }}>{dbError.message}</div>
      {(dbError.code === "42P01" || dbError.message?.includes("does not exist")) && (
        <div style={{ color: "#aaa", fontSize: 12 }}>
          The database tables don't exist yet. Go to{" "}
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{ color: "#4286f4" }}>Supabase Dashboard</a>
          {" → SQL Editor"} and run the <code style={{ color: "#34e89e", background: "#0d2a1a", padding: "1px 5px", borderRadius: 4 }}>supabase/schema.sql</code> file.
        </div>
      )}
      {dbError.code === "42501" || (dbError.message?.includes("permission") || dbError.message?.includes("policy")) ? (
        <div style={{ color: "#aaa", fontSize: 12 }}>RLS policy issue — check the schema.sql policies are applied in Supabase → Authentication → Policies.</div>
      ) : null}
    </div>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0a0a0a", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", position: "relative", overflow: "hidden" }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isDesktop ? "16px 28px" : "14px 20px", borderBottom: "1px solid #1e1e1e", flexShrink: 0, background: "#0a0a0a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 26 }}>💳</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>CardIQ</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isDesktop && <span style={{ fontSize: 13, color: "#555" }}>{greet}</span>}
          {cards.find(c => c.supportsQR) && !isDesktop && (
            <button onClick={() => setQrCard(cards.find(c => c.supportsQR))}
              title="Scan & Pay"
              style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#2d1b4e,#6c3fc7)", border: "1px solid #4a2a8a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
              {/* QR icon SVG */}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="2" width="7" height="7" rx="1.2" stroke="#c084fc" strokeWidth="1.5" fill="none"/>
                <rect x="3.5" y="3.5" width="4" height="4" rx="0.5" fill="#c084fc"/>
                <rect x="11" y="2" width="7" height="7" rx="1.2" stroke="#c084fc" strokeWidth="1.5" fill="none"/>
                <rect x="12.5" y="3.5" width="4" height="4" rx="0.5" fill="#c084fc"/>
                <rect x="2" y="11" width="7" height="7" rx="1.2" stroke="#c084fc" strokeWidth="1.5" fill="none"/>
                <rect x="3.5" y="12.5" width="4" height="4" rx="0.5" fill="#c084fc"/>
                <rect x="11" y="11" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/>
                <rect x="14.5" y="11" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/>
                <rect x="11" y="14.5" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/>
                <rect x="14.5" y="14.5" width="2.5" height="2.5" rx="0.5" fill="#c084fc"/>
              </svg>
            </button>
          )}
          {!isDesktop && (
            <button onClick={handleSignOut} title="Sign out"
              style={{ width: 36, height: 36, borderRadius: 10, background: "#111", border: "1px solid #2a2a2a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M12 6l3 3-3 3" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 9H7" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          {isDesktop && (
            <span style={{ fontSize: 13, color: "#555" }}>{greet} 👋</span>
          )}
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {isDesktop && (
          <SidebarNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            cards={cards}
            onSignOut={handleSignOut}
          />
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }} className="scroll-area">
          {/* Consolidated credit banner */}
          {cards.length > 0 && (
            <div style={{ margin: isDesktop ? "20px 32px 0" : "12px 16px 0", background: "#111", borderRadius: 16, padding: "14px 18px", border: "1px solid #1e1e1e" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                {[["Total Limit", fmtCurrency(totalLimit), "#fff"], ["Used", fmtCurrency(totalSpent), "#e94560"], ["Available", fmtCurrency(totalAvailable), "#34e89e"]].map(([l, v, c], i) => (
                  <div key={l} style={{ flex: 1, textAlign: "center" }}>
                    {i > 0 && <div style={{ position: "absolute" }} />}
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: "#555", letterSpacing: 1, marginTop: 2 }}>{l.toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 6, borderRadius: 3, overflow: "hidden", background: "#1e1e1e", display: "flex" }}>
                {cards.map(c => <div key={c.id} style={{ width: `${(c.spent / totalLimit) * 100}%`, height: "100%", background: c.accent }} />)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "#555" }}>{totalLimit > 0 ? ((totalSpent / totalLimit) * 100).toFixed(0) : 0}% overall utilization</span>
                <span style={{ fontSize: 10, color: "#555" }}>{cards.length} card{cards.length !== 1 ? "s" : ""} · {cards.filter(c => c.supportsQR).length} RuPay QR</span>
              </div>
            </div>
          )}

          <div style={{ padding: isDesktop ? "16px 32px 32px" : "8px 16px 88px" }}>
            {dbErrorBanner}
            <AlertBanner cards={cards} />

            <div style={{ opacity: animIn ? 1 : 0, transform: animIn ? "translateY(0)" : "translateY(10px)", transition: "all 0.3s ease" }}>
              {activeTab === 0 && <CardsTab isDesktop={isDesktop} cards={cards} txns={txns} onSelect={setSelectedCard} selected={selectedCard} onQRPay={setQrCard} onAdd={() => setShowAddCard(true)} onEdit={setEditCard} onDelete={handleDeleteCard} />}
              {activeTab === 1 && <SmartPayTab cards={cards} category={category} setCategory={setCategory} amount={amount} setAmount={setAmount} txnType={txnType} setTxnType={setTxnType} onAnalyze={handleAnalyze} recommendations={recommendations} onQRPay={setQrCard} />}
              {activeTab === 2 && <BillsTab cards={cards} txns={txns} onViewBill={setBillCard} onMarkPaid={handleMarkPaid} />}
              {activeTab === 3 && <TransactionsTab txns={txns} cards={cards} onAdd={() => setShowAddTxn(true)} onUploadStatement={() => fileInputRef.current?.click()} onAddFromSMS={() => setShowSMSModal(true)} />}
              {activeTab === 4 && <InsightsTab cards={cards} txns={txns} totalLimit={totalLimit} totalSpent={totalSpent} totalAvailable={totalAvailable} />}
              {activeTab === 5 && <BudgetTab txns={txns} cards={cards} />}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM NAV (mobile only) ─────────────────────────────────────────── */}
      {!isDesktop && (
        <div style={{ display: "flex", background: "rgba(10,10,10,0.97)", backdropFilter: "blur(20px)", padding: "10px 0 env(safe-area-inset-bottom,16px)", borderTop: "1px solid #1e1e1e", flexShrink: 0 }}>
          {tabs.map((tab, i) => {
            const active = activeTab === i;
            return (
              <button key={tab} onClick={() => setActiveTab(i)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: active ? "#fff" : "#555", padding: "4px 0" }}>
                <span style={{ fontSize: 20 }}>{tabIcons[i]}</span>
                <span style={{ fontSize: 9, marginTop: 3, fontWeight: active ? 700 : 400 }}>{tab}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── HIDDEN FILE INPUT ────────────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={handleStatementFile}
        onClick={e => { e.target.value = ""; }}
      />

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}
      {qrCard    && <QRPayModal card={qrCard} onClose={() => setQrCard(null)} onTransaction={handleQRTxn} />}
      {billCard  && <BillModal card={billCard} onClose={() => setBillCard(null)} />}
      {showAddTxn && cards.length > 0 && <AddTxnModal cards={cards} onAdd={handleAddTxn} onClose={() => setShowAddTxn(false)} />}
      {showAddCard && <AddEditCardModal onSave={handleSaveCard} onClose={() => setShowAddCard(false)} />}
      {editCard  && <AddEditCardModal card={editCard} onSave={handleSaveCard} onClose={() => setEditCard(null)} />}
      {parsedStatement && <StatementReviewModal parsedTxns={parsedStatement.txns} rawLines={parsedStatement.rawLines} billing={parsedStatement.billing} identity={parsedStatement.identity} cards={cards} onImport={handleImportStatement} onClose={() => setParsedStatement(null)} />}
      {showSMSModal && cards.length > 0 && <SMSParseModal cards={cards} onAdd={handleSMSAdd} onClose={() => setShowSMSModal(false)} />}
      {pendingPDFFile && <PDFPasswordModal isWrong={pdfPasswordErr === "PASSWORD_WRONG"} onSubmit={handlePasswordSubmit} onClose={() => { setPendingPDFFile(null); setPdfPasswordErr(null); }} />}

      {/* RBL auto-save success toast */}
      {rblAutoSaved && (
        <div onClick={() => setRblAutoSaved(null)} style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "#111", border: "1px solid #2a2a2a", borderRadius: 16, padding: "14px 20px", zIndex: 700, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", minWidth: 260, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideUp 0.3s ease" }}>
          <div style={{ fontSize: 28 }}>🏦</div>
          <div>
            <div style={{ color: "#34e89e", fontWeight: 700, fontSize: 13 }}>RBL Card Updated</div>
            <div style={{ color: "#aaa", fontSize: 12, marginTop: 2 }}>
              Due ₹{(rblAutoSaved.totalDue || 0).toLocaleString("en-IN")}
              {rblAutoSaved.minDue > 0 && ` · Min ₹${rblAutoSaved.minDue.toLocaleString("en-IN")}`}
              {rblAutoSaved.dueDate && ` · By ${new Date(rblAutoSaved.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation toast */}
      {reconcileResult && (
        <div onClick={() => setReconcileResult(null)} style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "#111", border: "1px solid #2a3a2a", borderRadius: 16, padding: "14px 20px", zIndex: 700, display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", minWidth: 280, maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", animation: "slideUp 0.3s ease" }}>
          <div style={{ fontSize: 24, flexShrink: 0 }}>✅</div>
          <div>
            <div style={{ color: "#34e89e", fontWeight: 700, fontSize: 13 }}>Statement imported — {reconcileResult.card}</div>
            <div style={{ color: "#aaa", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
              {reconcileResult.added > 0 && <span>+{reconcileResult.added} new txn{reconcileResult.added !== 1 ? "s" : ""}</span>}
              {reconcileResult.merged > 0 && reconcileResult.added > 0 && <span style={{ color: "#555" }}> · </span>}
              {reconcileResult.merged > 0 && <span style={{ color: "#c084fc" }}>{reconcileResult.merged} SMS entr{reconcileResult.merged !== 1 ? "ies" : "y"} reconciled</span>}
            </div>
            {reconcileResult.merged > 0 && (
              <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                Manually added txns merged — no duplicates
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STATEMENT PARSING OVERLAY ────────────────────────────────────────── */}
      {statementParsing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", border: "3px solid #333", borderTopColor: "#c084fc", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>Reading statement…</p>
          <p style={{ color: "#666", fontSize: 12 }}>Extracting transactions from PDF</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <style>{`
        .scroll-area::-webkit-scrollbar { display: none; }
        @keyframes slideUp { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes qrScan { 0% { top: 10%; } 100% { top: 85%; } }
        .qr-scan { animation: qrScan 2s ease-in-out infinite alternate; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #0a0a0a; }
      `}</style>
    </div>
  );
}

// ─── MODAL STYLES ─────────────────────────────────────────────────────────────
const M = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet:    { width: "100%", maxWidth: 520, background: "#0f0f0f", borderRadius: "28px 28px 0 0", padding: "16px 24px 40px", border: "1px solid #1e1e1e", maxHeight: "90vh", overflowY: "auto" },
  handle:   { width: 40, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 20px" },
  title:    { fontSize: 20, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#666", textAlign: "center", marginBottom: 12 },
  badge:    { display: "flex", justifyContent: "center", alignItems: "center", background: "#1a0533", borderRadius: 20, padding: "6px 16px", fontSize: 12, width: "fit-content", margin: "0 auto 16px" },
  finder:   { width: 180, height: 180, margin: "0 auto", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" },
  corner:   (pos, color) => {
    const map = { tl: { top: 0, left: 0 }, tr: { top: 0, right: 0 }, bl: { bottom: 0, left: 0 }, br: { bottom: 0, right: 0 } };
    const br  = { tl: "8px 0 0 0", tr: "0 8px 0 0", bl: "0 0 0 8px", br: "0 0 8px 0" };
    return { position: "absolute", width: 20, height: 20, border: `3px solid ${color}`, ...map[pos], borderRadius: br[pos] };
  },
  scanLine: { position: "absolute", left: 10, right: 10, height: 2, background: "linear-gradient(90deg,transparent,#c084fc,transparent)", borderRadius: 1 },
  note:     { background: "#1a0533", borderRadius: 10, padding: "8px 12px", fontSize: 11, color: "#c084fc", textAlign: "center", marginTop: 12 },
  btn:      { width: "100%", marginTop: 16, padding: "14px", borderRadius: 14, background: "linear-gradient(90deg,#4286f4,#34e89e)", border: "none", color: "#000", fontWeight: 800, fontSize: 15, cursor: "pointer" },
  ghost:    { width: "100%", marginTop: 10, padding: "12px", borderRadius: 14, background: "transparent", border: "1px solid #2a2a2a", color: "#666", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  mBox:     { background: "#111", borderRadius: 16, padding: "20px", textAlign: "center", marginBottom: 14, border: "1px solid #1e1e1e" },
  payWith:  { background: "#111", borderRadius: 14, padding: "14px 16px", border: "1px solid #1e1e1e", marginBottom: 4 },
  ring:     { width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#6c3fc7,#34e89e)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", boxShadow: "0 0 40px rgba(52,232,158,0.3)" },
  check:    { color: "#fff", fontSize: 36, fontWeight: 800 },
};

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const S = {
  secLabel: { fontSize: 10, fontWeight: 800, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, marginTop: 16 },
};
