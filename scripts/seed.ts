/**
 * Seeds CognoDB with a compact supply chain graph:
 * Supplier -> Component -> Product <- Factory -> Warehouse
 *
 * Kept deliberately small (36 nodes / ~75 relationships) to stay within a
 * 0.5 vCPU / 256MB instance, while still being deep and connected enough
 * to demonstrate multi-hop traversal and single-source bottleneck analysis.
 *
 * Usage: npm run seed   (reads NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD from .env.local)
 */
import dotenv from "dotenv";
import neo4j from "neo4j-driver";

dotenv.config({ path: ".env.local" });

const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USER ?? "cognodb";
const PASSWORD = process.env.NEO4J_PASSWORD;
const DATABASE = process.env.NEO4J_DATABASE ?? "neo4j";

if (!URI || !PASSWORD) {
  console.error("Missing NEO4J_URI or NEO4J_PASSWORD. Copy .env.example to .env.local first.");
  process.exit(1);
}

const suppliers = [
  { id: "SUP-01", name: "SiliconPeak Semiconductor", country: "Taiwan", riskScore: 72, tier: 1 },
  { id: "SUP-02", name: "DeltaVolt Battery Co", country: "South Korea", riskScore: 55, tier: 1 },
  { id: "SUP-03", name: "ClearView Optics", country: "Japan", riskScore: 38, tier: 1 },
  { id: "SUP-04", name: "LensCraft Imaging", country: "China", riskScore: 61, tier: 2 },
  { id: "SUP-05", name: "CircuitForge PCB", country: "Vietnam", riskScore: 44, tier: 1 },
  { id: "SUP-06", name: "MetalWorks Alloys", country: "China", riskScore: 58, tier: 2 },
  { id: "SUP-07", name: "ConnectRight Cables", country: "Mexico", riskScore: 29, tier: 2 },
  { id: "SUP-08", name: "SensorLogic Inc", country: "Germany", riskScore: 33, tier: 1 },
  { id: "SUP-09", name: "AudioWave Components", country: "Malaysia", riskScore: 41, tier: 2 },
  { id: "SUP-10", name: "TerraRare Minerals", country: "China", riskScore: 84, tier: 3 },
  { id: "SUP-11", name: "SecondSource Semi", country: "USA", riskScore: 47, tier: 2 },
  { id: "SUP-12", name: "BalticCell Battery", country: "Poland", riskScore: 36, tier: 2 },
];

const components = [
  { id: "COMP-01", name: "Application Processor SoC", category: "Semiconductor" },
  { id: "COMP-02", name: "Lithium-ion Battery Cell", category: "Power" },
  { id: "COMP-03", name: "OLED Display Panel", category: "Display" },
  { id: "COMP-04", name: "Camera Module", category: "Optics" },
  { id: "COMP-05", name: "Main Logic PCB", category: "Electronics" },
  { id: "COMP-06", name: "Aluminum Chassis", category: "Mechanical" },
  { id: "COMP-07", name: "Flex Connector Cable", category: "Electronics" },
  { id: "COMP-08", name: "Motion Sensor Array", category: "Sensors" },
  { id: "COMP-09", name: "Micro Speaker Unit", category: "Audio" },
  { id: "COMP-10", name: "Neodymium Magnet Assembly", category: "Mechanical" },
];

const products = [
  { id: "PROD-01", name: "Smartphone X1", sku: "SKU-SPX1" },
  { id: "PROD-02", name: "Laptop Pro 14", sku: "SKU-LP14" },
  { id: "PROD-03", name: "Smartwatch S2", sku: "SKU-SWS2" },
  { id: "PROD-04", name: "Wireless Earbuds Z", sku: "SKU-WEZ" },
  { id: "PROD-05", name: "Tablet Air", sku: "SKU-TABA" },
  { id: "PROD-06", name: "Home Hub Mini", sku: "SKU-HHM" },
];

const factories = [
  { id: "FAC-01", name: "Shenzhen Assembly Plant", location: "Shenzhen, China" },
  { id: "FAC-02", name: "Ho Chi Minh Assembly", location: "Ho Chi Minh City, Vietnam" },
  { id: "FAC-03", name: "Guadalajara Plant", location: "Guadalajara, Mexico" },
  { id: "FAC-04", name: "Berlin Precision Plant", location: "Berlin, Germany" },
];

const warehouses = [
  { id: "WH-01", name: "North America DC", region: "North America" },
  { id: "WH-02", name: "Europe DC", region: "Europe" },
  { id: "WH-03", name: "APAC DC", region: "APAC" },
  { id: "WH-04", name: "LATAM DC", region: "LATAM" },
];

const supplies = [
  { from: "SUP-01", to: "COMP-01", leadTimeDays: 45, unitCostUsd: 38.5 },
  { from: "SUP-02", to: "COMP-02", leadTimeDays: 30, unitCostUsd: 22.0 },
  { from: "SUP-12", to: "COMP-02", leadTimeDays: 35, unitCostUsd: 24.5 },
  { from: "SUP-03", to: "COMP-03", leadTimeDays: 50, unitCostUsd: 29.0 },
  { from: "SUP-04", to: "COMP-04", leadTimeDays: 25, unitCostUsd: 14.75 },
  { from: "SUP-05", to: "COMP-05", leadTimeDays: 20, unitCostUsd: 9.4 },
  { from: "SUP-11", to: "COMP-05", leadTimeDays: 28, unitCostUsd: 10.1 },
  { from: "SUP-06", to: "COMP-06", leadTimeDays: 18, unitCostUsd: 6.2 },
  { from: "SUP-07", to: "COMP-07", leadTimeDays: 12, unitCostUsd: 1.85 },
  { from: "SUP-08", to: "COMP-08", leadTimeDays: 22, unitCostUsd: 5.6 },
  { from: "SUP-09", to: "COMP-09", leadTimeDays: 15, unitCostUsd: 2.9 },
  { from: "SUP-10", to: "COMP-10", leadTimeDays: 70, unitCostUsd: 11.2 },
];

const usedIn = [
  { from: "COMP-01", to: "PROD-01", quantityPerUnit: 1 },
  { from: "COMP-01", to: "PROD-02", quantityPerUnit: 1 },
  { from: "COMP-01", to: "PROD-05", quantityPerUnit: 1 },
  { from: "COMP-02", to: "PROD-01", quantityPerUnit: 1 },
  { from: "COMP-02", to: "PROD-03", quantityPerUnit: 1 },
  { from: "COMP-02", to: "PROD-04", quantityPerUnit: 2 },
  { from: "COMP-02", to: "PROD-05", quantityPerUnit: 1 },
  { from: "COMP-03", to: "PROD-01", quantityPerUnit: 1 },
  { from: "COMP-03", to: "PROD-02", quantityPerUnit: 1 },
  { from: "COMP-03", to: "PROD-03", quantityPerUnit: 1 },
  { from: "COMP-03", to: "PROD-05", quantityPerUnit: 1 },
  { from: "COMP-04", to: "PROD-01", quantityPerUnit: 2 },
  { from: "COMP-04", to: "PROD-05", quantityPerUnit: 1 },
  { from: "COMP-04", to: "PROD-06", quantityPerUnit: 1 },
  { from: "COMP-05", to: "PROD-01", quantityPerUnit: 1 },
  { from: "COMP-05", to: "PROD-02", quantityPerUnit: 1 },
  { from: "COMP-05", to: "PROD-03", quantityPerUnit: 1 },
  { from: "COMP-05", to: "PROD-04", quantityPerUnit: 1 },
  { from: "COMP-05", to: "PROD-05", quantityPerUnit: 1 },
  { from: "COMP-05", to: "PROD-06", quantityPerUnit: 1 },
  { from: "COMP-06", to: "PROD-02", quantityPerUnit: 1 },
  { from: "COMP-06", to: "PROD-05", quantityPerUnit: 1 },
  { from: "COMP-07", to: "PROD-01", quantityPerUnit: 3 },
  { from: "COMP-07", to: "PROD-02", quantityPerUnit: 4 },
  { from: "COMP-07", to: "PROD-03", quantityPerUnit: 2 },
  { from: "COMP-08", to: "PROD-01", quantityPerUnit: 1 },
  { from: "COMP-08", to: "PROD-03", quantityPerUnit: 1 },
  { from: "COMP-09", to: "PROD-04", quantityPerUnit: 2 },
  { from: "COMP-09", to: "PROD-06", quantityPerUnit: 1 },
  { from: "COMP-10", to: "PROD-04", quantityPerUnit: 2 },
  { from: "COMP-10", to: "PROD-06", quantityPerUnit: 1 },
];

const manufactures = [
  { from: "FAC-01", to: "PROD-01" },
  { from: "FAC-02", to: "PROD-01" },
  { from: "FAC-03", to: "PROD-02" },
  { from: "FAC-04", to: "PROD-02" },
  { from: "FAC-02", to: "PROD-03" },
  { from: "FAC-04", to: "PROD-03" },
  { from: "FAC-01", to: "PROD-04" },
  { from: "FAC-03", to: "PROD-05" },
  { from: "FAC-01", to: "PROD-06" },
];

const shipsTo = [
  { from: "SUP-01", to: "FAC-01", transportMode: "air" },
  { from: "SUP-01", to: "FAC-02", transportMode: "air" },
  { from: "SUP-02", to: "FAC-01", transportMode: "sea" },
  { from: "SUP-12", to: "FAC-04", transportMode: "sea" },
  { from: "SUP-03", to: "FAC-02", transportMode: "air" },
  { from: "SUP-04", to: "FAC-01", transportMode: "air" },
  { from: "SUP-05", to: "FAC-02", transportMode: "sea" },
  { from: "SUP-11", to: "FAC-03", transportMode: "air" },
  { from: "SUP-06", to: "FAC-03", transportMode: "sea" },
  { from: "SUP-07", to: "FAC-03", transportMode: "road" },
  { from: "SUP-08", to: "FAC-04", transportMode: "air" },
  { from: "SUP-09", to: "FAC-01", transportMode: "sea" },
  { from: "SUP-10", to: "FAC-01", transportMode: "sea" },
];

const distributesTo = [
  { from: "FAC-01", to: "WH-03", avgTransitDays: 5 },
  { from: "FAC-01", to: "WH-01", avgTransitDays: 14 },
  { from: "FAC-02", to: "WH-03", avgTransitDays: 6 },
  { from: "FAC-03", to: "WH-04", avgTransitDays: 4 },
  { from: "FAC-03", to: "WH-01", avgTransitDays: 7 },
  { from: "FAC-04", to: "WH-02", avgTransitDays: 3 },
];

async function seed() {
  const driver = neo4j.driver(URI as string, neo4j.auth.basic(USER, PASSWORD as string), {
    maxConnectionPoolSize: 5,
  });

  try {
    await driver.verifyConnectivity();
    console.log("Connected to CognoDB.");

    const session = driver.session({ database: DATABASE });
    try {
      console.log("Applying uniqueness constraints...");
      for (const label of ["Supplier", "Component", "Product", "Factory", "Warehouse"]) {
        await session.executeWrite((tx) =>
          tx.run(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`)
        );
      }

      console.log("Clearing previous demo data...");
      await session.executeWrite((tx) =>
        tx.run(
          "MATCH (n) WHERE n:Supplier OR n:Component OR n:Product OR n:Factory OR n:Warehouse DETACH DELETE n"
        )
      );

      console.log("Loading nodes...");
      await session.executeWrite((tx) =>
        tx.run(
          "UNWIND $rows AS row MERGE (s:Supplier {id: row.id}) SET s += row",
          { rows: suppliers }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          "UNWIND $rows AS row MERGE (c:Component {id: row.id}) SET c += row",
          { rows: components }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          "UNWIND $rows AS row MERGE (p:Product {id: row.id}) SET p += row",
          { rows: products }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          "UNWIND $rows AS row MERGE (f:Factory {id: row.id}) SET f += row",
          { rows: factories }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          "UNWIND $rows AS row MERGE (w:Warehouse {id: row.id}) SET w += row",
          { rows: warehouses }
        )
      );

      console.log("Loading relationships...");
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND $rows AS row
           MATCH (s:Supplier {id: row.from}), (c:Component {id: row.to})
           MERGE (s)-[r:SUPPLIES]->(c)
           SET r.leadTimeDays = row.leadTimeDays, r.unitCostUsd = row.unitCostUsd`,
          { rows: supplies }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND $rows AS row
           MATCH (c:Component {id: row.from}), (p:Product {id: row.to})
           MERGE (c)-[r:USED_IN]->(p)
           SET r.quantityPerUnit = row.quantityPerUnit`,
          { rows: usedIn }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND $rows AS row
           MATCH (f:Factory {id: row.from}), (p:Product {id: row.to})
           MERGE (f)-[:MANUFACTURES]->(p)`,
          { rows: manufactures }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND $rows AS row
           MATCH (s:Supplier {id: row.from}), (f:Factory {id: row.to})
           MERGE (s)-[r:SHIPS_TO]->(f)
           SET r.transportMode = row.transportMode`,
          { rows: shipsTo }
        )
      );
      await session.executeWrite((tx) =>
        tx.run(
          `UNWIND $rows AS row
           MATCH (f:Factory {id: row.from}), (w:Warehouse {id: row.to})
           MERGE (f)-[r:DISTRIBUTES_TO]->(w)
           SET r.avgTransitDays = row.avgTransitDays`,
          { rows: distributesTo }
        )
      );

      const nodeCount = (
        await session.executeRead((tx) =>
          tx.run(
            "MATCH (n) WHERE n:Supplier OR n:Component OR n:Product OR n:Factory OR n:Warehouse RETURN count(n) AS count"
          )
        )
      ).records[0]?.get("count");

      console.log(`Seed complete. ${nodeCount} nodes loaded.`);
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("Seeding failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await driver.close();
  }
}

seed();
