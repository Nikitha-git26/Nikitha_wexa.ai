"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GraphNode = { id: string; type: string; name: string; [key: string]: unknown };
type GraphEdge = { type: string; source: string; target: string; [key: string]: unknown };
type Supplier = { id: string; name: string; country: string; riskScore: number; tier: number };
type ImpactResult = {
  supplier: Supplier;
  components: { id: string; name: string; category: string }[];
  products: { id: string; name: string; sku: string }[];
  factories: { id: string; name: string; location: string }[];
  warehouses: { id: string; name: string; region: string }[];
};
type Bottleneck = {
  supplier: { id: string; name: string; country: string; riskScore: number };
  component: { id: string; name: string; category: string };
  productReach: number;
  factoryReach: number;
  warehouseReach: number;
  impactScore: number;
};

const TYPE_COLOR: Record<string, string> = {
  Supplier: "#0284c7",
  Component: "#d97706",
  Product: "#7c3aed",
  Factory: "#059669",
  Warehouse: "#e11d48",
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return body as T;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} aria-hidden="true" />;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-800">Something went wrong</p>
      <p className="mt-1 text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
    </div>
  );
}

function RiskBadge({ score }: { score: number }) {
  const level = score >= 65 ? "high" : score >= 40 ? "medium" : "low";
  const styles = {
    high: "bg-red-100 text-red-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-green-100 text-green-800",
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[level]}`}>
      Risk {score} · {level}
    </span>
  );
}

function OverviewDiagram({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const columns = ["Supplier", "Component", "Product", "Factory", "Warehouse"];
  const width = 920;
  const colWidth = width / columns.length;
  const rowHeight = 34;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; node: GraphNode }>();
    columns.forEach((type, ci) => {
      const colNodes = nodes.filter((n) => n.type === type);
      colNodes.forEach((n, ni) => {
        map.set(n.id, { x: ci * colWidth + colWidth / 2, y: 30 + ni * rowHeight, node: n });
      });
    });
    return map;
  }, [nodes]);

  const height = Math.max(
    ...columns.map((type) => 60 + nodes.filter((n) => n.type === type).length * rowHeight),
    200
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Diagram of supply chain nodes grouped by type, connected by their dependency relationships"
        className="w-full rounded-lg border border-slate-200 bg-white"
      >
        {edges.map((e, i) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          );
        })}
        {Array.from(positions.values()).map(({ x, y, node }) => (
          <g key={node.id} transform={`translate(${x},${y})`}>
            <circle r={5} fill={TYPE_COLOR[node.type] ?? "#64748b"} />
            <title>{`${node.name} (${node.type})`}</title>
          </g>
        ))}
        {columns.map((type, ci) => (
          <text
            key={type}
            x={ci * colWidth + colWidth / 2}
            y={14}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#334155"
          >
            {type}
          </text>
        ))}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600" aria-label="Legend">
        {columns.map((type) => (
          <li key={type} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLOR[type] }}
              aria-hidden="true"
            />
            {type} ({nodes.filter((n) => n.type === type).length})
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewTab() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; nodes: GraphNode[]; edges: GraphEdge[] }
  >({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchJson<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/api/graph?type=overview")
      .then((data) => setState({ status: "ready", ...data }))
      .catch((err: Error) => setState({ status: "error", message: err.message }));
  }, []);

  useEffect(load, [load]);

  if (state.status === "loading") return <Skeleton className="h-96 w-full" />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={load} />;
  if (state.nodes.length === 0)
    return <EmptyState title="No graph data yet" hint="Run `npm run seed` to load the demo supply chain." />;

  return <OverviewDiagram nodes={state.nodes} edges={state.edges} />;
}

function ImpactTab() {
  const [suppliers, setSuppliers] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Supplier[] }
  >({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string>("");
  const [result, setResult] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: ImpactResult }
  >({ status: "idle" });

  const loadSuppliers = useCallback(() => {
    setSuppliers({ status: "loading" });
    fetchJson<{ suppliers: Supplier[] }>("/api/graph?type=suppliers")
      .then((data) => {
        setSuppliers({ status: "ready", data: data.suppliers });
        const first = data.suppliers[0];
        if (first) setSelectedId((prev) => prev || first.id);
      })
      .catch((err: Error) => setSuppliers({ status: "error", message: err.message }));
  }, []);

  useEffect(loadSuppliers, [loadSuppliers]);

  const runAnalysis = useCallback(() => {
    if (!selectedId) return;
    setResult({ status: "loading" });
    fetchJson<ImpactResult>(`/api/graph?type=impact&supplierId=${encodeURIComponent(selectedId)}`)
      .then((data) => setResult({ status: "ready", data }))
      .catch((err: Error) => setResult({ status: "error", message: err.message }));
  }, [selectedId]);

  if (suppliers.status === "loading") return <Skeleton className="h-64 w-full" />;
  if (suppliers.status === "error") return <ErrorState message={suppliers.message} onRetry={loadSuppliers} />;
  if (suppliers.data.length === 0)
    return <EmptyState title="No suppliers found" hint="Run `npm run seed` to load the demo supply chain." />;

  return (
    <div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          runAnalysis();
        }}
      >
        <div className="flex flex-col">
          <label htmlFor="supplier-select" className="text-sm font-medium text-slate-700">
            Supplier
          </label>
          <select
            id="supplier-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {suppliers.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.country}) — risk {s.riskScore}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Analyze downstream impact
        </button>
      </form>

      <div className="mt-6" aria-live="polite">
        {result.status === "idle" && (
          <EmptyState title="Pick a supplier and run an analysis" hint="Traces Supplier → Component → Product → Factory → Warehouse." />
        )}
        {result.status === "loading" && <Skeleton className="h-64 w-full" />}
        {result.status === "error" && <ErrorState message={result.message} onRetry={runAnalysis} />}
        {result.status === "ready" && (
          <div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <p className="font-semibold text-slate-900">{result.data.supplier.name}</p>
                <p className="text-sm text-slate-500">
                  {result.data.supplier.country} · Tier {result.data.supplier.tier}
                </p>
              </div>
              <RiskBadge score={result.data.supplier.riskScore} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ImpactColumn title="Components" items={result.data.components.map((c) => c.name)} />
              <ImpactColumn title="Products at risk" items={result.data.products.map((p) => p.name)} />
              <ImpactColumn title="Factories affected" items={result.data.factories.map((f) => f.name)} />
              <ImpactColumn title="Warehouses affected" items={result.data.warehouses.map((w) => w.name)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImpactColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">
        {title} <span className="text-slate-400">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">None</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BottlenecksTab() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Bottleneck[] }
  >({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchJson<{ bottlenecks: Bottleneck[] }>("/api/graph?type=bottlenecks")
      .then((data) => setState({ status: "ready", data: data.bottlenecks }))
      .catch((err: Error) => setState({ status: "error", message: err.message }));
  }, []);

  useEffect(load, [load]);

  if (state.status === "loading") return <Skeleton className="h-64 w-full" />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={load} />;
  if (state.data.length === 0)
    return <EmptyState title="No single-source bottlenecks found" hint="Every component currently has more than one supplier." />;

  const maxScore = Math.max(...state.data.map((b) => b.impactScore));

  return (
    <div>
      <p className="text-sm text-slate-600">
        Components with exactly one supplier, ranked by downstream reach × supplier risk.
      </p>
      <ul className="mt-4 space-y-3">
        {state.data.map((b) => (
          <li key={`${b.supplier.id}-${b.component.id}`} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{b.component.name}</p>
                <p className="text-sm text-slate-500">
                  Sole source: {b.supplier.name} ({b.supplier.country})
                </p>
              </div>
              <RiskBadge score={b.supplier.riskScore} />
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Reaches {b.productReach} product{b.productReach === 1 ? "" : "s"}, {b.factoryReach} factor
              {b.factoryReach === 1 ? "y" : "ies"}, {b.warehouseReach} warehouse{b.warehouseReach === 1 ? "" : "s"}
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100" role="presentation">
              <div
                className="h-2 rounded-full bg-red-500"
                style={{ width: `${(b.impactScore / maxScore) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs font-medium text-slate-500">Impact score: {b.impactScore}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "impact", label: "Impact Analysis" },
  { id: "bottlenecks", label: "Bottlenecks" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Supply Chain Risk & Bottleneck Mapping</h1>
        <p className="mt-1 text-slate-600">
          Explore supplier, component, and factory dependencies stored as a graph in CognoDB.
        </p>
      </header>

      <div className="mt-6 border-b border-slate-200">
        <div role="tablist" aria-label="Graph views" className="flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                activeTab === tab.id
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={activeTab !== "overview"}>
          {activeTab === "overview" && <OverviewTab />}
        </section>
        <section id="panel-impact" role="tabpanel" aria-labelledby="tab-impact" hidden={activeTab !== "impact"}>
          {activeTab === "impact" && <ImpactTab />}
        </section>
        <section id="panel-bottlenecks" role="tabpanel" aria-labelledby="tab-bottlenecks" hidden={activeTab !== "bottlenecks"}>
          {activeTab === "bottlenecks" && <BottlenecksTab />}
        </section>
      </div>
    </main>
  );
}
