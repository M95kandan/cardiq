import { useState, useEffect, useRef } from "react";

// ─── DATA ──────────────────────────────────────────────────────────────────────
const initialCards = [
  {
    id: 1, name: "HDFC Regalia", bank: "HDFC", last4: "4821", network: "Visa",
    color: ["#1a1a2e", "#16213e"], accent: "#e94560",
    points: 12450, pointValue: 0.25, supportsQR: false,
    offers: [
      { id: 1, category: "Dining", discount: "20% off", partner: "Zomato", expiry: "Jun 30", icon: "🍽️" },
      { id: 2, category: "Travel", discount: "5X points", partner: "MakeMyTrip", expiry: "Jul 15", icon: "✈️" },
      { id: 3, category: "Fuel", discount: "1% surcharge waiver", partner: "All Fuel", expiry: "Dec 31", icon: "⛽" },
    ],
    rewardRate: { dining: 5, travel: 5, fuel: 2, shopping: 2, other: 1 },
    limit: 500000, spent: 124500,
    dueDate: "Jun 5", minDue: 6225, totalDue: 124500, billCycle: "25th",
    alertThreshold: 80,
  },
  {
    id: 2, name: "Axis Magnus", bank: "Axis", last4: "9234", network: "Mastercard",
    color: ["#0f3443", "#34e89e"], accent: "#34e89e",
    points: 8900, pointValue: 0.35, supportsQR: false,
    offers: [
      { id: 1, category: "Shopping", discount: "10% off", partner: "Amazon", expiry: "Jun 25", icon: "🛍️" },
      { id: 2, category: "Entertainment", discount: "Buy 1 Get 1", partner: "BookMyShow", expiry: "Jul 31", icon: "🎬" },
    ],
    rewardRate: { dining: 2, travel: 12, fuel: 1, shopping: 5, other: 2 },
    limit: 800000, spent: 310000,
    dueDate: "Jun 8", minDue: 15500, totalDue: 310000, billCycle: "28th",
    alertThreshold: 70,
  },
  {
    id: 3, name: "SBI SimplyCLICK", bank: "SBI", last4: "5577", network: "Visa",
    color: ["#373b44", "#4286f4"], accent: "#4286f4",
    points: 3200, pointValue: 0.20, supportsQR: false,
    offers: [
      { id: 1, category: "Online Shopping", discount: "10X points", partner: "Flipkart", expiry: "Jun 30", icon: "📦" },
      { id: 2, category: "Dining", discount: "5X points", partner: "Swiggy", expiry: "Jul 10", icon: "🛵" },
    ],
    rewardRate: { dining: 5, travel: 2, fuel: 1, shopping: 10, other: 1 },
    limit: 200000, spent: 45000,
    dueDate: "Jun 12", minDue: 2250, totalDue: 45000, billCycle: "1st",
    alertThreshold: 75,
  },
  {
    id: 4, name: "HDFC UPI RuPay", bank: "HDFC", last4: "3301", network: "RuPay",
    color: ["#2d1b4e", "#6c3fc7"], accent: "#c084fc",
    points: 5600, pointValue: 0.30, supportsQR: true, upiId: "mk@hdfcbank",
    offers: [
      { id: 1, category: "Groceries", discount: "5% cashback", partner: "BigBasket", expiry: "Jul 31", icon: "🛒" },
      { id: 2, category: "Fuel", discount: "1.5% cashback", partner: "HPCL", expiry: "Dec 31", icon: "⛽" },
      { id: 3, category: "Dining", discount: "10% off", partner: "Swiggy Instamart", expiry: "Jun 30", icon: "🍱" },
    ],
    rewardRate: { dining: 3, travel: 2, fuel: 3, shopping: 2, other: 2 },
    limit: 300000, spent: 78000,
    dueDate: "Jun 15", minDue: 3900, totalDue: 78000, billCycle: "5th",
    alertThreshold: 60,
  },
];

const initialTransactions = [
  { id: 1, cardId: 1, merchant: "Zomato", category: "Dining", amount: 850, date: "May 22", points: 42, type: "card", icon: "🍽️" },
  { id: 2, cardId: 4, merchant: "BigBasket", category: "Groceries", amount: 1200, date: "May 22", points: 24, type: "qr", icon: "🛒" },
  { id: 3, cardId: 2, merchant: "Amazon", category: "Shopping", amount: 3499, date: "May 21", points: 174, type: "card", icon: "🛍️" },
  { id: 4, cardId: 3, merchant: "Flipkart", category: "Online Shopping", amount: 1999, date: "May 21", points: 199, type: "card", icon: "📦" },
  { id: 5, cardId: 1, merchant: "MakeMyTrip", category: "Travel", amount: 12500, date: "May 20", points: 625, type: "card", icon: "✈️" },
  { id: 6, cardId: 4, merchant: "HPCL Petrol", category: "Fuel", amount: 2000, date: "May 19", points: 60, type: "qr", icon: "⛽" },
  { id: 7, cardId: 2, merchant: "BookMyShow", category: "Entertainment", amount: 600, date: "May 18", points: 30, type: "card", icon: "🎬" },
  { id: 8, cardId: 1, merchant: "Taj Mahal Bistro", category: "Dining", amount: 2400, date: "May 17", points: 120, type: "card", icon: "🍽️" },
  { id: 9, cardId: 4, merchant: "Kirana Store", category: "Groceries", amount: 450, date: "May 16", points: 9, type: "qr", icon: "🛒" },
  { id: 10, cardId: 3, merchant: "Swiggy", category: "Dining", amount: 380, date: "May 15", points: 19, type: "card", icon: "🛵" },
];

const categories = ["Dining", "Travel", "Fuel", "Shopping", "Entertainment", "Online Shopping", "Groceries", "Other"];
const categoryRewardKey = {
  Dining: "dining", Travel: "travel", Fuel: "fuel", Shopping: "shopping",
  Entertainment: "shopping", "Online Shopping": "shopping", Groceries: "other", Other: "other",
};

function getBestCard(category, amount, txnType = "card", cards) {
  const key = categoryRewardKey[category] || "other";
  return cards
    .filter(c => txnType === "qr" ? c.supportsQR : true)
    .map(card => {
      const rate = card.rewardRate[key] || 1;
      const pts = Math.floor((amount / 100) * rate);
      const value = pts * card.pointValue;
      const offer = card.offers.find(o => o.category === category);
      return { card, rate, pts, value, offer };
    })
    .sort((a, b) => b.value - a.value);
}

function getDaysUntil(dateStr) {
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const [mon, day] = dateStr.split(" ");
  const now = new Date(2026, 4, 23); // current date
  const due = new Date(2026, months[mon], parseInt(day));
  return Math.ceil((due - now) / 86400000);
}

const tabs = ["Cards", "Smart Pay", "Bills", "Transactions", "Insights"];

// ─── QR PAY MODAL ─────────────────────────────────────────────────────────────
function QRPayModal({ card, onClose, onTransaction }) {
  const [step, setStep] = useState("scan");
  const [qrAmount] = useState("450");
  const [merchant] = useState("Sharma Kirana Store");
  const canvasRef = useRef(null);

  useEffect(() => {
    if (step === "scan" && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      const size = 160; ctx.clearRect(0,0,size,size);
      ctx.fillStyle = "#fff"; ctx.fillRect(0,0,size,size);
      ctx.fillStyle = "#1a0533";
      const cell = 8, cols = size/cell;
      for (let r=0;r<cols;r++) for (let c=0;c<cols;c++) {
        const inCorner = (r<5&&c<5)||(r<5&&c>=cols-5)||(r>=cols-5&&c<5);
        if (inCorner) { ctx.fillRect(c*cell,r*cell,cell,cell); continue; }
        if ((r>=1&&r<=3&&c>=1&&c<=3)||(r>=1&&r<=3&&c>=cols-4&&c<=cols-2)||(r>=cols-4&&r<=cols-2&&c>=1&&c<=3)) {
          ctx.fillStyle="#fff"; ctx.fillRect(c*cell,r*cell,cell,cell); ctx.fillStyle="#1a0533"; continue;
        }
        const seed=(r*31+c*17+r*c)%7;
        if(seed<3) ctx.fillRect(c*cell,r*cell,cell,cell);
      }
      ctx.fillStyle="rgba(192,132,252,0.9)"; ctx.beginPath(); ctx.roundRect(62,62,36,36,6); ctx.fill();
      ctx.fillStyle="#fff"; ctx.font="bold 14px sans-serif"; ctx.textAlign="center"; ctx.fillText("₹",80,85);
    }
  }, [step]);

  const handlePay = () => {
    onTransaction({ cardId: card.id, merchant, category: "Groceries", amount: parseFloat(qrAmount), type: "qr", icon: "🛒" });
    setStep("success");
  };

  return (
    <div style={qrS.overlay}>
      <div style={qrS.sheet}>
        <div style={qrS.handle} />
        {step === "scan" && <>
          <div style={qrS.title}>Scan & Pay</div>
          <div style={qrS.subtitle}>{card.name} · {card.upiId}</div>
          <div style={qrS.netBadge}><span style={{color:card.accent,fontWeight:800}}>⬡ RuPay</span><span style={{color:"#888",marginLeft:8}}>UPI Credit Card</span></div>
          <div style={qrS.finder}>
            {["tl","tr","bl","br"].map(p=><div key={p} style={qrS.corner(p,card.accent)}/>)}
            <canvas ref={canvasRef} width={160} height={160} style={{borderRadius:8}}/>
            <div style={qrS.scanLine} className="qr-scan"/>
          </div>
          <div style={{fontSize:12,color:"#666",textAlign:"center",marginTop:10}}>Point camera at any UPI QR code</div>
          <div style={qrS.rupayNote}>🇮🇳 RuPay Credit on UPI — works at all Bharat QR / UPI merchants</div>
          <button onClick={()=>setStep("confirm")} style={qrS.btn}>Simulate QR Scan →</button>
          <button onClick={onClose} style={qrS.ghost}>Cancel</button>
        </>}
        {step === "confirm" && <>
          <div style={qrS.title}>Confirm Payment</div>
          <div style={qrS.mBox}>
            <div style={{fontSize:28,marginBottom:6}}>🏪</div>
            <div style={{color:"#fff",fontWeight:700,fontSize:16}}>{merchant}</div>
            <div style={{color:"#888",fontSize:12,marginTop:4}}>UPI · Bharat QR</div>
            <div style={{color:card.accent,fontWeight:900,fontSize:32,marginTop:12}}>₹{parseFloat(qrAmount).toLocaleString()}</div>
          </div>
          <div style={qrS.payWith}>
            <div style={{fontSize:10,color:"#666",letterSpacing:2}}>PAYING WITH</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
              <div style={{width:32,height:20,borderRadius:4,background:`linear-gradient(135deg,${card.color[0]},${card.color[1]})`}}/>
              <div>
                <div style={{color:"#fff",fontSize:13,fontWeight:600}}>{card.name}</div>
                <div style={{color:"#666",fontSize:10}}>•••• {card.last4} · {card.upiId}</div>
              </div>
              <div style={{marginLeft:"auto",textAlign:"right"}}>
                <div style={{color:"#888",fontSize:10}}>Rewards</div>
                <div style={{color:card.accent,fontWeight:700,fontSize:12}}>+{Math.floor(parseFloat(qrAmount)/100*2)} pts</div>
              </div>
            </div>
          </div>
          <button onClick={handlePay} style={{...qrS.btn,background:`linear-gradient(90deg,#6c3fc7,#c084fc)`}}>Pay ₹{parseFloat(qrAmount).toLocaleString()} →</button>
          <button onClick={()=>setStep("scan")} style={qrS.ghost}>Back</button>
        </>}
        {step === "success" && <div style={{textAlign:"center",paddingTop:20}}>
          <div style={qrS.ring}><div style={qrS.check}>✓</div></div>
          <div style={{color:"#fff",fontWeight:800,fontSize:20,marginTop:20}}>Payment Successful!</div>
          <div style={{color:"#888",fontSize:13,marginTop:6}}>₹{parseFloat(qrAmount).toLocaleString()} paid to {merchant}</div>
          <div style={{...qrS.rupayNote,marginTop:16}}>🎉 +{Math.floor(parseFloat(qrAmount)/100*2)} reward points added</div>
          <button onClick={onClose} style={{...qrS.btn,marginTop:24}}>Done</button>
        </div>}
      </div>
      <style>{`
        @keyframes qrScan{0%{top:10%}100%{top:85%}}
        .qr-scan{animation:qrScan 2s ease-in-out infinite alternate;}
      `}</style>
    </div>
  );
}

const qrS = {
  overlay:{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"flex-end"},
  sheet:{width:"100%",background:"#0f0f0f",borderRadius:"28px 28px 0 0",padding:"16px 24px 40px",border:"1px solid #1e1e1e"},
  handle:{width:40,height:4,background:"#333",borderRadius:2,margin:"0 auto 20px"},
  title:{fontSize:20,fontWeight:800,color:"#fff",textAlign:"center",marginBottom:4},
  subtitle:{fontSize:12,color:"#666",textAlign:"center",marginBottom:12},
  netBadge:{display:"flex",justifyContent:"center",alignItems:"center",background:"#1a0533",borderRadius:20,padding:"6px 16px",fontSize:12,width:"fit-content",margin:"0 auto 16px"},
  finder:{width:180,height:180,margin:"0 auto",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"},
  corner:(pos,color)=>{
    const map={tl:{top:0,left:0},tr:{top:0,right:0},bl:{bottom:0,left:0},br:{bottom:0,right:0}};
    const br={tl:"8px 0 0 0",tr:"0 8px 0 0",bl:"0 0 0 8px",br:"0 0 8px 0"};
    return{position:"absolute",width:20,height:20,border:`3px solid ${color}`,...map[pos],borderRadius:br[pos]};
  },
  scanLine:{position:"absolute",left:10,right:10,height:2,background:"linear-gradient(90deg,transparent,#c084fc,transparent)",borderRadius:1},
  rupayNote:{background:"#1a0533",borderRadius:10,padding:"8px 12px",fontSize:11,color:"#c084fc",textAlign:"center",marginTop:12},
  btn:{width:"100%",marginTop:16,padding:"14px",borderRadius:14,background:"linear-gradient(90deg,#4286f4,#34e89e)",border:"none",color:"#000",fontWeight:800,fontSize:15,cursor:"pointer"},
  ghost:{width:"100%",marginTop:10,padding:"12px",borderRadius:14,background:"transparent",border:"1px solid #2a2a2a",color:"#666",fontWeight:600,fontSize:14,cursor:"pointer"},
  mBox:{background:"#111",borderRadius:16,padding:"20px",textAlign:"center",marginBottom:14,border:"1px solid #1e1e1e"},
  payWith:{background:"#111",borderRadius:14,padding:"14px 16px",border:"1px solid #1e1e1e",marginBottom:4},
  ring:{width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#6c3fc7,#34e89e)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 0 40px rgba(52,232,158,0.3)"},
  check:{color:"#fff",fontSize:36,fontWeight:800},
};

// ─── SPEND ALERT BANNER ───────────────────────────────────────────────────────
function AlertBanner({ cards }) {
  const alerts = cards.filter(c => (c.spent / c.limit) * 100 >= c.alertThreshold);
  const [dismissed, setDismissed] = useState([]);
  const visible = alerts.filter(a => !dismissed.includes(a.id));
  if (!visible.length) return null;
  const a = visible[0];
  const pct = ((a.spent / a.limit) * 100).toFixed(0);
  return (
    <div style={alertS.wrap}>
      <div style={alertS.icon}>⚠️</div>
      <div style={{flex:1}}>
        <div style={alertS.title}>{a.name} at {pct}% utilization</div>
        <div style={alertS.sub}>₹{((a.limit-a.spent)/1000).toFixed(0)}K remaining · {visible.length > 1 ? `+${visible.length-1} more alert${visible.length>2?"s":""}` : "Reduce spend to improve credit score"}</div>
      </div>
      <button onClick={()=>setDismissed(d=>[...d,a.id])} style={alertS.dismiss}>✕</button>
    </div>
  );
}
const alertS = {
  wrap:{margin:"0 16px 8px",background:"linear-gradient(135deg,#2a1400,#1a0a00)",border:"1px solid #f97316",borderRadius:14,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,flexShrink:0},
  icon:{fontSize:18},
  title:{fontSize:12,color:"#fb923c",fontWeight:700},
  sub:{fontSize:10,color:"#9a6040",marginTop:2},
  dismiss:{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:4},
};

// ─── BILL DUE MODAL ───────────────────────────────────────────────────────────
function BillModal({ card, onClose }) {
  const days = getDaysUntil(card.dueDate);
  const urgency = days <= 3 ? "#e94560" : days <= 7 ? "#f97316" : "#34e89e";
  return (
    <div style={qrS.overlay}>
      <div style={{...qrS.sheet,paddingBottom:50}}>
        <div style={qrS.handle}/>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:12,color:"#666",letterSpacing:2,marginBottom:4}}>BILL DUE</div>
          <div style={{fontSize:26,fontWeight:900,color:"#fff"}}>{card.name}</div>
          <div style={{fontSize:13,color:"#888",marginTop:2}}>•••• {card.last4} · Cycle closes {card.billCycle}</div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,background:"#111",borderRadius:14,padding:"14px",border:"1px solid #1e1e1e",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#555",letterSpacing:1}}>DUE DATE</div>
            <div style={{fontSize:18,fontWeight:800,color:urgency,marginTop:4}}>{card.dueDate}</div>
            <div style={{fontSize:11,color:urgency,marginTop:2}}>{days <= 0 ? "OVERDUE" : `${days} days left`}</div>
          </div>
          <div style={{flex:1,background:"#111",borderRadius:14,padding:"14px",border:"1px solid #1e1e1e",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#555",letterSpacing:1}}>TOTAL DUE</div>
            <div style={{fontSize:18,fontWeight:800,color:"#e94560",marginTop:4}}>₹{(card.totalDue/1000).toFixed(1)}K</div>
            <div style={{fontSize:11,color:"#666",marginTop:2}}>full balance</div>
          </div>
        </div>
        <div style={{background:"#111",borderRadius:14,padding:"14px 16px",border:"1px solid #1e1e1e",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:"#555",letterSpacing:1}}>MINIMUM DUE</div>
              <div style={{fontSize:20,fontWeight:800,color:"#f97316",marginTop:4}}>₹{card.minDue.toLocaleString()}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"#555",letterSpacing:1}}>STATEMENT</div>
              <div style={{fontSize:14,fontWeight:700,color:"#fff",marginTop:4}}>₹{(card.spent/1000).toFixed(1)}K</div>
            </div>
          </div>
          <div style={{marginTop:12,background:"#1a1a1a",borderRadius:8,padding:"8px 10px",fontSize:10,color:"#888"}}>
            ⚠️ Paying only minimum due will incur 3.5% monthly interest (~₹{((card.spent - card.minDue)*0.035).toFixed(0)}/mo)
          </div>
        </div>
        <button style={{...qrS.btn,background:"linear-gradient(90deg,#e94560,#f97316)"}}>Pay Now →</button>
        <button onClick={onClose} style={qrS.ghost}>Close</button>
      </div>
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

  const catIcons = { Dining:"🍽️", Travel:"✈️", Fuel:"⛽", Shopping:"🛍️", Entertainment:"🎬", "Online Shopping":"📦", Groceries:"🛒", Other:"💸" };

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
    <div style={qrS.overlay}>
      <div style={{...qrS.sheet,paddingBottom:50}}>
        <div style={qrS.handle}/>
        <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:16}}>Log Transaction</div>

        <div style={ST.label}>CARD</div>
        <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
          {cards.map(c=>(
            <button key={c.id} onClick={()=>{setSel(c.id); if(!c.supportsQR)setType("card");}}
              style={{...ST.cardPill,borderColor:sel===c.id?c.accent:"#2a2a2a",color:sel===c.id?c.accent:"#888",background:sel===c.id?"#111":"transparent",flexShrink:0}}>
              {c.bank} {c.last4}
            </button>
          ))}
        </div>

        <div style={ST.label}>PAYMENT TYPE</div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[["card","💳 Card"],["qr","⬛ QR/UPI"]].map(([v,l])=>(
            <button key={v} onClick={()=>setType(v)}
              disabled={v==="qr"&&!selectedCard?.supportsQR}
              style={{...ST.toggle,flex:1,
                borderColor:type===v?(v==="qr"?"#c084fc":"#4286f4"):"#2a2a2a",
                color:type===v?(v==="qr"?"#c084fc":"#4286f4"):"#555",
                background:type===v?(v==="qr"?"#1a0533":"#0d1a33"):"transparent",
                opacity:v==="qr"&&!selectedCard?.supportsQR?0.4:1,
              }}>{l}</button>
          ))}
        </div>

        <div style={ST.label}>MERCHANT</div>
        <input value={merch} onChange={e=>setMerch(e.target.value)} placeholder="e.g. Zomato, Flipkart…"
          style={{...ST.input,marginBottom:14}}/>

        <div style={ST.label}>CATEGORY</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
          {categories.map(c=>(
            <button key={c} onClick={()=>setCat(c)}
              style={{...ST.pill,borderColor:cat===c?"#4286f4":"#2a2a2a",color:cat===c?"#4286f4":"#666",background:cat===c?"#0d1a33":"transparent"}}>
              {catIcons[c]} {c}
            </button>
          ))}
        </div>

        <div style={ST.label}>AMOUNT (₹)</div>
        <input type="number" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0"
          style={{...ST.input,marginBottom:16}}/>

        <button onClick={handleAdd} style={qrS.btn}>Add Transaction</button>
        <button onClick={onClose} style={qrS.ghost}>Cancel</button>
      </div>
    </div>
  );
}
const ST = {
  label:{fontSize:10,fontWeight:800,color:"#555",letterSpacing:2,marginBottom:8},
  input:{width:"100%",padding:"12px 14px",borderRadius:12,background:"#1a1a1a",border:"1px solid #2a2a2a",color:"#fff",fontSize:15,outline:"none",boxSizing:"border-box"},
  pill:{padding:"5px 10px",borderRadius:16,border:"1px solid",fontSize:11,cursor:"pointer"},
  cardPill:{padding:"6px 12px",borderRadius:16,border:"1px solid",fontSize:12,cursor:"pointer"},
  toggle:{padding:"10px",borderRadius:12,border:"1px solid",fontSize:12,cursor:"pointer"},
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [cards, setCards] = useState(initialCards);
  const [txns, setTxns] = useState(initialTransactions);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedCard, setSelectedCard] = useState(null);
  const [category, setCategory] = useState("Dining");
  const [amount, setAmount] = useState("1000");
  const [txnType, setTxnType] = useState("card");
  const [recommendations, setRecommendations] = useState(null);
  const [animIn, setAnimIn] = useState(true);
  const [qrCard, setQrCard] = useState(null);
  const [billCard, setBillCard] = useState(null);
  const [showAddTxn, setShowAddTxn] = useState(false);

  useEffect(() => {
    setAnimIn(false);
    const t = setTimeout(() => setAnimIn(true), 50);
    return () => clearTimeout(t);
  }, [activeTab]);

  const totalLimit = cards.reduce((s,c)=>s+c.limit,0);
  const totalSpent = cards.reduce((s,c)=>s+c.spent,0);
  const totalAvailable = totalLimit - totalSpent;

  const handleAnalyze = () => {
    const amt = parseFloat(amount)||0;
    setRecommendations(getBestCard(category, amt, txnType, cards));
  };

  const handleAddTxn = (txn) => {
    const newId = Math.max(...txns.map(t=>t.id))+1;
    const today = "May 23";
    setTxns(prev=>[{id:newId,...txn,date:today},...prev]);
    setCards(prev=>prev.map(c=> c.id===txn.cardId
      ? {...c, spent:c.spent+txn.amount, points:c.points+txn.points,
          totalDue:c.totalDue+txn.amount, minDue:Math.floor((c.totalDue+txn.amount)*0.05)}
      : c
    ));
  };

  const handleQRTxn = (txn) => {
    const pts = Math.floor(txn.amount/100*2);
    handleAddTxn({...txn, points:pts});
  };

  return (
    <div style={S.phone}>
      <div style={S.notch}/>
      <div style={S.statusBar}>
        <span style={S.time}>9:41</span>
        <div style={S.statusIcons}><span style={{fontSize:10,letterSpacing:1}}>●●●</span><span style={{fontSize:10}}>WiFi</span><span style={{fontSize:10}}>⬛</span></div>
      </div>
      <div style={S.header}>
        <div>
          <div style={S.greet}>Good morning, MK 👋</div>
          <div style={S.title}>CardIQ</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button onClick={()=>setQrCard(cards.find(c=>c.supportsQR))} style={S.qrFab}>⬛</button>
          <div style={S.avatar}>MK</div>
        </div>
      </div>

      {/* Consolidated Credit Banner */}
      <div style={S.banner}>
        <div style={S.bannerRow}>
          {[["Total Limit",`₹${(totalLimit/100000).toFixed(1)}L`,"#fff"],["Used",`₹${(totalSpent/1000).toFixed(0)}K`,"#e94560"],["Available",`₹${(totalAvailable/1000).toFixed(0)}K`,"#34e89e"]].map(([l,v,c],i)=>(
            <div key={l} style={{flex:1,textAlign:"center"}}>
              {i>0 && <div style={S.divider}/>}
              <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:9,color:"#555",letterSpacing:1,marginTop:2}}>{l.toUpperCase()}</div>
            </div>
          ))}
        </div>
        <div style={S.masterBar}>
          {cards.map(c=><div key={c.id} style={{width:`${(c.spent/totalLimit)*100}%`,height:"100%",background:c.accent,opacity:0.9}}/>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
          <span style={{fontSize:9,color:"#555"}}>{((totalSpent/totalLimit)*100).toFixed(0)}% overall utilization</span>
          <span style={{fontSize:9,color:"#555"}}>{cards.length} cards · {cards.filter(c=>c.supportsQR).length} RuPay QR</span>
        </div>
      </div>

      <AlertBanner cards={cards}/>

      <div style={S.content} className="scroll-area">
        <div style={{opacity:animIn?1:0,transform:animIn?"translateY(0)":"translateY(12px)",transition:"all 0.35s ease"}}>
          {activeTab===0 && <CardsTab cards={cards} onSelect={setSelectedCard} selected={selectedCard} onQRPay={setQrCard}/>}
          {activeTab===1 && <SmartPayTab cards={cards} category={category} setCategory={setCategory} amount={amount} setAmount={setAmount} txnType={txnType} setTxnType={setTxnType} onAnalyze={handleAnalyze} recommendations={recommendations} onQRPay={setQrCard}/>}
          {activeTab===2 && <BillsTab cards={cards} onViewBill={setBillCard}/>}
          {activeTab===3 && <TransactionsTab txns={txns} cards={cards} onAdd={()=>setShowAddTxn(true)}/>}
          {activeTab===4 && <InsightsTab cards={cards} txns={txns} totalLimit={totalLimit} totalSpent={totalSpent} totalAvailable={totalAvailable}/>}
        </div>
      </div>

      <div style={S.bottomNav}>
        {tabs.map((tab,i)=>{
          const icons=["💳","🧠","🗓️","📋","📊"];
          const active=activeTab===i;
          return <button key={tab} style={{...S.navBtn,...(active?S.navActive:{})}} onClick={()=>setActiveTab(i)}>
            <span style={{fontSize:18}}>{icons[i]}</span>
            <span style={{fontSize:9,marginTop:2,fontWeight:active?700:400}}>{tab}</span>
          </button>;
        })}
      </div>

      {qrCard && <QRPayModal card={qrCard} onClose={()=>setQrCard(null)} onTransaction={handleQRTxn}/>}
      {billCard && <BillModal card={billCard} onClose={()=>setBillCard(null)}/>}
      {showAddTxn && <AddTxnModal cards={cards} onAdd={handleAddTxn} onClose={()=>setShowAddTxn(false)}/>}

      <style>{`
        .scroll-area::-webkit-scrollbar{display:none;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideUp{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
    </div>
  );
}

// ─── CARDS TAB ────────────────────────────────────────────────────────────────
function CardsTab({cards,onSelect,selected,onQRPay}){
  return <div>
    <div style={S.secLabel}>MY CARDS ({cards.length})</div>
    {cards.map((card,i)=>(
      <div key={card.id}>
        <div onClick={()=>onSelect(selected?.id===card.id?null:card)}
          style={{...S.cardTile,background:`linear-gradient(135deg,${card.color[0]},${card.color[1]})`,
            border:selected?.id===card.id?`2px solid ${card.accent}`:"2px solid transparent",
            animation:`slideUp 0.4s ease ${i*80}ms both`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:1.5,textTransform:"uppercase"}}>{card.bank}</div>
              <div style={{fontSize:15,fontWeight:700,color:"#fff",marginTop:2}}>{card.name}</div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {card.supportsQR && <button onClick={e=>{e.stopPropagation();onQRPay(card);}} style={S.qrChip}>⬛ QR</button>}
              <div style={{fontSize:11,color:card.accent,background:"rgba(255,255,255,0.1)",padding:"4px 10px",borderRadius:20,fontWeight:700}}>{card.network}</div>
            </div>
          </div>
          <div style={{fontSize:14,letterSpacing:4,color:"rgba(255,255,255,0.75)",margin:"14px 0 10px",fontFamily:"monospace"}}>•••• •••• •••• {card.last4}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>POINTS</div>
              <div style={{fontSize:17,fontWeight:800,color:card.accent}}>{card.points.toLocaleString()}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>₹{(card.spent/1000).toFixed(0)}K / ₹{(card.limit/100000).toFixed(1)}L</div>
              <div style={{width:90,height:4,background:"rgba(255,255,255,0.15)",borderRadius:2,marginTop:4}}>
                <div style={{width:`${(card.spent/card.limit)*100}%`,height:"100%",background:card.accent,borderRadius:2}}/>
              </div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginTop:2}}>{((card.spent/card.limit)*100).toFixed(0)}% used</div>
            </div>
          </div>
          {/* Due date pill */}
          <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
            {(()=>{const d=getDaysUntil(card.dueDate);const c=d<=3?"#e94560":d<=7?"#f97316":"#34e89e";return(
              <div style={{fontSize:10,color:c,background:`rgba(${d<=3?"233,69,96":d<=7?"249,115,22":"52,232,158"},0.12)`,padding:"3px 10px",borderRadius:10}}>
                🗓 Due {card.dueDate} · {d<=0?"OVERDUE":`${d}d`}
              </div>
            );})()}
            {(card.spent/card.limit)*100>=card.alertThreshold && (
              <div style={{fontSize:10,color:"#f97316",background:"rgba(249,115,22,0.1)",padding:"3px 10px",borderRadius:10}}>
                ⚠️ High utilization
              </div>
            )}
          </div>
        </div>
        {selected?.id===card.id && (
          <div style={{...S.detailBox,borderColor:card.accent}}>
            <div style={S.secLabel}>REWARD RATES</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {Object.entries(card.rewardRate).map(([cat,rate])=>(
                <div key={cat} style={{background:"#1a1a1a",borderRadius:10,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:"#aaa",textTransform:"capitalize"}}>{cat}</div>
                  <div style={{fontSize:15,fontWeight:800,color:card.accent}}>{rate}X</div>
                </div>
              ))}
            </div>
            {card.supportsQR && <div style={{marginTop:10,background:"#1a0533",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#888",letterSpacing:1}}>UPI ID</div>
              <div style={{fontSize:13,color:"#c084fc",fontWeight:700,marginTop:2}}>{card.upiId}</div>
            </div>}
          </div>
        )}
      </div>
    ))}
    <div style={{height:20}}/>
  </div>;
}

// ─── SMART PAY TAB ────────────────────────────────────────────────────────────
function SmartPayTab({cards,category,setCategory,amount,setAmount,txnType,setTxnType,onAnalyze,recommendations,onQRPay}){
  return <div>
    <div style={S.secLabel}>SMART PURCHASE ADVISOR</div>
    <div style={{background:"#111",borderRadius:20,padding:"16px",marginBottom:14,border:"1px solid #1e1e1e"}}>
      <div style={{fontSize:13,color:"#aaa",marginBottom:14}}>Pick category + amount → get best card 🎯</div>
      <div style={S.secLabel}>PAYMENT TYPE</div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[["card","💳 Card Swipe"],["qr","⬛ QR / UPI"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTxnType(v)} style={{...ST.toggle,flex:1,textAlign:"center",
            borderColor:txnType===v?(v==="qr"?"#c084fc":"#4286f4"):"#2a2a2a",
            color:txnType===v?(v==="qr"?"#c084fc":"#4286f4"):"#555",
            background:txnType===v?(v==="qr"?"#1a0533":"#0d1a33"):"transparent"}}>{l}</button>
        ))}
      </div>
      <div style={S.secLabel}>CATEGORY</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
        {categories.map(c=><button key={c} onClick={()=>setCategory(c)}
          style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${category===c?"#4286f4":"#2a2a2a"}`,
            background:category===c?"#0d1a33":"transparent",color:category===c?"#4286f4":"#666",fontSize:12,cursor:"pointer"}}>{c}</button>)}
      </div>
      <div style={S.secLabel}>AMOUNT (₹)</div>
      <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
        style={{...ST.input,marginBottom:14}} placeholder="Enter amount"/>
      {txnType==="qr" && <div style={{marginBottom:14,background:"#1a0533",borderRadius:10,padding:"8px 12px",fontSize:11,color:"#c084fc"}}>
        ⬛ QR mode — only RuPay credit cards eligible
      </div>}
      <button onClick={onAnalyze} style={{...qrS.btn,marginTop:0}}>Find Best Card →</button>
    </div>
    {recommendations && <>
      <div style={S.secLabel}>RECOMMENDATIONS</div>
      {recommendations.map(({card,rate,pts,value,offer},i)=>(
        <div key={card.id} style={{background:"#111",borderRadius:16,padding:"14px 16px",marginBottom:10,border:`${i===0?2:1}px solid ${i===0?card.accent:"#2a2a2a"}`,animation:`slideUp 0.35s ease ${i*80}ms both`}}>
          {i===0 && <div style={{fontSize:9,fontWeight:800,color:card.accent,letterSpacing:1,marginBottom:8}}>⭐ BEST CHOICE</div>}
          <div style={{display:"flex",alignItems:"center"}}>
            <div style={{flex:"0 0 36px",height:36,borderRadius:8,background:`linear-gradient(135deg,${card.color[0]},${card.color[1]})`,marginRight:10}}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,color:"#fff",fontSize:14}}>{card.name}</div>
              <div style={{fontSize:11,color:"#888"}}>•••• {card.last4}{card.supportsQR&&<span style={{color:"#c084fc",marginLeft:6}}>· RuPay QR ✓</span>}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:card.accent,fontWeight:800,fontSize:15}}>{rate}X pts</div>
              <div style={{fontSize:11,color:"#aaa"}}>+{pts} pts (~₹{value.toFixed(0)})</div>
            </div>
          </div>
          {offer && <div style={{display:"flex",alignItems:"center",marginTop:10,background:"rgba(52,232,158,0.06)",borderRadius:8,padding:"6px 10px"}}>
            <span>{offer.icon}</span>
            <span style={{marginLeft:6,fontSize:11,color:"#f0e68c"}}>{offer.discount} on {offer.partner} · Exp {offer.expiry}</span>
          </div>}
          {card.supportsQR&&txnType==="qr"&&<button onClick={()=>onQRPay(card)} style={{...qrS.btn,marginTop:10,padding:"10px",fontSize:13,background:"linear-gradient(90deg,#6c3fc7,#c084fc)"}}>⬛ Open QR Scanner →</button>}
        </div>
      ))}
    </>}
    <div style={{height:20}}/>
  </div>;
}

// ─── BILLS TAB ────────────────────────────────────────────────────────────────
function BillsTab({cards,onViewBill}){
  const sorted = [...cards].sort((a,b)=>getDaysUntil(a.dueDate)-getDaysUntil(b.dueDate));
  const totalDue = cards.reduce((s,c)=>s+c.totalDue,0);
  const totalMin = cards.reduce((s,c)=>s+c.minDue,0);

  return <div>
    {/* Summary */}
    <div style={S.secLabel}>UPCOMING BILLS</div>
    <div style={{background:"#111",borderRadius:18,padding:"16px",marginBottom:14,border:"1px solid #1e1e1e"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:10,color:"#555",letterSpacing:1}}>TOTAL OUTSTANDING</div>
          <div style={{fontSize:26,fontWeight:900,color:"#e94560",marginTop:4}}>₹{(totalDue/1000).toFixed(1)}K</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:"#555",letterSpacing:1}}>MIN TOTAL DUE</div>
          <div style={{fontSize:20,fontWeight:800,color:"#f97316",marginTop:4}}>₹{(totalMin/1000).toFixed(1)}K</div>
        </div>
      </div>
      <div style={{marginTop:12,display:"flex",gap:8}}>
        <div style={{flex:1,background:"rgba(233,69,96,0.08)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
          <div style={{fontSize:10,color:"#e94560"}}>PAY FULL BALANCE</div>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",marginTop:2}}>₹{(totalDue/1000).toFixed(1)}K</div>
        </div>
        <div style={{flex:1,background:"rgba(249,115,22,0.08)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
          <div style={{fontSize:10,color:"#f97316"}}>MIN AMOUNT</div>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",marginTop:2}}>₹{(totalMin/1000).toFixed(1)}K</div>
        </div>
      </div>
    </div>

    {/* Per card bills */}
    {sorted.map((card,i)=>{
      const days = getDaysUntil(card.dueDate);
      const urgency = days<=3?"#e94560":days<=7?"#f97316":"#34e89e";
      const pct = (card.spent/card.limit)*100;
      return (
        <div key={card.id} onClick={()=>onViewBill(card)}
          style={{background:"#111",borderRadius:16,padding:"14px 16px",marginBottom:10,border:`1px solid ${days<=3?"#e94560":days<=7?"#f97316":"#1e1e1e"}`,cursor:"pointer",animation:`slideUp 0.35s ease ${i*80}ms both`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${card.color[0]},${card.color[1]})`,flexShrink:0}}/>
              <div>
                <div style={{fontWeight:700,color:"#fff",fontSize:14}}>{card.name}</div>
                <div style={{fontSize:11,color:"#888",marginTop:2}}>Cycle closes {card.billCycle}</div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:18,fontWeight:800,color:"#e94560"}}>₹{(card.totalDue/1000).toFixed(1)}K</div>
              <div style={{fontSize:10,color:"#666",marginTop:2}}>total due</div>
            </div>
          </div>

          {/* Due date bar */}
          <div style={{marginTop:12,display:"flex",gap:10,alignItems:"center"}}>
            <div style={{flex:1}}>
              <div style={{height:4,background:"#1e1e1e",borderRadius:2}}>
                <div style={{width:`${Math.max(0,Math.min(100,(14-days)/14*100))}%`,height:"100%",background:urgency,borderRadius:2}}/>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:urgency,whiteSpace:"nowrap"}}>
              {days<=0?"OVERDUE!":days===1?"Due tomorrow":`Due in ${days}d`} · {card.dueDate}
            </div>
          </div>

          {/* Min due row */}
          <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:11,color:"#666"}}>Min due: <span style={{color:"#f97316",fontWeight:700}}>₹{card.minDue.toLocaleString()}</span></div>
            <div style={{fontSize:11,color:"#555"}}>Util: <span style={{color:pct>=80?"#e94560":pct>=60?"#f97316":"#34e89e",fontWeight:700}}>{pct.toFixed(0)}%</span></div>
            <div style={{fontSize:11,color:"#4286f4"}}>View details →</div>
          </div>
        </div>
      );
    })}
    <div style={{height:20}}/>
  </div>;
}

// ─── TRANSACTIONS TAB ─────────────────────────────────────────────────────────
function TransactionsTab({txns,cards,onAdd}){
  const [filter,setFilter]=useState("all");
  const filtered = filter==="all"?txns:filter==="qr"?txns.filter(t=>t.type==="qr"):txns.filter(t=>t.cardId===parseInt(filter));
  const totalSpent=filtered.reduce((s,t)=>s+t.amount,0);
  const totalPts=filtered.reduce((s,t)=>s+(t.points||0),0);

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,marginTop:8}}>
      <div style={S.secLabel}>TRANSACTIONS</div>
      <button onClick={onAdd} style={{background:"#1a1a2e",border:"1px solid #4286f4",color:"#4286f4",borderRadius:12,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add</button>
    </div>

    {/* Stats strip */}
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <div style={{flex:1,background:"#111",borderRadius:12,padding:"10px",border:"1px solid #1e1e1e",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#e94560"}}>₹{(totalSpent/1000).toFixed(1)}K</div>
        <div style={{fontSize:9,color:"#555",marginTop:2}}>SPENT</div>
      </div>
      <div style={{flex:1,background:"#111",borderRadius:12,padding:"10px",border:"1px solid #1e1e1e",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#34e89e"}}>{totalPts.toLocaleString()}</div>
        <div style={{fontSize:9,color:"#555",marginTop:2}}>POINTS EARNED</div>
      </div>
      <div style={{flex:1,background:"#111",borderRadius:12,padding:"10px",border:"1px solid #1e1e1e",textAlign:"center"}}>
        <div style={{fontSize:14,fontWeight:800,color:"#c084fc"}}>{txns.filter(t=>t.type==="qr").length}</div>
        <div style={{fontSize:9,color:"#555",marginTop:2}}>QR TXNs</div>
      </div>
    </div>

    {/* Filter chips */}
    <div style={{display:"flex",gap:7,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
      {[["all","All"],["qr","QR/UPI"],...cards.map(c=>[String(c.id),c.bank+" "+c.last4])].map(([v,l])=>(
        <button key={v} onClick={()=>setFilter(v)}
          style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${filter===v?"#4286f4":"#2a2a2a"}`,background:filter===v?"#0d1a33":"transparent",color:filter===v?"#4286f4":"#555",fontSize:11,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{l}</button>
      ))}
    </div>

    {/* List */}
    {filtered.map((txn,i)=>{
      const card=cards.find(c=>c.id===txn.cardId);
      return <div key={txn.id} style={{background:"#111",borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid #1e1e1e",display:"flex",alignItems:"center",gap:12,animation:`slideUp 0.3s ease ${Math.min(i,8)*40}ms both`}}>
        <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(135deg,${card?.color[0]||"#111"},${card?.color[1]||"#333"})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
          {txn.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,color:"#fff",fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{txn.merchant}</div>
          <div style={{fontSize:10,color:"#666",marginTop:2}}>
            {txn.category} · {txn.date}
            {txn.type==="qr"&&<span style={{color:"#c084fc",marginLeft:6}}>⬛ QR</span>}
          </div>
          <div style={{fontSize:10,color:"#888",marginTop:1}}>{card?.name} •••• {card?.last4}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontWeight:800,color:"#fff",fontSize:14}}>₹{txn.amount.toLocaleString()}</div>
          <div style={{fontSize:10,color:card?.accent||"#34e89e",marginTop:2}}>+{txn.points||0} pts</div>
        </div>
      </div>;
    })}
    {filtered.length===0 && <div style={{textAlign:"center",color:"#555",fontSize:13,padding:"40px 0"}}>No transactions found</div>}
    <div style={{height:20}}/>
  </div>;
}

// ─── INSIGHTS TAB ─────────────────────────────────────────────────────────────
function InsightsTab({cards,txns,totalLimit,totalSpent,totalAvailable}){
  const totalPoints=cards.reduce((s,c)=>s+c.points,0);
  const totalValue=cards.reduce((s,c)=>s+c.points*c.pointValue,0);

  // Category breakdown from txns
  const catSpend={};
  txns.forEach(t=>{ catSpend[t.category]=(catSpend[t.category]||0)+t.amount; });
  const topCats=Object.entries(catSpend).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCat=topCats[0]?.[1]||1;

  return <div>
    <div style={S.secLabel}>CONSOLIDATED CREDIT HEALTH</div>
    <div style={{background:"#111",borderRadius:20,padding:"16px",border:"1px solid #1e1e1e",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:10,color:"#666",letterSpacing:1}}>TOTAL LIMIT</div>
          <div style={{fontSize:26,fontWeight:900,color:"#fff",marginTop:4}}>₹{(totalLimit/100000).toFixed(1)}L</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:"#666",letterSpacing:1}}>CREDIT SCORE RISK</div>
          <div style={{fontSize:26,fontWeight:900,color:(totalSpent/totalLimit)<0.3?"#34e89e":(totalSpent/totalLimit)<0.6?"#f97316":"#e94560",marginTop:4}}>
            {(totalSpent/totalLimit)<0.3?"LOW":(totalSpent/totalLimit)<0.6?"MEDIUM":"HIGH"}
          </div>
        </div>
      </div>
      <div style={{height:8,borderRadius:4,overflow:"hidden",background:"#1e1e1e",display:"flex",marginTop:14}}>
        {cards.map(c=><div key={c.id} style={{width:`${(c.spent/totalLimit)*100}%`,background:c.accent}}/>)}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px",marginTop:8}}>
        {cards.map(c=><div key={c.id} style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:8,height:8,borderRadius:2,background:c.accent}}/>
          <span style={{fontSize:10,color:"#888"}}>{c.bank} {c.last4}</span>
        </div>)}
      </div>
      {cards.map(c=>(
        <div key={c.id} style={{marginTop:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:11,color:"#ccc"}}>{c.name}</span>
            <span style={{fontSize:10,color:"#666"}}>₹{(c.spent/1000).toFixed(0)}K / ₹{(c.limit/100000).toFixed(1)}L · {((c.spent/c.limit)*100).toFixed(0)}%</span>
          </div>
          <div style={{height:4,background:"#1e1e1e",borderRadius:2}}>
            <div style={{width:`${(c.spent/c.limit)*100}%`,height:"100%",background:c.accent,borderRadius:2}}/>
          </div>
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:14}}>
        {[["₹"+(totalAvailable/1000).toFixed(0)+"K","#34e89e","AVAILABLE"],["₹"+(totalSpent/1000).toFixed(0)+"K","#e94560","USED"],[cards.filter(c=>c.supportsQR).length+"","#c084fc","QR-ENABLED"],[cards.length+"","#fff","CARDS"]].map(([v,c,l])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:8,color:"#555",letterSpacing:1,marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Spend by category */}
    <div style={S.secLabel}>SPEND BY CATEGORY</div>
    <div style={{background:"#111",borderRadius:16,padding:"14px",border:"1px solid #1e1e1e",marginBottom:14}}>
      {topCats.map(([cat,amt],i)=>(
        <div key={cat} style={{marginBottom:i<topCats.length-1?12:0}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:"#ccc",fontWeight:600}}>{cat}</span>
            <span style={{fontSize:12,color:"#fff",fontWeight:700}}>₹{amt.toLocaleString()}</span>
          </div>
          <div style={{height:6,background:"#1e1e1e",borderRadius:3}}>
            <div style={{width:`${(amt/maxCat)*100}%`,height:"100%",borderRadius:3,background:`linear-gradient(90deg,#4286f4,#34e89e)`}}/>
          </div>
        </div>
      ))}
    </div>

    {/* Points */}
    <div style={S.secLabel}>POINTS PORTFOLIO</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      {[[totalPoints.toLocaleString(),"#fff","Total Points"],["₹"+totalValue.toFixed(0),"#34e89e","Points Value"]].map(([v,c,l])=>(
        <div key={l} style={{background:"#111",borderRadius:16,padding:"14px",border:"1px solid #1e1e1e"}}>
          <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
          <div style={{fontSize:10,color:"#666",marginTop:4,letterSpacing:1}}>{l.toUpperCase()}</div>
        </div>
      ))}
    </div>
    {cards.map((card,i)=>(
      <div key={card.id} style={{display:"flex",alignItems:"center",gap:12,background:"#111",borderRadius:14,padding:"10px 12px",marginBottom:8,border:"1px solid #1e1e1e",animation:`slideUp 0.35s ease ${i*80}ms both`}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,color:"#fff",fontSize:13}}>{card.name}{card.supportsQR&&<span style={{fontSize:9,color:"#c084fc",background:"#1a0533",padding:"1px 6px",borderRadius:6,marginLeft:6}}>RuPay QR</span>}</div>
          <div style={{fontSize:11,color:"#666",marginTop:2}}>{card.points.toLocaleString()} pts · ₹{(card.points*card.pointValue).toFixed(0)} value</div>
        </div>
        <div style={{width:110}}>
          <div style={{height:6,background:"#1e1e1e",borderRadius:3}}>
            <div style={{height:"100%",borderRadius:3,background:`linear-gradient(90deg,${card.color[1]},${card.accent})`,width:`${(card.points/totalPoints)*100}%`}}/>
          </div>
          <div style={{fontSize:10,color:"#666",marginTop:3,textAlign:"right"}}>{((card.points/totalPoints)*100).toFixed(0)}%</div>
        </div>
      </div>
    ))}

    <div style={S.secLabel}>BEST CARD BY CATEGORY</div>
    {categories.slice(0,5).map((cat,i)=>{
      const key=categoryRewardKey[cat];
      const best=cards.reduce((a,b)=>(a.rewardRate[key]||1)>=(b.rewardRate[key]||1)?a:b);
      const icons=["🍽️","✈️","⛽","🛍️","🎬"];
      return <div key={cat} style={{display:"flex",alignItems:"center",gap:12,background:"#111",borderRadius:14,padding:"10px 12px",marginBottom:8,border:"1px solid #1e1e1e",animation:`slideUp 0.35s ease ${i*60}ms both`}}>
        <div style={{fontSize:16}}>{icons[i]}</div>
        <div style={{flex:1}}><div style={{fontSize:13,color:"#ddd",fontWeight:600}}>{cat}</div></div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:12,color:best.accent,fontWeight:700}}>{best.name}</div>
          <div style={{fontSize:10,color:"#666"}}>{best.rewardRate[key]}X points</div>
        </div>
      </div>;
    })}
    <div style={{height:20}}/>
  </div>;
}

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const S = {
  phone:{width:390,height:844,margin:"0 auto",background:"#0a0a0a",borderRadius:50,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 40px 80px rgba(0,0,0,0.8),inset 0 0 0 1px rgba(255,255,255,0.1)",fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",position:"relative"},
  notch:{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:120,height:34,background:"#0a0a0a",borderRadius:"0 0 20px 20px",zIndex:100},
  statusBar:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px 0",color:"#fff",fontSize:13,fontWeight:600,flexShrink:0},
  time:{fontWeight:700,fontSize:15},
  statusIcons:{display:"flex",gap:6,alignItems:"center"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 20px 8px",flexShrink:0},
  greet:{fontSize:12,color:"#666",letterSpacing:0.5},
  title:{fontSize:26,fontWeight:800,color:"#fff",letterSpacing:-0.5},
  avatar:{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#e94560,#4286f4)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12},
  qrFab:{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#2d1b4e,#6c3fc7)",border:"none",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 12px rgba(192,132,252,0.3)"},
  qrChip:{background:"#1a0533",border:"1px solid #6c3fc7",color:"#c084fc",borderRadius:12,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"},
  banner:{margin:"0 16px 6px",background:"#111",borderRadius:16,padding:"12px 14px",border:"1px solid #1e1e1e",flexShrink:0},
  bannerRow:{display:"flex",alignItems:"center",marginBottom:10},
  divider:{width:1,height:30,background:"#2a2a2a"},
  masterBar:{height:6,borderRadius:3,overflow:"hidden",background:"#1e1e1e",display:"flex"},
  content:{flex:1,overflowY:"auto",padding:"0 16px",scrollbarWidth:"none"},
  secLabel:{fontSize:10,fontWeight:800,color:"#555",letterSpacing:2,textTransform:"uppercase",marginBottom:10,marginTop:10},
  cardTile:{borderRadius:20,padding:"16px 18px",marginBottom:10,cursor:"pointer",transition:"transform 0.2s"},
  detailBox:{borderRadius:"0 0 16px 16px",padding:"12px 14px",marginBottom:10,background:"#111",border:"1px solid #2a2a2a",borderTop:"none"},
  bottomNav:{display:"flex",background:"rgba(12,12,12,0.95)",backdropFilter:"blur(20px)",padding:"10px 0 24px",borderTop:"1px solid #1e1e1e",flexShrink:0},
  navBtn:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer",color:"#555",padding:"4px 0"},
  navActive:{color:"#fff"},
};
