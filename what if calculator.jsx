import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Info, Play, Sparkles, RefreshCcw, TrendingUp, CircleHelp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend
} from "recharts";

// -----------------------------
// Helpers
// -----------------------------
const currency = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function quantile(arr: number[], q: number) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (a[base + 1] !== undefined) return a[base] + rest * (a[base + 1] - a[base]);
  return a[base];
}

// Simple PRNG for reproducibility
function mulberry32(seed: number) {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------
// Assumptions (demo only)
// -----------------------------
const DEFAULT_ASSETS = [
  { key: "au_equities", name: "Australian Equities", mean: 0.07, vol: 0.15 },
  { key: "global_equities", name: "Global Equities (hedged)", mean: 0.075, vol: 0.16 },
  { key: "bonds", name: "Investment-Grade Bonds", mean: 0.035, vol: 0.06 },
  { key: "term", name: "Term Deposits", mean: 0.04, vol: 0.005 },
  { key: "cash", name: "Cash", mean: 0.03, vol: 0.002 },
  { key: "listed_property", name: "Listed Property/REITs", mean: 0.06, vol: 0.12 },
];

// -----------------------------
// Simulation (independent normals; demo-scale)
// -----------------------------
function runSimulation({
  seed = 42,
  years,
  initial,
  monthlyContribution,
  feeBps,
  taxRate,
  allocation, // {key: pct 0..1}
  assets,
  whatIf,
}: {
  seed?: number;
  years: number;
  initial: number;
  monthlyContribution: number;
  feeBps: number; // e.g. 50 = 0.50%
  taxRate: number; // e.g. 0.325
  allocation: Record<string, number>;
  assets: { key: string; name: string; mean: number; vol: number }[];
  whatIf?: WhatIfState;
}) {
  const rng = mulberry32(seed);
  const runs = 400; // light but illustrative
  const months = years * 12;
  const fee = feeBps / 10000; // decimal

  // optional what-if deltas (applied annually)
  const rateDelta = whatIf?.rateDelta ?? 0; // e.g. +0.01 raises income assets
  const audShock = whatIf?.audShock ?? 0; // one-off return boost for global assets in year 1

  const series: { year: number; p5: number; p50: number; p95: number }[] = [];
  const terminalValues: number[] = [];

  for (let y = 1; y <= years; y++) {
    // collect all end-of-year values across runs
    const vals: number[] = [];

    for (let r = 0; r < runs; r++) {
      let value = initial;
      let monthly = monthlyContribution;

      for (let m = 1; m <= months; m++) {
        const yearIndex = Math.ceil(m / 12);
        // monthly contributions
        value += monthly;

        // monthly return from weighted assets
        let annualReturn = 0;
        for (const a of assets) {
          const w = allocation[a.key] || 0;
          if (w <= 0) continue;
          let mu = a.mean;
          // simple what-if adjustments
          if ((a.key === "bonds" || a.key === "term" || a.key === "cash") && rateDelta !== 0) {
            mu += rateDelta; // crude uplift for income assets
          }
          // FX shock: assume it benefits global equities in year 1 only
          let shock = 0;
          if (a.key === "global_equities" && audShock !== 0 && yearIndex === 1) shock = audShock;

          // draw annual normal and convert to monthly (approximation)
          const z = Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng());
          const annual = mu + a.vol * z + shock;
          const monthlyReturn = Math.pow(1 + annual, 1 / 12) - 1;
          annualReturn += w * monthlyReturn;
        }

        // apply fee drag monthly
        const monthlyFee = Math.pow(1 - fee, 1 / 12) - 1; // negative
        const gross = 1 + annualReturn + monthlyFee;

        // simple tax drag on positive returns (demo only)
        const pretaxDelta = value * annualReturn;
        const tax = pretaxDelta > 0 ? pretaxDelta * taxRate : 0;
        const taxMonthly = tax / 12; // spread evenly

        value = value * (1 + annualReturn + monthlyFee) - taxMonthly;

        if (m === y * 12) vals.push(value);
      }
    }

    series.push({
      year: y,
      p5: quantile(vals, 0.05),
      p50: quantile(vals, 0.5),
      p95: quantile(vals, 0.95),
    });
  }

  // terminal distribution using last year calcs (reuse last step from above is heavy). Re-run light:
  const end = series[series.length - 1];
  const approxTerminal = [end.p5, end.p50, end.p95];
  terminalValues.push(...approxTerminal);

  return { series, terminalValues };
}

// -----------------------------
// UI Component
// -----------------------------

type WhatIfState = {
  quick?: string;
  rateDelta?: number; // +/- to income asset expected returns
  audShock?: number; // one-off boost to global equities year 1
};

export default function WhatIfCalculator() {
  const [horizon, setHorizon] = useState(10);
  const [initial, setInitial] = useState(150000);
  const [monthly, setMonthly] = useState(1500);
  const [feeBps, setFeeBps] = useState(45);
  const [taxRate, setTaxRate] = useState(0.325); // demo default 32.5%
  const [wholesale, setWholesale] = useState(false);

  const [alloc, setAlloc] = useState<Record<string, number>>({
    au_equities: 0.35,
    global_equities: 0.25,
    bonds: 0.15,
    term: 0.1,
    cash: 0.05,
    listed_property: 0.1,
  });

  const [whatIf, setWhatIf] = useState<WhatIfState>({ quick: "none", rateDelta: 0, audShock: 0 });

  const totalAlloc = Object.values(alloc).reduce((a, b) => a + b, 0);
  const normalized = Math.abs(totalAlloc - 1) < 1e-6;

  const assets = useMemo(() => DEFAULT_ASSETS, []);

  const { series, summary } = useMemo(() => {
    if (!normalized) return { series: [], summary: null as any };
    const sim = runSimulation({
      years: horizon,
      initial,
      monthlyContribution: monthly,
      feeBps,
      taxRate,
      allocation: alloc,
      assets,
      whatIf,
    });

    const p50 = sim.series.map(d => d.p50);
    const contribTotal = monthly * 12 * horizon + initial;
    const final50 = p50[p50.length - 1] || 0;
    const gain = Math.max(0, final50 - contribTotal);

    return {
      series: sim.series.map(d => ({ year: `Year ${d.year}`, median: d.p50, p5: d.p5, p95: d.p95 })),
      summary: {
        final50,
        final5: sim.series[sim.series.length - 1]?.p5 || 0,
        final95: sim.series[sim.series.length - 1]?.p95 || 0,
        contribTotal,
        gain,
      },
    };
  }, [horizon, initial, monthly, feeBps, taxRate, alloc, assets, whatIf, normalized]);

  const applyQuick = (key: string) => {
    if (key === "none") return setWhatIf({ quick: key, rateDelta: 0, audShock: 0 });
    if (key === "+$500/mo") setMonthly(prev => prev + 500);
    if (key === "Shift 10% Eq→Bonds") {
      setAlloc(prev => {
        const eq = Math.max(0, (prev.au_equities || 0) + (prev.global_equities || 0) - 0.1);
        const splitEq = Math.max(0, (prev.au_equities || 0) - 0.05);
        return { ...prev, au_equities: splitEq, global_equities: Math.max(0, (prev.global_equities || 0) - 0.05), bonds: (prev.bonds || 0) + 0.1 };
      });
    }
    if (key === "+1% rates") setWhatIf({ quick: key, rateDelta: 0.01, audShock: 0 });
    if (key === "AUD −10% boost yr1") setWhatIf({ quick: key, rateDelta: 0, audShock: 0.10 });
  };

  const normalizeAlloc = () => {
    const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
    if (sum === 0) return;
    const next: Record<string, number> = {};
    for (const k of Object.keys(alloc)) next[k] = alloc[k] / sum;
    setAlloc(next);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">What‑If Calculator</h1>
          <p className="text-sm text-muted-foreground">Multi‑asset scenario builder for education and planning. <span className="font-medium">Demo only — not personal advice.</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">Retail mode</Badge>
          <Switch checked={wholesale} onCheckedChange={setWholesale} />
          <Badge className="text-xs" variant={wholesale ? "default" : "outline"}>{wholesale ? "Wholesale" : "General"}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scenario Builder */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4"/> Scenario Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Time horizon (years)</Label>
                  <div className="flex items-center gap-3">
                    <Slider value={[horizon]} min={1} max={30} step={1} onValueChange={(v)=>setHorizon(v[0])} />
                    <div className="w-14 text-right text-sm tabular-nums">{horizon}</div>
                  </div>
                </div>
                <div>
                  <Label>Annual fee (bps)</Label>
                  <div className="flex items-center gap-3">
                    <Slider value={[feeBps]} min={0} max={150} step={5} onValueChange={(v)=>setFeeBps(v[0])} />
                    <div className="w-14 text-right text-sm tabular-nums">{feeBps}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Initial capital (AUD)</Label>
                  <Input type="number" value={initial} onChange={(e)=>setInitial(Number(e.target.value||0))} />
                </div>
                <div>
                  <Label>Monthly contribution</Label>
                  <Input type="number" value={monthly} onChange={(e)=>setMonthly(Number(e.target.value||0))} />
                </div>
              </div>

              <div>
                <Label>Marginal tax rate</Label>
                <div className="flex items-center gap-2">
                  <Select value={String(taxRate)} onValueChange={(v)=>setTaxRate(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.19">19% (low)</SelectItem>
                      <SelectItem value="0.325">32.5% (mid)</SelectItem>
                      <SelectItem value="0.37">37% (upper)</SelectItem>
                      <SelectItem value="0.45">45% (top)</SelectItem>
                    </SelectContent>
                  </Select>
                  <CircleHelp className="h-4 w-4 text-muted-foreground"/>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Asset allocation</Label>
                  <div className="text-xs text-muted-foreground">Total: <span className={totalAlloc.toFixed(2) !== "1.00" ? "text-red-600" : "text-green-600"}>{pct(totalAlloc)}</span></div>
                </div>
                {DEFAULT_ASSETS.map((a)=> (
                  <div key={a.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{a.name}</span>
                      <span className="tabular-nums">{pct(alloc[a.key]||0,1)}</span>
                    </div>
                    <Slider value={[Math.round((alloc[a.key]||0)*100)]} min={0} max={100} step={1} onValueChange={(v)=>setAlloc(prev=>({...prev, [a.key]: v[0]/100}))} />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={normalizeAlloc}><RefreshCcw className="h-4 w-4 mr-1"/>Normalize to 100%</Button>
                  {!normalized && <span className="text-xs text-red-600">Allocation must total 100% to run</span>}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label>Quick what‑if</Label>
                  <Select value={whatIf.quick || "none"} onValueChange={applyQuick}>
                    <SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="+$500/mo">Add $500/month</SelectItem>
                      <SelectItem value="Shift 10% Eq→Bonds">Shift 10% Eq → Bonds</SelectItem>
                      <SelectItem value="+1% rates">+1% to rates (TD/Bonds)</SelectItem>
                      <SelectItem value="AUD −10% boost yr1">AUD −10% (boost globals yr1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button className="w-full" disabled={!normalized}><Play className="h-4 w-4 mr-2"/>Run scenario</Button>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5"/>
                <p>Educational tool. Hypothetical projections use simplified assumptions and are not guarantees. Not personal advice. Consider your circumstances.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4"/> Median Outcome</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{summary ? currency(summary.final50) : "—"}</div>
                <div className="text-xs text-muted-foreground">at year {horizon}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Contributions (total)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{summary ? currency(summary.contribTotal) : "—"}</div>
                <div className="text-xs text-muted-foreground">initial + monthly</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Downside (P5)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{summary ? currency(summary.final5) : "—"}</div>
                <div className="text-xs text-muted-foreground">5th percentile</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Upside (P95)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{summary ? currency(summary.final95) : "—"}</div>
                <div className="text-xs text-muted-foreground">95th percentile</div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Projection band (median with P5–P95)</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fill95" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="fill50" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v)=> (v/1000).toFixed(0)+"k"} tick={{ fontSize: 12 }}/>
                  <Tooltip formatter={(v:any)=> currency(Number(v))} />
                  <Area type="monotone" dataKey="p95" stroke="#60a5fa" fill="url(#fill95)" />
                  <Area type="monotone" dataKey="median" stroke="#34d399" fill="url(#fill50)" />
                  <Area type="monotone" dataKey="p5" stroke="#60a5fa" fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
              <TabsTrigger value="cashflow">Cashflows</TabsTrigger>
              <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
            </TabsList>

            <TabsContent value="summary">
              <Card>
                <CardContent className="p-4 text-sm leading-6 text-muted-foreground">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Median projected value of <span className="font-medium text-foreground">{summary ? currency(summary.final50) : "—"}</span> at year {horizon}.</li>
                    <li>Downside (P5) <span className="font-medium text-foreground">{summary ? currency(summary.final5) : "—"}</span>; Upside (P95) <span className="font-medium text-foreground">{summary ? currency(summary.final95) : "—"}</span>.</li>
                    <li>Total contributions over period: <span className="font-medium text-foreground">{summary ? currency(summary.contribTotal) : "—"}</span>.</li>
                    <li>Quick What‑If applied: <span className="font-medium">{whatIf.quick || "none"}</span>.</li>
                    <li>Fee drag, tax drag and rate/FX shocks are simplified for demo purposes.</li>
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="breakdown">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Allocation snapshot</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
                  {DEFAULT_ASSETS.map(a => (
                    <div key={a.key} className="flex items-center justify-between">
                      <span>{a.name}</span>
                      <span className="tabular-nums font-medium">{pct(alloc[a.key]||0,1)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cashflow">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Cashflow assumptions</CardTitle></CardHeader>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  <p>Initial capital: <span className="text-foreground font-medium">{currency(initial)}</span>. Monthly contribution: <span className="text-foreground font-medium">{currency(monthly)}</span>. Contributions are added at start of month.</p>
                  <p>Fees applied continuously at <span className="text-foreground font-medium">{feeBps} bps</span> p.a. Tax drag is a simple proxy on positive returns at <span className="text-foreground font-medium">{Math.round(taxRate*100)}%</span>.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assumptions">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Return & volatility (demo)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3">Asset</th>
                          <th className="text-right p-3">Expected return (p.a.)</th>
                          <th className="text-right p-3">Volatility (p.a.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEFAULT_ASSETS.map(a => (
                          <tr key={a.key} className="border-b last:border-0">
                            <td className="p-3">{a.name}</td>
                            <td className="p-3 text-right">{pct(a.mean)}</td>
                            <td className="p-3 text-right">{pct(a.vol)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 text-xs text-muted-foreground">Assumes independent asset returns (no correlations) for simplicity; FX adjustments only on global equities for the AUD what‑if. For illustration only.</div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
