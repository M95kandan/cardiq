I'm building CardIQ — a React iOS-style credit card manager app.
Current file: src/components/CardIQ.jsx (single file, ~980 lines)

Features already built:
- 4 cards: HDFC Regalia (Visa), Axis Magnus (Mastercard), SBI SimplyCLICK (Visa), HDFC UPI RuPay (supportsQR: true)
- Tabs: Cards, Smart Pay, Bills, Transactions, Insights
- Consolidated credit limit banner (Total Limit / Used / Available + stacked bar)
- Spend alert banner (fires when utilization > threshold)
- QR Pay modal (3-step: scan → confirm → success) for RuPay card
- Bills tab: due dates, min due, total outstanding, bill detail modal
- Transactions tab: manual add, filter by card/QR, live updates card balance + points
- Smart Pay: picks best card by category + payment type (card vs QR)
- Insights: credit health, spend by category, points portfolio

Next I want to: [tell it what to do next]