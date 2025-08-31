[goals-based-planning-ui-prototype.md](https://github.com/user-attachments/files/22062855/goals-based-planning-ui-prototype.md)
# Goals-Based Financial Planning — UI-Only Hackathon Prototype (nabtrade / Private Wealth)

> **Purpose**: Wow execs with a clickable, AI‑assisted **UI-only** prototype that demonstrates goals‑based planning, adviser–client collaboration, and instant what‑if exploration — *without* any production backend or real simulation engine.

---

## 1) Summary & Scores

| Dimension | What it involves | Score |
|---|---|---|
| **Doability (UI-only)** | Click-through React prototype with mocked APIs, seeded client data, AI “copilot” text from templates. Charts update live on assumption changes. | **5/5** |
| **Difficulty** | Mostly UX + front-end. No heavy math engine; complexity in interaction design and clean information hierarchy. | **2/5** |
| **Business value** | Shifts from products to **goals**, enables adviser–client collaboration, and “what-if” self-service in portal. Fits private banking growth. | **5/5** |
| **Wow factor** | Side-by-side compare, **Plan Health** dial, instant narrative from AI copilot, Adviser vs Client mode, trust/structure overlays. | **4.5/5** |

---

## 2) Hackathon Scope (UX only)

**Primary flows (all data mocked, calculations faked):**
1. **Landing / Plan Health**: Big dial (Probability of Success), goal timeline, key actions.
2. **Goals Wizard**: Add goals (Education, Retirement, Liquidity/Exit, Philanthropy), priorities, target amounts.
3. **Assumptions Panel**: Retirement age, spending, inflation, investment style; sliders with instant chart updates.
4. **Scenario Builder**: “What if I retire 2 years earlier?” — one‑click clone + adjust.
5. **Scenario Compare**: Two‑up view (Base vs What‑If) with plan health delta and cashflow bands.
6. **Structure View**: Visual of entities (Individual, Trust, Company) and how assets/goals map.
7. **AI Plan Copilot**: Explain the plan in plain English, list trade-offs, auto-generate adviser notes.
8. **Adviser Mode**: Add comments/annotations, save a “presentation view”.
9. **Client Mode**: Fewer controls, more education tooltips, “Ask my adviser” button.
10. **Compliance Bar**: Non-advice disclaimer, assumptions badge, “view basis” modal.

**Design tone**: quiet confidence, low-stress. Clear hierarchy: **Goals → Plan Health → Actions**.

---

## 3) High‑Level Architecture (Prototype)

### Front-end stack
- **React** (Vite or Next.js)
- **Tailwind** + **shadcn/ui** components
- **Recharts** (or ECharts) for timeline, waterfalls, bands
- **TanStack Query** for data fetching (against mocks)

### Mock backend
- **MSW (Mock Service Worker)** to simulate APIs
- Seeded JSON in `/public` (plans, scenarios, structures)

### AI layer (mocked)
- Thin `/explain` handler returns pre-baked, templated narratives with variable interpolation (deterministic for demos).

### State & storage
- URL params for scenario IDs; **localStorage** to “save” plans.
- Basic event logging (console) for key actions.

### Component map
- `PlanHealthDial`, `GoalTimeline`, `CashflowBandsChart`, `WaterfallDeltaChart`, `ScenarioCard`, `StructureGraph`,
  `AssumptionSliders`, `InsightPanel` (AI), `AdvisorNotes`, `CompareGrid`, `ComplianceFooter`.

### UI Data Model (schema for mocks)
```json
{
  "Client": { "id": "c1", "name": "Alex & Priya", "segment": "Private Bank" },
  "Entities": [
    { "id": "e1", "type": "Individual", "name": "Alex" },
    { "id": "e2", "type": "Trust", "name": "AP Family Trust" }
  ],
  "Accounts": [
    { "id": "a1", "entityId": "e2", "type": "Investment", "balance": 2300000 },
    { "id": "a2", "entityId": "e1", "type": "Super", "balance": 1200000 }
  ],
  "Goals": [
    { "id": "g1", "type": "Retirement", "age": 60, "annualSpend": 180000, "priority": "High" },
    { "id": "g2", "type": "Education", "startYear": 2029, "amount": 300000, "priority": "Med" }
  ],
  "Assumptions": {
    "inflation": 0.025,
    "returnsProfile": "Balanced",
    "retirementAge": 60
  },
  "Scenario": {
    "id": "s_base",
    "name": "Base Plan",
    "planHealth": 0.82,
    "yearlyCashflows": [{ "year": 2026, "in": 220000, "out": 180000 }]
  }
}
```

### API Stubs (MSW)
- `GET /clients/:id/plan` → returns Client, Entities, Accounts, Goals, Assumptions, Scenario.
- `POST /scenarios` → clones base with overrides (e.g., `{ "retirementAge": 58 }`), returns new `planHealth` + charts.
- `POST /explain` → `{ "scenarioId": "...", "changes": ["retire_58"] }` → returns narrative bullets.
- `GET /structures/:id` → nodes/edges for the structure graph (static for demo).

**Example `POST /scenarios` response**
```json
{
  "scenarioId": "s_earlier_retire",
  "name": "Retire at 58",
  "planHealth": 0.74,
  "deltaFromBase": -0.08,
  "charts": {
    "timeline": [{ "year": 2026, "balance": 3450000 }],
    "cashflowBands": [{ "year": 2030, "need": 200000, "covered": 168000 }]
  },
  "insights": [
    "Shortfall emerges from 2034 due to earlier drawdown window.",
    "Raising savings by 10% until 2028 restores plan health to ~0.80 (mock)."
  ]
}
```

**Example `POST /explain` response**
```json
{
  "title": "What changes if you retire 2 years earlier?",
  "bullets": [
    "Plan Health shifts from 82% → 74% (higher shortfall risk).",
    "Drawdown begins sooner; liquidity matters for the first 6–8 years.",
    "Two easy levers: reduce spend by $1.5k/month or top-up $200k pre-retirement."
  ],
  "tone": "educational"
}
```

---

## 4) UI Pages & Key Widgets

1. **Dashboard / Plan Health**
   - Plan Health dial, goal chips, top insights (AI), “Try a what‑if”.

2. **Goals Wizard**
   - Cards: Education / Retirement / Liquidity / Philanthropy; priority selector; goal amounts.

3. **Goal Detail**
   - Timeline of goal funding; knobs for timing/amount; AI tips (“how peers fund education”).

4. **Assumptions**
   - Sliders: retirement age, longevity, inflation, return style. Live chart updates.

5. **Scenario Builder**
   - “Clone base → change 1–2 levers → see delta”.

6. **Scenario Compare**
   - Two‑up: dials, timelines, cashflow bands, **waterfall** of differences.

7. **Structure View**
   - Entity graph (Individuals, Trusts, Company) with asset tagging — **visual credibility** for HNW.

8. **Adviser Mode**
   - Comment pins, presentable view (hides controls), “Export presentation” (beautified screen).

9. **Client Mode**
   - Simplified controls; education tooltips; “Ask adviser” CTA.

10. **Compliance**
   - Sticky footer banner; “Assumptions & Basis” modal with current settings.

---

## 5) GenAI in a UI‑Only Prototype (No live model calls)

- **Plan Copilot (templated)**: Explain current plan; summarize impact of edits; generate adviser notes.
- **“Why did this change?”**: Diff two scenarios and render natural-language bullets.
- **Micro‑education**: Inline helper text—e.g., “What is Plan Health?”, “Why inflation matters”.
- **Session script generator**: One‑click “Meeting script” built from on‑screen data.

> Implementation: **prompt templates + variable interpolation**. Keep outputs deterministic for demo repeatability.

---

## 6) Visualizations (high credibility, low effort)

- **Plan Health Dial**: 0–100% (mock).
- **Goal Timeline**: Stacked needs vs expected coverage.
- **Cashflow Bands**: Yearly in/out with shaded “risk band”.
- **Waterfall**: Base → Change A → Change B → Net effect.
- **Entity Graph**: Nodes/edges tagged (Trust, Individual, Company).

---

## 7) Demo Script (≈7 minutes)

1. **Open Dashboard**: “Here’s your plan at **82% Plan Health**.”
2. **Add Goal**: Add Philanthropy in 2032 for $250k → dial moves to **79%**.
3. **What‑If**: “Retire at 58” scenario → **74%**. AI explains *why* in 3 bullets.
4. **Compare**: Base vs What‑If; highlight **cashflow shortfall band** in early years.
5. **Levers**: Reduce spend 8% → dial animates to **80%**; AI suggests “or add $200k pre‑retirement”.
6. **Structure**: Show Trust overlay—assets mapped to goals.
7. **Adviser Mode**: Add a note; toggle **Presentation View**; end with compliance banner.

---

## 8) Team Setup & Build Notes

- **Design**: Figma frames for the 10 pages; mini design system (colors, type, spacing).
- **Front‑end**: Next.js (or Vite) + Tailwind + shadcn/ui + Recharts + MSW + TanStack Query.
- **Data**: Seed `plan.json`, `scenarios.json`, `structures.json`.
- **Mock math**: Precomputed lookups (e.g., earlier retirement → −8% health).
- **Brand & legal**: NAB tokens and styles; explicit “This is general information, not personal advice.”

---

## 9) Acceptance Criteria (Demo‑ready)

1. Create & edit **Goals** with visible impact on **Plan Health** and timeline charts.
2. **One‑click scenario** (“Retire 2 years earlier”) creates a second scenario with updated dial & charts.
3. **Scenario Compare** view shows Base vs What‑If with deltas and a **waterfall** of impacts.
4. **Assumptions panel** (sliders) animates charts in place; values persist **per scenario**.
5. **AI Plan Copilot** returns deterministic, clear narrative for Base and for the delta.
6. **Adviser/Client modes** toggle available UI; adviser can add **notes**; clean **presentation view** exists.
7. **Structure view** shows entities and asset mapping; hover tooltips explain structures.
8. **Compliance banner** always visible; “Assumptions & Basis” modal opens with mock details.
9. **Mobile‑responsive** for core screens (Dashboard, Scenario Compare, Assumptions).
10. **No backend dependency**: All data via MSW/mocked JSON; app runs offline locally.

---

## 10) Day‑2 Path to Real Product (talk‑track with execs)

- **Simulation Engine** microservice: deterministic projections, constraints, tax wrappers.
- **Data Feeds**: Holdings, prices, cash, liabilities; entity registry for trusts/companies.
- **Adviser Workspace**: Case files, recommendation templates, meeting notes, PDF export.
- **Collaboration**: Shared scenarios, approvals, audit trail.
- **Entitlements**: Role‑based views (client, adviser, oversight).

---

## 11) Example Prompt Template (for the Copilot)

```
You are a private-bank planning explainer. Be concise, neutral, educational.
Base Plan Health: {{baseHealth}}. Current Scenario: {{scenarioName}} at {{scenarioHealth}}.
Changes: {{changesList}}.
Explain in 3–5 bullets:
- What changed and why it matters over the next 5–10 years.
- 1–2 simple levers (reduce spend / increase savings / shift allocation).
- Remind that this is general information, not personal advice.
```

---

### Compliance & Disclaimer
This prototype is **not personal advice**. All numbers are placeholders. The UI demonstrates interaction patterns only and makes no projection claims.
