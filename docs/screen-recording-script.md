# Screen recording script (~3-5 min)

Record with Win+G (Xbox Game Bar), OBS, or Loom. Show your face optional; screen + voice required.

## 1. Intro (20s)
"This is Supply Chain Risk & Bottleneck Mapping — a Next.js app backed by CognoDB,
Wexa's managed Neo4j graph database. It answers two questions that matter for supply
chain risk: 'if this supplier fails, what breaks downstream?' and 'which components
have exactly one supplier, making them a single point of failure?'"

## 2. Why a graph database (30s)
Open README.md, scroll to "Why a graph database?".
"Supply chains are dependency graphs, not tables — a supplier feeds a component, a
component feeds several products, products are built at multiple factories, and
factories ship to multiple warehouses. In a relational schema, both questions need
joining five tables and careful DISTINCT handling so the joins don't fan out and
duplicate rows. In Cypher, it's a single pattern match — traversal depth is just more
arrows, and `collect(DISTINCT ...)` controls aggregation exactly where I want it."

## 3. Data model (20s)
Point at the Mermaid diagram in the README.
"Five node types — Supplier, Component, Product, Factory, Warehouse — connected by
SUPPLIES, USED_IN, MANUFACTURES, DISTRIBUTES_TO, and SHIPS_TO relationships, each
carrying its own properties like leadTimeDays or transportMode."

## 4. Live demo — Overview tab (20s)
Open the live Vercel URL, Overview tab.
"This is the seeded dataset live against CognoDB Cloud — 12 suppliers, 10 components,
6 products, 4 factories, 4 warehouses, rendered as an SVG dependency diagram."

## 5. Live demo — Impact Analysis (45s)
Switch to Impact Analysis tab, pick a high-risk supplier (e.g. TerraRare Minerals, risk 84).
"I'll pick TerraRare Minerals and run the analysis — this is a 4-hop traversal,
Supplier → Component → Product → Factory → Warehouse, done in one Cypher MATCH with
OPTIONAL MATCH chaining each hop. It shows every component, product, factory, and
warehouse that would be affected if this supplier failed."
Open app/api/graph/route.ts, show IMPACT_QUERY (lines ~42-53).
"Notice the query is parameterized with $supplierId — no string concatenation
anywhere in this codebase."

## 6. Live demo — Bottlenecks (45s)
Switch to Bottlenecks tab.
"This is the query that's awkward in a relational database: find every component
supplied by exactly one supplier, then measure its downstream blast radius —
distinct products, factories, and warehouses reachable — weighted by supplier risk."
Open route.ts, show BOTTLENECKS_QUERY (lines ~62-80).
"In SQL this needs a HAVING COUNT(DISTINCT supplier_id) = 1 subquery joined back
through three more fact tables without the joins corrupting the DISTINCT counts.
Here it's a few WITH stages — size(suppliers) = 1, then aggregate downstream reach."

## 7. Error handling (30s)
Open lib/db.ts, show verifyConnectivity() and DatabaseConnectionError.
"If CognoDB is unreachable, the API returns a 503 with a safe message instead of
leaking a raw driver error, and the UI shows an error state with a Retry button —
not a crash." (Optionally: briefly stop the CognoDB instance or point NEO4J_URI
somewhere invalid to show the error banner live, then restore it.)

## 8. Seed script + env vars (20s)
Open scripts/seed.ts and .env.example.
"The seed script uses the same official neo4j-driver and parameterized UNWIND
writes as the API. Credentials come only from environment variables — .env.local
is gitignored, never committed."

## 9. Wrap-up (15s)
"That's the app — live on Vercel, backed by a real CognoDB Cloud instance, source
on GitHub. Thanks for watching."
