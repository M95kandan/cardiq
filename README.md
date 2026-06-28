# CardIQ

A personal credit card management dashboard — track spending, bills, EMIs, rewards, and get smart card recommendations.

## Features

- **Cards** — Add and manage multiple credit cards with custom colours and reward rates
- **Smart Pay** — Get the best card recommendation for any spend category (dining, travel, fuel, shopping, etc.) and payment type (card swipe, QR/UPI)
- **Bills** — Track billed dues (statement amounts only, not unbilled), minimum due, upcoming due dates with auto-advance, and payment history
- **Transactions** — Import from PDF statements, add via SMS text or manually; filter by card, category, source (billed/unbilled)
- **Insights** — Spending breakdowns by category and card, utilisation charts
- **Budget** — Set monthly category budgets and track progress
- **EMI Tracking** — Log and track active EMIs per card
- **Statement Import** — Parse credit card PDF statements (HDFC, ICICI, SBI, Axis, RBL, Kotak, and more); auto-detect card, billing summary, and transactions
- **Community Cards** — Submit missing cards to a shared database

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 (functional components, hooks) |
| Build tool | Vite 5 |
| Routing | react-router-dom v6 (BrowserRouter, useNavigate, useLocation) |
| Backend / Auth | Supabase (PostgreSQL + Row Level Security) |
| Storage | Supabase JSONB columns for cards and transactions |
| PDF parsing | pdfjs-dist (Mozilla PDF.js) |
| QR scanning | jsqr |
| Charts | Recharts |
| Styling | Inline styles only (no CSS framework) |
| Hosting | Vercel (SPA rewrites via vercel.json) |

## Project Structure

```
src/
  components/
    CardIQ.jsx          # Main app — all tabs, modals, and state
    AuthGate.jsx        # Auth wrapper (Supabase session gate)
  lib/
    supabase.js         # Supabase client
    statementParser.js  # PDF statement parser (transactions + billing summary)
  data/
    creditCards.js      # Static card database + search utility
  main.jsx              # Entry point with BrowserRouter + AuthGate
  index.css             # Global reset / base styles

supabase/
  schema.sql            # Table definitions and RLS policies
```

## Database Schema

```sql
cards             -- card metadata (JSONB), per user
transactions      -- all transactions (JSONB), per user, FK to cards
community_cards   -- user-submitted cards, publicly readable once approved
```

## Routes

| Path | Tab |
|---|---|
| `/home` | Cards |
| `/smartpay` | Smart Pay |
| `/bills` | Bills |
| `/transactions` | Transactions |
| `/insights` | Insights |
| `/budget` | Budget |

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor
2. Add environment variables:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. `npm install && npm run dev`
