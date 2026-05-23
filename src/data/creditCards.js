// ─── Your Credit Card Database ────────────────────────────────────────────────
// Accurate reward rates and features for your specific cards.
// rewardRate: points (or cashback %) earned per ₹100 spent.
// pointValue:  ₹ per point. For cashback cards this is 1.0 (1 "point" = ₹1).

export const CARD_DB = [
  // ─── ICICI RubyX Mastercard ────────────────────────────────────────────────
  {
    slug: "icici_rubyx_mc",
    name: "ICICI RubyX",
    bank: "ICICI Bank",
    network: "Mastercard",
    color: ["#1a0010", "#3a0020"],
    accent: "#f43f5e",
    rewardRate: { dining: 2, travel: 2, fuel: 2, shopping: 2, other: 2 },
    pointValue: 0.25,
    annualFee: 2000,
    supportsQR: false,
    benefits: [
      "2 RP/₹100 on all domestic spends",
      "4 RP/₹100 on international spends",
      "Lounge access (after ₹75K/quarter)",
      "8 railway lounge visits/year",
      "25% off movies (BookMyShow / INOX)",
      "Golf privileges",
      "15% off dining at 800+ restaurants",
    ],
  },

  // ─── ICICI RubyX Amex ──────────────────────────────────────────────────────
  {
    slug: "icici_rubyx_amex",
    name: "ICICI RubyX Amex",
    bank: "ICICI Bank",
    network: "Amex",
    color: ["#1a0010", "#4a0028"],
    accent: "#fb7185",
    rewardRate: { dining: 2, travel: 2, fuel: 2, shopping: 2, other: 2 },
    pointValue: 0.25,
    annualFee: 2000,
    supportsQR: false,
    benefits: [
      "2 RP/₹100 on all domestic spends (same as MC variant since Jan 2025)",
      "4 RP/₹100 on international spends",
      "Lounge access (after ₹75K/quarter)",
      "Movie discounts, golf, concierge",
    ],
  },

  // ─── SBI Prime RuPay ───────────────────────────────────────────────────────
  {
    slug: "sbi_prime_rupay",
    name: "SBI Card Prime",
    bank: "SBI Card",
    network: "RuPay",
    color: ["#001a40", "#003a7a"],
    accent: "#3b82f6",
    rewardRate: { dining: 10, travel: 2, fuel: 0, shopping: 2, other: 10 },
    pointValue: 0.25,
    annualFee: 2999,
    supportsQR: true,
    benefits: [
      "10X RP on dining, groceries & movies",
      "2 RP/₹100 on all other eligible spends",
      "4 international lounge visits/year (Priority Pass)",
      "2 domestic lounge visits/quarter",
      "Club ITC Silver membership",
      "₹3,000 welcome voucher",
      "UPI credit card payments on RuPay",
    ],
  },

  // ─── HDFC Swiggy Mastercard (cashback) ────────────────────────────────────
  {
    slug: "hdfc_swiggy_mc",
    name: "HDFC Swiggy",
    bank: "HDFC Bank",
    network: "Mastercard",
    color: ["#3d0a00", "#6b1a00"],
    accent: "#f97316",
    rewardRate: { dining: 10, travel: 1, fuel: 0, shopping: 5, other: 1 },
    pointValue: 1.0,
    isCashback: true,
    annualFee: 500,
    supportsQR: false,
    benefits: [
      "10% cashback on all Swiggy spends (Food, Instamart, Dineout, Genie)",
      "5% cashback on online shopping",
      "1% on all other eligible spends",
      "3-month Swiggy One membership (welcome)",
      "Mastercard golf: 4 green fees + 12 lessons/year",
      "Fee waiver on ₹2L annual spend",
    ],
  },

  // ─── Axis Flipkart Mastercard (cashback) ──────────────────────────────────
  {
    slug: "axis_flipkart_mc",
    name: "Axis Flipkart",
    bank: "Axis Bank",
    network: "Mastercard",
    color: ["#051937", "#0f3460"],
    accent: "#f59e0b",
    rewardRate: { dining: 4, travel: 5, fuel: 1, shopping: 7, other: 1 },
    pointValue: 1.0,
    isCashback: true,
    annualFee: 500,
    supportsQR: false,
    benefits: [
      "7.5% on Myntra (cap ₹4K/quarter)",
      "5% on Flipkart & Cleartrip (cap ₹4K/quarter)",
      "4% unlimited on Swiggy, Uber, PVR, Cult.fit",
      "1% unlimited cashback everywhere else",
      "Fuel surcharge waiver (₹400–₹4,000 txns)",
      "Fee waiver on ₹3.5L annual spend",
    ],
  },

  // ─── Axis Neo RuPay ────────────────────────────────────────────────────────
  {
    slug: "axis_neo_rupay",
    name: "Axis Neo",
    bank: "Axis Bank",
    network: "RuPay",
    color: ["#1a0808", "#3a1010"],
    accent: "#f43f5e",
    rewardRate: { dining: 1, travel: 1, fuel: 0, shopping: 1, other: 1 },
    pointValue: 0.10,
    annualFee: 0,
    supportsQR: true,
    benefits: [
      "Lifetime FREE card",
      "40% off on Zomato (up to ₹120, twice/month)",
      "10% off BookMyShow (up to ₹100/month)",
      "15% off EazyDiner (up to ₹500, once/month)",
      "10% off Blinkit & Myntra",
      "UPI credit card payments on RuPay",
      "1% fuel surcharge waiver",
    ],
  },

  // ─── HDFC BizGrow Visa (business) ─────────────────────────────────────────
  {
    slug: "hdfc_bizgrow_visa",
    name: "HDFC BizGrow",
    bank: "HDFC Bank",
    network: "Visa",
    color: ["#0a1a0a", "#1a3a1a"],
    accent: "#22c55e",
    rewardRate: { dining: 1, travel: 5, fuel: 1, shopping: 1, other: 5 },
    pointValue: 0.25,
    annualFee: 500,
    supportsQR: false,
    benefits: [
      "10X on GST, advance tax, hotel/flight (MMT MyBiz), BigBasket",
      "2 CashPoints/₹200 on all other spends",
      "Milestone: 2,000 CP every quarter on ₹1L spend",
      "Flat 10% off at 35,000+ dining partners",
      "Business software discounts (Google Workspace, AWS, Tally)",
      "Fuel surcharge waiver (₹400–₹5,000 txns)",
    ],
  },

  // ─── HDFC UPI RuPay Biz (virtual, business) ────────────────────────────────
  {
    slug: "hdfc_upi_rupay_biz",
    name: "HDFC Biz UPI RuPay",
    bank: "HDFC Bank",
    network: "RuPay",
    color: ["#0d1a33", "#1a3060"],
    accent: "#60a5fa",
    rewardRate: { dining: 3, travel: 1, fuel: 0, shopping: 1, other: 2 },
    pointValue: 0.25,
    annualFee: 250,
    supportsQR: true,
    benefits: [
      "UPI QR credit payments (primary use case)",
      "3 CP/₹100 on dining, groceries & PayZapp",
      "2 CP/₹100 on utilities",
      "1 CP/₹100 on all other spends",
      "Virtual card — no physical card issued",
      "₹250 annual fee (waived on ₹25K spend)",
      "Up to 50 days interest-free credit",
    ],
  },

  // ─── RBL Supercard Visa ────────────────────────────────────────────────────
  {
    slug: "rbl_supercard_visa",
    name: "RBL Supercard",
    bank: "RBL Bank",
    network: "Visa",
    color: ["#1a001a", "#350035"],
    accent: "#a855f7",
    rewardRate: { dining: 1, travel: 1, fuel: 1, shopping: 2, other: 1 },
    pointValue: 0.25,
    annualFee: 499,
    supportsQR: false,
    benefits: [
      "Interest-free ATM cash withdrawals (up to 50 days, 2.5% fee)",
      "0% interest emergency loan from cash limit (once/year)",
      "2X reward points on online spends",
      "4-in-1 card: Credit + Cash + Loan + EMI",
      "₹100 off BookMyShow",
      "1% fuel surcharge waiver",
      "Fee waiver on ₹50K annual spend",
    ],
  },
];

// Fuzzy search — returns matching cards as user types
export function searchCards(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return CARD_DB.filter(
    c =>
      c.name.toLowerCase().includes(q) ||
      c.bank.toLowerCase().includes(q) ||
      c.network.toLowerCase().includes(q) ||
      c.slug.includes(q.replace(/\s+/g, "_"))
  );
}
