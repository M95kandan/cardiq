// ─── Credit Card Statement PDF Parser ────────────────────────────────────────
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// ── Extract text lines from PDF, preserving row structure ─────────────────────
export async function extractPDFLines(file, password = undefined) {
  const buffer = await file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const task = pdfjsLib.getDocument({ data: buffer, password });

    // Called when PDF needs a password (reason 1=needed, 2=wrong)
    task.onPassword = (_, reason) => {
      const err = new Error(reason === 2 ? "PASSWORD_WRONG" : "PASSWORD_NEEDED");
      err.isPasswordError = true;
      reject(err);
    };

    task.promise.then(async (pdf) => {
      const allLines = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();

        // Group text items by Y coordinate (±3px tolerance)
        const rowMap = new Map();
        for (const item of content.items) {
          const y = Math.round(item.transform[5] / 6) * 6;
          if (!rowMap.has(y)) rowMap.set(y, []);
          rowMap.get(y).push({ x: item.transform[4], str: item.str });
        }

        const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);
        for (const y of sortedYs) {
          const row  = rowMap.get(y).sort((a, b) => a.x - b.x);
          const line = row.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
          if (line) allLines.push(line);
        }
      }
      resolve(allLines);
    }).catch(reject);
  });
}

// ── Convert date strings to ISO YYYY-MM-DD ────────────────────────────────────
function normalizeDate(str) {
  if (!str) return null;
  str = str.trim().replace(/,/g, "").replace(/'/g, "");
  const M = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

  // "08 Jun 2026" or "08 Jun 26"  (DD Mon YY/YYYY)
  const m1 = str.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/);
  if (m1) {
    const mon = M[m1[2].toLowerCase()];
    if (mon) {
      const yr = m1[3].length === 2 ? "20" + m1[3] : m1[3];
      return `${yr}-${String(mon).padStart(2,"0")}-${String(m1[1]).padStart(2,"0")}`;
    }
  }
  // "May 29 2026"  (Mon DD YYYY — ICICI)
  const m3 = str.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (m3) {
    const mon = M[m3[1].toLowerCase()];
    if (mon) return `${m3[3]}-${String(mon).padStart(2,"0")}-${String(m3[2]).padStart(2,"0")}`;
  }
  // "08/06/2026"
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2,"0")}-${m2[1].padStart(2,"0")}`;
  return null;
}

// ── Detect card identity from statement ───────────────────────────────────────
export function parseCardIdentity(lines) {
  const text = lines.join(" ");

  // Last 4 digits — various masking styles:
  // HDFC: "526873XXXXXX5870"  ICICI: "3747XXXXXXXX2002"  Axis: "6530XXXXXXXX1470"
  // SBI:  "XXXX XXXX XXXX XX00"  (only 2 visible — try anyway)
  let last4 = null;
  const cardPatterns = [
    /\d{4,6}[Xx*\s]{4,10}(\d{4})\b/,                        // NNNNXXXXlast4
    /[Xx*]{4}\s*[Xx*]{4}\s*[Xx*]{4}\s*[Xx*]{0,2}(\d{2,4})\b/, // XXXX XXXX XXXX (XX)1234
    /credit\s*card\s*(?:no|number|#)?[^0-9]{0,10}[\dXx*\s]{8,}?(\d{4})\b/i,
  ];
  for (const pat of cardPatterns) {
    const m = text.match(pat);
    if (m && m[1].length >= 2) { last4 = m[1].padStart(4, "X"); break; }
  }

  // Bank name
  let bank = null;
  const bankMap = [
    [/hdfc\s+bank/i,           "HDFC Bank"],
    [/icici\s+bank/i,          "ICICI Bank"],
    [/sbi\s+card|state\s+bank/i, "SBI Card"],
    [/axis\s+bank/i,           "Axis Bank"],
    [/rbl\s+bank/i,            "RBL Bank"],
    [/kotak/i,                 "Kotak"],
    [/yes\s+bank/i,            "Yes Bank"],
    [/indusind/i,              "IndusInd"],
    [/american\s+express|amex/i, "Amex"],
  ];
  for (const [pat, name] of bankMap) {
    if (pat.test(text)) { bank = name; break; }
  }

  return { last4, bank };
}

// ── Extract billing summary (total due, min due, dates) ───────────────────────
export function parseBillingSummary(lines) {
  const text   = lines.join(" ");
  const toNum  = s => parseFloat(s.replace(/,/g, ""));
  const amt    = (m) => m ? toNum(m[1]) : 0;
  const date   = (m) => m ? normalizeDate(m[1].trim().replace(/,/g, "")) : null;
  const allNums = s => [...s.matchAll(/([\d,]+\.\d{2})/g)].map(m => toNum(m[1]));

  // ── Total Amount Due ──────────────────────────────────────────────────────
  // HDFC layout: header row has column labels (incl "TOTAL AMOUNT DUE") and
  // the next row has values. Find label line, take LAST number in following row.
  // SBI layout: "*Total Amount Due ( ₹ )" on one line, "16,174.00" on next.
  // ICICI layout: formula table "Prev + Purchases - Payments = Total Amount Due"
  //   with all 4 column values merged on same line after label. The label is
  //   the RIGHTMOST column header (preceded by `=`), so take the LAST number.
  // RBL layout: "Total Amount Due `13,907.02 ..." — label then value, take FIRST.
  let totalDue = 0;

  // Scan ALL occurrences of "Total Amount Due" and keep the LARGEST value found.
  // This handles ICICI multi-card statements where an earlier section shows a smaller
  // sub-total (e.g. previous balance ₹22,260) before the grand total (₹33,575.44).
  const totalDueLabelRe = /total\s+(?:amount|payment)\s+due|total\s+outstanding(?:\s+(?:amount|balance))?|net\s+(?:amount\s+)?payable/i;
  for (let i = 0; i < lines.length; i++) {
    if (!totalDueLabelRe.test(lines[i])) continue;
    const labelMatch  = lines[i].match(totalDueLabelRe);
    const beforeLabel = lines[i].slice(0, labelMatch.index).trim();
    const afterLabel  = lines[i].slice(labelMatch.index + labelMatch[0].length);
    const afterNums   = allNums(afterLabel);
    // ICICI formula layout: "= Total Amount Due" is the LEFTMOST column.
    // Its values row is ordered: [total, prev_balance, purchases, payments].
    // → take FIRST number (leftmost = total due).
    // HDFC formula layout: "Total Amount Due" is the RIGHTMOST column.
    // Its values row is ordered: [prev, purchases, payments, total].
    // → take LAST number (rightmost = total due).
    // All other banks (RBL, SBI): label is standalone, value immediately follows.
    // → take FIRST number.
    const iciciFormula = /=\s*$/.test(beforeLabel); // "= Total Amount Due"
    let candidate = 0;
    if (afterNums.length >= 1) {
      // Value(s) on same line after label — always take first (label's own value comes first)
      candidate = afterNums[0];
    } else {
      // Case B: value on next 1-3 lines (HDFC multi-col, SBI standalone, ICICI values row)
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const nums = allNums(lines[j]);
        if (nums.length === 0) continue;
        candidate = iciciFormula ? nums[0] : nums[nums.length - 1];
        break;
      }
    }
    if (candidate > totalDue) totalDue = candidate; // keep the largest (grand total wins)
  }

  // Fallback: scan joined text for "Total Amount Due" with nearby number (ICICI backtick style)
  if (!totalDue) {
    const m = text.match(/total\s+amount\s+due[^`₹\d]{0,20}[`₹]?\s*([\d,]+\.\d{2})/i);
    if (m) totalDue = toNum(m[1]);
  }

  // ── Minimum Due ───────────────────────────────────────────────────────────
  // Same multi-line issue: find label line, grab first number on same or next line
  let minDue = 0;
  const minDueLabelRe = /min(?:imum)?\.?\s*(?:amount\s+|payment\s+|amt\.?\s*)?due/i;
  for (let i = 0; i < lines.length && !minDue; i++) {
    if (!minDueLabelRe.test(lines[i])) continue;
    const sameNums = allNums(lines[i]);
    if (sameNums.length > 0) { minDue = sameNums[0]; break; }
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const nums = allNums(lines[j]);
      if (nums.length > 0) { minDue = nums[0]; break; }
    }
  }
  // Fallback to joined text
  if (!minDue) minDue = amt(text.match(/min(?:imum)?\.?\s*(?:amount\s+|payment\s+|amt\.?\s*)?due[^`₹\d=]{0,50}[`₹C]?\s*([\d,]+\.\d{2})/i));

  // Sanity check: totalDue must be >= minDue. If not, the parser grabbed the wrong number.
  // Re-scan using the largest number found on/near the label line.
  if (totalDue > 0 && minDue > 0 && totalDue < minDue) {
    totalDue = 0;
    for (let i = 0; i < lines.length && !totalDue; i++) {
      if (!totalDueLabelRe.test(lines[i])) continue;
      const combined = lines.slice(i, Math.min(i + 4, lines.length)).join(" ");
      const nums = allNums(combined);
      if (nums.length > 0) { totalDue = Math.max(...nums); break; }
    }
  }

  // Payment Due Date — DD Mon YYYY, Mon DD YYYY, DD/MM/YYYY
  const dueDate = date(
    text.match(/(?:payment\s+)?due\s+date\s*:?\s*([A-Za-z]{3}\s+\d{1,2}\s+\d{4})/i) ||
    text.match(/(?:payment\s+)?due\s+date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3}\s+'?\d{2,4})/i) ||
    text.match(/(?:payment\s+)?due\s+date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  );

  // Statement Date
  const stmtDate = date(
    text.match(/statement\s+date\s*:?\s*(\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/i) ||
    text.match(/statement\s+date\s*:?\s*([A-Za-z]{3}\s+\d{1,2}\s+\d{4})/i) ||
    text.match(/statement\s+date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3}\s+'?\d{2,4})/i)
  );

  return { totalDue, minDue, dueDate, stmtDate };
}

// ── Auto-detect merchant category ────────────────────────────────────────────
export function detectCategory(desc) {
  const d = desc.toLowerCase();
  if (/swiggy|zomato|ubereat|food|restaurant|cafe|kfc|mcdon|domino|pizza|burger|dineout/.test(d)) return "Dining";
  if (/uber(?!eat)|ola|rapido|irctc|indigo|spicejet|air.*india|airline|flight|metro|railway|redbus/.test(d)) return "Travel";
  if (/hpcl|bpcl|iocl|petrol|fuel|shell|essar|nayara|surcharge/.test(d)) return "Fuel";
  if (/amazon|flipkart|myntra|ajio|nykaa|meesho|snapdeal|shopclues/.test(d)) return "Online Shopping";
  if (/bigbasket|zepto|blinkit|dunzo|grofer|dmart|reliance fresh|more super|jiomart/.test(d)) return "Groceries";
  if (/netflix|hotstar|amazon prime|zee5|sony|bookmyshow|pvr|inox|movie|ott/.test(d)) return "Entertainment";
  return "Other";
}

const CAT_ICONS = {
  Dining: "🍽️", Travel: "✈️", Fuel: "⛽", Shopping: "🛍️",
  Entertainment: "🎬", "Online Shopping": "📦", Groceries: "🛒", Other: "💳",
};

export function categoryIcon(cat) {
  return CAT_ICONS[cat] || "💳";
}

// ── Parse transactions from extracted lines ───────────────────────────────────
export function parseTransactions(lines) {
  const DATE_PATTERNS = [
    // DD/MM/YYYY with optional |HH:MM time (HDFC Swiggy)
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s*\|\s*\d{2}:\d{2})?\s+/,
    // DD Mon 'YY or DD Mon YY or DD Mon YYYY (SBI, Axis Neo, ICICI) — apostrophe before 2-digit year
    /^(\d{1,2}[\-\s][A-Za-z]{3}[\-\s,]\s*'?\d{2,4})\s+/,
    // Mon DD, YYYY
    /^([A-Za-z]{3}\s+\d{1,2},?\s*\d{4})\s+/,
  ];

  const AMOUNT_PATTERNS = [
    // 450.00 Dr / 450.00 Cr  (HDFC, ICICI, Axis, RBL)
    /([\d,]+\.\d{2})\s*(Cr|CR|Dr|DR)\b/,
    // 450.00 D / 450.00 C  (SBI single letter)
    /([\d,]+\.\d{2})\s+([CD])\b/,
    // 450.00 Debit / 450.00 Credit  (Axis Neo, RBL)
    /([\d,]+\.\d{2})\s+(Debit|Credit)\b/i,
    // ₹ 450.00 Debit / ₹ 450.00  (Axis Neo ₹-prefix style)
    /₹\s*([\d,]+\.\d{2})\s*(Debit|Credit)?\b/i,
    // 663.00 or 663.00 l  — trailing amount + optional PI indicator (HDFC Swiggy)
    /\b([\d,]+\.\d{2})\s*(?:\s+[a-zA-Z])?\s*$/,
  ];

  const results = [];

  for (const line of lines) {
    let dateStr = null;
    let rest    = line;
    for (const pat of DATE_PATTERNS) {
      const m = line.match(pat);
      if (m) { dateStr = m[1].trim(); rest = line.slice(m[0].length); break; }
    }
    // Fallback: mid-line date (RBL two-column layout merges account-summary + transaction row)
    if (!dateStr) {
      for (const pat of DATE_PATTERNS) {
        const midPat = new RegExp(pat.source.replace(/^\^/, ""), pat.flags);
        const m = line.match(midPat);
        if (m && m.index > 5) {
          dateStr = m[1].trim();
          rest = line.slice(m.index + m[0].length);
          break;
        }
      }
    }
    if (!dateStr) continue;

    // Skip dates from billing history / account summary sections (e.g. RBL shows 2018–2019 old cycles)
    const yr4 = dateStr.match(/\b(20\d{2})\b/);
    if (yr4 && parseInt(yr4[1]) < 2020) continue;

    let amount       = null;
    let txnType      = "debit";
    let explicitType = false;
    for (const pat of AMOUNT_PATTERNS) {
      const m = rest.match(pat);
      if (m) {
        amount = parseFloat(m[1].replace(/,/g, ""));
        if (m[2]) { txnType = /^c/i.test(m[2]) ? "credit" : "debit"; explicitType = true; }
        rest = rest.replace(m[0], "").trim();
        break;
      }
    }
    if (!amount || amount <= 0 || amount > 10_000_000) continue;

    const description = rest
      .replace(/\d{4,}/g, "")         // remove long ref numbers
      .replace(/\s+\d{1,3}\s*$/, "")  // remove trailing short numbers (ICICI reward pts col)
      .replace(/[\/\-]{2,}/g, " ")
      .replace(/\bC\b/g, "")          // remove HDFC Swiggy currency marker
      .replace(/\s+/g, " ")
      .trim();

    if (!description || description.length < 3) continue;

    // Infer credit from description if no explicit Dr/Cr marker (HDFC Swiggy cashbacks)
    if (!explicitType && /cashback|reversal|refund|adj_|credit note|waiver/i.test(description)) {
      txnType = "credit";
    }

    // Skip summary/header/system rows and bare type-words
    if (/^(debit|credit)$/i.test(description)) continue;
    // Skip descriptions that are just a date label (e.g. "- 21 Jan", "02 Feb")
    if (/^-?\s*\d{1,2}\s+[A-Za-z]{3}\s*$/.test(description)) continue;
    if (/opening balance|closing balance|payment received|payment credit|surcharge waiver|transactions for|minimum amount due|finance charge|late payment fee|emi interest|emi instalment|emi principal|goods.{0,5}service.{0,5}tax|\b[CSI]?GST\b|stpl emi|dial for cash|\btax\b|service charge|annual fee|joining fee|renewal fee|overlimit fee|cheque bounce|cash advance fee|processing fee|insurance premium|\bloan\b|loan repayment|loan instalment|loan emi|instaloan/i.test(description)) continue;

    const category = detectCategory(description);
    results.push({
      date: dateStr, description, amount,
      type: txnType, category,
      icon: categoryIcon(category),
      selected: txnType === "debit",
    });
  }

  return results;
}
