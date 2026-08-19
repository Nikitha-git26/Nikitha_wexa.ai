import neo4j, { type Driver, type Session, type SessionMode } from "neo4j-driver";

/**
 * CognoDB connection layer (Neo4j Bolt 5.0-5.4).
 * Credentials and host come exclusively from environment variables —
 * never hardcode or string-concatenate them into connection URIs.
 */
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER ?? "cognodb";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE ?? "neo4j";

export class DatabaseConnectionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

let driver: Driver | null = null;

function getDriver(): Driver {
  if (!NEO4J_URI || !NEO4J_PASSWORD) {
    throw new DatabaseConnectionError(
      "Missing NEO4J_URI or NEO4J_PASSWORD. Copy .env.example to .env.local and fill in your CognoDB credentials."
    );
  }

  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      // Tuned for a 0.5 vCPU / 256MB CognoDB instance: keep the pool small
      // so we never open more concurrent transactions than the DB can serve.
      maxConnectionPoolSize: 5,
      connectionAcquisitionTimeout: 10_000,
      connectionTimeout: 10_000,
      maxTransactionRetryTime: 15_000,
      disableLosslessIntegers: true,
    });
  }

  return driver;
}

export async function verifyConnectivity(): Promise<void> {
  try {
    await getDriver().verifyConnectivity();
  } catch (cause) {
    throw new DatabaseConnectionError(
      "Unable to reach CognoDB. Check that NEO4J_URI is correct and the instance is running.",
      cause
    );
  }
}

/**
 * Runs a parameterized Cypher statement and returns plain JS objects.
 * `params` must be used for every dynamic value — never interpolate
 * user input directly into the `cypher` string.
 */
export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
  mode: SessionMode = neo4j.session.READ
): Promise<T[]> {
  let session: Session;
  try {
    session = getDriver().session({ defaultAccessMode: mode, database: NEO4J_DATABASE });
  } catch (cause) {
    if (cause instanceof DatabaseConnectionError) throw cause;
    throw new DatabaseConnectionError("Failed to open a CognoDB session.", cause);
  }

  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } catch (cause) {
    throw new DatabaseConnectionError("CognoDB query failed. The instance may be unreachable or overloaded.", cause);
  } finally {
    await session.close();
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
