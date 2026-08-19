import { NextRequest, NextResponse } from "next/server";
import neo4j, { Node, Relationship } from "neo4j-driver";
import { DatabaseConnectionError, runQuery, verifyConnectivity } from "@/lib/db";

export const dynamic = "force-dynamic";

type NodeLike = Node<number, Record<string, unknown>>;
type RelLike = Relationship<number, Record<string, unknown>>;

function serializeNode(node: NodeLike) {
  const type = node.labels[0] ?? "Unknown";
  return { type, ...node.properties };
}

function serializeRel(rel: RelLike, sourceId: string, targetId: string) {
  return { type: rel.type, source: sourceId, target: targetId, ...rel.properties };
}

// ---- Query definitions -----------------------------------------------
// All queries are parameterized ($-prefixed params); no string
// concatenation is ever used to build Cypher text.

const OVERVIEW_QUERY = `
  MATCH (n)
  WHERE n:Supplier OR n:Component OR n:Product OR n:Factory OR n:Warehouse
  OPTIONAL MATCH (n)-[r]->(m)
  WHERE m:Supplier OR m:Component OR m:Product OR m:Factory OR m:Warehouse
  RETURN n, r, m
  LIMIT $limit
`;

const SUPPLIERS_QUERY = `
  MATCH (s:Supplier)
  RETURN s { .id, .name, .country, .riskScore, .tier } AS supplier
  ORDER BY s.riskScore DESC
`;

// 4-hop traversal: Supplier -> Component -> Product <- Factory -> Warehouse.
// Answers "if this supplier fails, what breaks downstream?" — a query that
// would require five self-joining tables and careful DISTINCT handling in
// a relational schema, expressed here as a single pattern match.
const IMPACT_QUERY = `
  MATCH (s:Supplier {id: $supplierId})
  OPTIONAL MATCH (s)-[:SUPPLIES]->(c:Component)
  OPTIONAL MATCH (c)-[:USED_IN]->(p:Product)
  OPTIONAL MATCH (p)<-[:MANUFACTURES]-(f:Factory)
  OPTIONAL MATCH (f)-[:DISTRIBUTES_TO]->(w:Warehouse)
  RETURN s { .id, .name, .country, .riskScore, .tier } AS supplier,
         collect(DISTINCT c { .id, .name, .category }) AS components,
         collect(DISTINCT p { .id, .name, .sku }) AS products,
         collect(DISTINCT f { .id, .name, .location }) AS factories,
         collect(DISTINCT w { .id, .name, .region }) AS warehouses
`;

// Single-source bottleneck analysis: finds components fed by exactly one
// supplier, then measures each one's downstream "blast radius" (distinct
// products / factories / warehouses reachable) weighted by supplier risk.
// In SQL this needs a HAVING COUNT(DISTINCT supplier_id) = 1 subquery
// joined back through three more fact tables without the joins fanning
// out and corrupting the DISTINCT counts — exactly the kind of multi-hop
// aggregation relational engines struggle to express cleanly.
const BOTTLENECKS_QUERY = `
  MATCH (s:Supplier)-[:SUPPLIES]->(c:Component)
  WITH c, collect(DISTINCT s) AS suppliers
  WHERE size(suppliers) = 1
  WITH c, suppliers[0] AS supplier
  MATCH (c)-[:USED_IN]->(p:Product)
  OPTIONAL MATCH (p)<-[:MANUFACTURES]-(f:Factory)
  OPTIONAL MATCH (f)-[:DISTRIBUTES_TO]->(w:Warehouse)
  WITH supplier, c,
       count(DISTINCT p) AS productReach,
       count(DISTINCT f) AS factoryReach,
       count(DISTINCT w) AS warehouseReach
  RETURN supplier { .id, .name, .country, .riskScore } AS supplier,
         c { .id, .name, .category } AS component,
         productReach, factoryReach, warehouseReach,
         (productReach + factoryReach + warehouseReach) * supplier.riskScore AS impactScore
  ORDER BY impactScore DESC
  LIMIT $limit
`;

export async function GET(request: NextRequest) {
  try {
    await verifyConnectivity();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof DatabaseConnectionError ? err.message : "CognoDB is unreachable." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "overview";

  try {
    switch (type) {
      case "overview": {
        const limit = neo4j.int(500);
        const records = await runQuery<{ n: NodeLike; r: RelLike | null; m: NodeLike | null }>(
          OVERVIEW_QUERY,
          { limit }
        );

        const nodes = new Map<string, ReturnType<typeof serializeNode>>();
        const edges: ReturnType<typeof serializeRel>[] = [];

        for (const { n, r, m } of records) {
          const nId = String(n.properties.id);
          if (!nodes.has(nId)) nodes.set(nId, serializeNode(n));
          if (r && m) {
            const mId = String(m.properties.id);
            if (!nodes.has(mId)) nodes.set(mId, serializeNode(m));
            edges.push(serializeRel(r, nId, mId));
          }
        }

        return NextResponse.json({ nodes: Array.from(nodes.values()), edges });
      }

      case "suppliers": {
        const records = await runQuery<{ supplier: Record<string, unknown> }>(SUPPLIERS_QUERY);
        return NextResponse.json({ suppliers: records.map((r) => r.supplier) });
      }

      case "impact": {
        const supplierId = searchParams.get("supplierId");
        if (!supplierId) {
          return NextResponse.json({ error: "Missing required 'supplierId' query parameter." }, { status: 400 });
        }

        const records = await runQuery<{
          supplier: Record<string, unknown> | null;
          components: Record<string, unknown>[];
          products: Record<string, unknown>[];
          factories: Record<string, unknown>[];
          warehouses: Record<string, unknown>[];
        }>(IMPACT_QUERY, { supplierId });

        const row = records[0];
        if (!row || !row.supplier) {
          return NextResponse.json({ error: `No supplier found with id '${supplierId}'.` }, { status: 404 });
        }

        return NextResponse.json({
          supplier: row.supplier,
          components: row.components.filter(Boolean),
          products: row.products.filter(Boolean),
          factories: row.factories.filter(Boolean),
          warehouses: row.warehouses.filter(Boolean),
        });
      }

      case "bottlenecks": {
        const limit = neo4j.int(10);
        const records = await runQuery<{
          supplier: Record<string, unknown>;
          component: Record<string, unknown>;
          productReach: number;
          factoryReach: number;
          warehouseReach: number;
          impactScore: number;
        }>(BOTTLENECKS_QUERY, { limit });

        return NextResponse.json({ bottlenecks: records });
      }

      default:
        return NextResponse.json({ error: `Unknown type '${type}'.` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof DatabaseConnectionError ? err.message : "Unexpected error querying CognoDB.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
