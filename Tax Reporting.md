# One‑Page Australian Tax Statement — Design & Hackathon Plan

Clients log in, pick a financial year (FY), and instantly download a **single, accountant‑ready page** summarising trading‑related tax totals for **Australian residents** (nabtrade‑style platform).

---

## 1) Concept → Crisp Problem Statement

**On the one‑page statement (FY summary):**
- **Identity & account**: Client name, HIN(s)/account#, residency = AU, FY dates.
- **Income**: Dividends (franked, unfranked), franking credits, interest, foreign income & foreign withholding.
- **Capital gains**: Total capital gains, discounts (e.g., 50% for eligible >12-month holdings), capital losses applied, **net capital gain**.
- **Deductions/fees**: Brokerage & platform fees (if surfaced), other claimable items captured in platform.
- **Notes**: ATO label mapping (descriptive), method notes (parcel selection, discount logic), important disclaimers.
- **QR / deep link**: To a detailed drill‑down (web) and CSV export for the accountant, plus “Explain this” AI summary.

---

## 2) Quick Scoring (Hackathon Lens)

| Dimension | Score | Why |
|---|---:|---|
| **Doability (thin-slice)** | 4/5 | Start with **ASX equities only**, FIFO parcels, buys/sells, dividends (incl. franking), interest. Ignore options, shorts, AMIT/ETF annual tax statements & complex corporate actions in v1. |
| **Difficulty** | 3/5 | Parcelization, CGT discount window, franking credits, and reconciling data pipelines; manageable if scope is tight. |
| **Business Value** | 5/5 | Huge client/CPA time saver; reduces service calls; differentiates vs brokers without clean statements. |
| **Wow Factor** | 4/5 | “One‑click statement” + **AI explanation/Q&A** + side‑by‑side **what changed vs last year** and CSV export. |

---

## 3) High‑Level Solution (Architecture, Data Model, APIs)

### 3.1 Minimal Viable Scope (Hackathon Cut)
**In‑scope:**
- AU residents; **ASX equities**; buy/sell (A1 CGT event), cash dividends (franked/unfranked), interest, foreign dividend income if present; **FIFO** parcel method; CGT **50% discount** where eligible; brokerage included in cost base/proceeds; DRP as additional buys at issue price (if data available).

**Out‑of‑scope (Phase 2+):**
- AMIT/ETF annual tax statements, tax‑deferred/return of capital, TOFA, options, short selling, complex corporate actions (demergers, consolidations, off‑market buy‑backs), carried‑forward losses (unless provided), HIN moves with incomplete basis.

### 3.2 Reference Architecture (Service Slices)
- **Identity & Entitlements**: Reuse platform auth (client → investment accounts → sub‑accounts/HINs).
- **Data Ingestion Layer** (read‑only):
  - **Trades** (buys/sells with qty, price, fees, timestamps, symbol, market).
  - **Cash Movements** (dividends, interest, foreign withholding).
  - **Securities Master** (instrument type, AU residency flag).
  - **Corporate Actions (Phase 2)** from vendor.
- **Parcelization & CGT Engine** (stateless compute over FY + carryover context):
  - Create/consume **TaxLots**; close lots on disposal; compute gains/losses; flag **discount eligibility** (>12 months).
- **Income Aggregator**:
  - Sum **franked**, **unfranked**, **franking credits**, **interest**, **foreign income/withholding** by FY.
- **Rules & Label Mapper**:
  - Map totals to high‑level **ATO categories** (descriptive in UI to avoid label drift); apply rounding.
- **Statement Composer**:
  - Build **Statement JSON**; render **PDF (1 page)**; produce **CSV**; sign with doc hash (calc trace id).
- **GenAI Explainer**:
  - Plain‑English “How to read this” + “What changed vs last year?” summary; **Q&A** grounded in statement.
- **BFF for Mini‑App**:
  - UI to select FY → preview → download PDF/CSV → “Explain”.

**Suggested Deployment**
- Keep **Tax Engine** as a microservice callable synchronously.
- Cache results per account+FY (warmable).
- Observability: **calculation trace ID** attached to PDF/CSV for audit.

### 3.3 Core Data Model (Simplified)

**Transaction**
```
id, account_id, security_id, type: BUY|SELL|DIVIDEND|INTEREST|FOREIGN_DIV|DRP
trade_date, settle_date, qty, price, fees, gross_amount, franking_credit, foreign_withholding, currency
```

**Security**
```
id, symbol, name, instrument_type (EQUITY, ETF*), residency (AU/Foreign), DRP_flag
```

**TaxLot**
```
id, account_id, security_id, open_txn_id, open_date, qty_opened, cost_base_total, qty_remaining
```

**CapitalGain**
```
id, account_id, security_id, sell_txn_id, qty_sold, proceed_total, cost_base_applied,
gain, discount_applied (bool), discounted_gain, loss
```

**IncomeAggregate (per FY)**
```
dividends_unfranked, dividends_franked, franking_credits, interest, foreign_income, foreign_withholding
```

**Statement (per account_id + FY)**
```
identity: client_name, residency, HINs/accounts
income: from IncomeAggregate
capital_gains: { total_gross_gains, discounts, total_losses_applied, net_capital_gain }
deductions/fees (if surfaced), notes, method, generation_time, calc_trace_id
```

> **Parcel method (v1):** FIFO  
> **Discount rule (v1):** Individuals—if **days held ≥ 365** (purchase→disposal date basis consistent), apply **50% discount** to discountable gains; no discount for losses.

### 3.4 API Surface (BFF → Tax Service)

**List tax years**
```
GET /tax/years
→ 2009–current (based on data availability)
```

**Generate/preview FY summary**
```http
GET /tax/{accountId}/summary?fy=2023-2024
→ {
  "accountId": "...",
  "fy": "2023-2024",
  "income": {
    "dividends_unfranked": 1234.56,
    "dividends_franked": 2345.67,
    "franking_credits": 1000.00,
    "interest": 120.50,
    "foreign_income": 300.00,
    "foreign_withholding": 45.00
  },
  "capital_gains": {
    "gross_gains": 4200.00,
    "discounts": 1500.00,
    "losses_applied": 800.00,
    "net_capital_gain": 1900.00
  },
  "method": { "parcel": "FIFO", "discount_rule": "AU individual 50% where eligible" },
  "calc_trace_id": "txc_abc123"
}
```

**Download 1‑page PDF**
```
GET /tax/{accountId}/statement.pdf?fy=2023-2024
→ binary (application/pdf)
```

**Download accountant CSV**
```
GET /tax/{accountId}/statement.csv?fy=2023-2024
→ rows: category, amount, notes
```

**Explain my statement (GenAI)**
```http
POST /tax/{accountId}/explain
{ "fy": "2023-2024", "question": "Why did my net capital gain rise?" }
→ { "answer": "You realized fewer losses and more >12-month gains..." }
```

**(Ops) Recompute**
```
POST /tax/{accountId}/recompute?fy=2023-2024
→ 202 Accepted (idempotent)
```

### 3.5 One‑Page PDF Layout (Wireframe)

- **Header**: Client name, Account/HIN, FY, generation timestamp, calc_trace_id  
- **Panel A – Income**  
  - Dividends – Franked: $X  
  - Dividends – Unfranked: $Y  
  - **Franking credits**: $Z  
  - Interest: $I  
  - Foreign income: $F (less foreign withholding: $W)  
- **Panel B – Capital gains**  
  - Gross gains: $G  
  - Capital losses applied: $(L)  
  - **Discounts (50%)**: $(D)  
  - **Net capital gain**: **$NG**  
- **Panel C – Notes & ATO mapping (descriptive)**  
  - “Dividends & franking credits map to dividend income categories.”  
  - “Net capital gain maps to capital gains section.”  
  - Parcel method: FIFO; Discount rule applied where eligible.  
- **Footer**: Disclaimers; “This is a summary based on trading data held by <platform>; not tax advice”; QR link to drill‑down & CSV.

---

## 4) Calculation Logic (v1 Rules)

1. **Parcelization (FIFO)**  
   Maintain open **TaxLots** per security. On **SELL**, iterate lots oldest→newest until qty is satisfied; per‑lot gain = proceeds − (unit_cost×qty) − allocated fees.

2. **CGT Discount Eligibility**  
   If **held ≥ 12 months**, mark **discountable**; discountable gains × **50%** → “Discounts”. Never discount losses.

3. **Fees/Commissions**  
   **BUY**: add to cost base. **SELL**: reduce proceeds (or add to cost base of the sold parcel—equivalent in aggregate).

4. **Dividends**  
   Sum **franked** and **unfranked**; sum **franking credits** separately (gross‑up logic informational v1).

5. **Interest**  
   Sum interest transactions attributed to the account (e.g., cash sweep).

6. **Foreign Income (optional v1)**  
   Sum *foreign dividends/interest*; sum **withholding tax** separately for reference.

7. **Rounding & Presentation**  
   Round to 2dp for display; keep raw values in JSON/CSV.

8. **Outliers & Data Gaps**  
   If missing cost base (e.g., external transfer in), show banner: “Missing basis for X units of Y—excluded from CGT; please provide.”

---

## 5) GenAI Assistance

- **Narrative generation**: “How this was calculated,” **differences vs last FY**, FAQ.  
- **Statement Q&A**: Retrieval‑augmented over the **Statement JSON** and **calculation trace** to keep answers grounded.  
- **Corporate action hints (Phase 2)**: Classify vendor event text to pre‑fill cost‑base adjustments.  
- **Data validation copilot**: Flag anomalies (ex‑div date anomalies, dividends without holdings, etc.).

---

## 6) Build Plan

**Hackathon (2–5 days)**
1. Ingest **trades & cash** (read‑only) for ASX equities; build in‑memory FIFO parcelizer.
2. Compute **FY aggregates** (income & CGT totals) → **Statement JSON**.
3. PDF generator (1 page) + CSV export.
4. BFF & basic UI: Select FY → Preview → Download → “Explain” (LLM over JSON).
5. Caching; basic audit log (**calc_trace_id**).

**Phase 2**
- Corporate actions adjustments (splits, consolidations, demergers, off‑market buy‑backs).  
- **AMIT/ETF** tax components ingestion; **LIC CG deduction**; carry‑forward capital losses; method choice (HIFO/Specific ID); multi‑currency & FX.  
- Reconciliation with broker annual statement; accountant portals; API for tax software partners.

---

## 7) Non‑Functional Requirements

- **Performance**: < 5s to generate for up to **5,000 transactions/FY**; p95 < 8s.  
- **Accuracy**: Parity to broker annual summary for in‑scope events; deterministic outputs with traceable lot matches.  
- **Security**: PII masked in logs; PDFs watermarked; time‑boxed download URLs.  
- **Auditability**: Every figure backed by a trace (lot matches, math steps).  
- **Compliance**: Clear **not‑advice** disclaimer; AU domicile assumptions stated.

---

## 8) Acceptance Criteria (Testable)

**Functional**
1. Client can log in, choose FY, and **download a one‑page PDF** with the fields listed above.  
2. **Income** totals show (franked, unfranked, franking credits, interest; optional foreign income & withholding if present).  
3. **Capital gains** section shows **gross gains, losses applied, discounts (50%), net capital gain**.  
4. Parcel method **explicitly shown** (“FIFO”) and applied consistently.  
5. **CGT discount** applied only to eligible >12‑month gains; never to losses.  
6. Brokerage/fees included correctly in cost base/proceeds.  
7. **CSV export** matches PDF totals and categories.  
8. **Explain** endpoint answers at least 10 seeded user questions correctly using only statement data (grounded answers).  
9. Missing cost base scenarios surface a **clear warning**; totals exclude affected parcels; CSV marks exclusions.

**Non‑Functional**
10. p95 generation time **≤ 8s** for accounts with up to **5k transactions**.  
11. Results are **deterministic**; recompute returns identical totals given same inputs.  
12. **Audit trace** (calc_trace_id) can be used to retrieve the lot‑by‑lot calculation steps.  
13. PDF is **A4 one page**, accessible (machine text), and < 500 KB.  
14. Access control: Users can only access their own accounts/HINs; direct URL access is guarded; download links expire in **15 min**.

**Quality & Reconciliation**
15. For 10 sample accounts with broker reference statements (seeded), **Income and Net Capital Gain variance ≤ ±1%** in v1 scope; explain any variances.  
16. All numbers reconcile to raw transactions when re‑summed by the test harness.

---

> **Disclaimer:** This document outlines a product/engineering design for generating a customer‑facing **summary** of trading‑related tax figures. It is not tax or financial advice.
