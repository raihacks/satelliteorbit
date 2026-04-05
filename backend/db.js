//db file
const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config();
dotenv.config({ path: path.join(__dirname, ".env") });

const {
  MYSQL_URL,
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL,
  MYSQLHOST,
  MYSQLPORT,
  MYSQLUSER,
  MYSQLPASSWORD,
  MYSQLDATABASE,
  MYSQL_SSL,
  RAILWAY_STATIC_URL,
  RAILWAY_PUBLIC_DOMAIN
} = process.env;

const connectionUri = MYSQL_URL || DATABASE_URL;
const isRailwayRuntime = Boolean(RAILWAY_STATIC_URL || RAILWAY_PUBLIC_DOMAIN || MYSQLHOST);

const hasDiscreteDbConfig = Boolean((DB_HOST || MYSQLHOST) && (DB_NAME || MYSQLDATABASE));
const hasDatabaseConfig = Boolean(connectionUri || hasDiscreteDbConfig);

function shouldUseSsl() {
  const sslFlag = MYSQL_SSL ?? DB_SSL;

  if (sslFlag === undefined || sslFlag === null || sslFlag === "") {
    return isRailwayRuntime;
  }

  return ["1", "true", "required", "yes"].includes(String(sslFlag).toLowerCase());
}

function getSslConfig() {
  return shouldUseSsl() ? { rejectUnauthorized: false } : undefined;
}

function isTransientConnectionError(error) {
  const transientCodes = new Set([
    "ENETUNREACH",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ECONNRESET"
  ]);

  return transientCodes.has(error?.code);
}

function buildPoolConfig() {
  if (!hasDatabaseConfig) {
    return null;
  }

  if (connectionUri) {
    return {
      uri: connectionUri,
      ssl: getSslConfig(),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  }

  return {
    host: DB_HOST || "mysql.railway.internal",
    port: Number(DB_PORT || MYSQLPORT || 3306),
    user: DB_USER || MYSQLUSER || "root",
    password: DB_PASSWORD || MYSQLPASSWORD || "XLKjZhsiSUdNSMQGwlRsaqiCQZrhGjsf",
    database: DB_NAME || MYSQLDATABASE || "railway",
    ssl: getSslConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

const poolConfig = buildPoolConfig();

function createDisabledDatabaseClient() {
  const unavailableError = new Error(
    "Database is not configured. Set MYSQL_URL (or DATABASE_URL) or provide DB_HOST/DB_NAME."
  );

  return {
    async query() {
      throw unavailableError;
    },
    async getConnection() {
      throw unavailableError;
    },
    async end() {
      return undefined;
    }
  };
}

const db = poolConfig
  ? poolConfig.uri
   ? mysql.createPool(poolConfig.uri)
    : mysql.createPool(poolConfig)
  : createDisabledDatabaseClient();

async function checkConnection() {
  if (!hasDatabaseConfig) {
    console.warn(
      "Database configuration not found. Starting API without DB connectivity; database-backed endpoints will return errors."
    );
    return;
  }

  try {
    const connection = await db.getConnection();
    await connection.ping();
    connection.release();
    console.log("Database pool connected");
  } catch (error) {
    if (isTransientConnectionError(error)) {
      console.warn(
        `Database is temporarily unreachable (${error.code}). Starting API in degraded mode with external-data fallbacks.`
      );
      return;
    }

    console.error("DB connection failed:", error.message || error.code);
    throw error;
  }
}

async function initializeDatabase() {
  if (!hasDatabaseConfig) {
    return;
  }
try{
  await db.query(`
    CREATE TABLE IF NOT EXISTS satellites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      norad_id INT NOT NULL UNIQUE,
      orbit_type VARCHAR(100) DEFAULT NULL,
      inclination FLOAT DEFAULT NULL,
      period FLOAT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tle_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      norad_id INT NOT NULL,
      tle_line1 VARCHAR(255) NOT NULL,
      tle_line2 VARCHAR(255) NOT NULL,
      source VARCHAR(50) DEFAULT 'celestrak',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_norad_tle (norad_id)
    )
  `);
    } catch (error) {
    if (isTransientConnectionError(error)) {
      console.warn(
        `Skipping database initialization because the database is temporarily unreachable (${error.code}).`
      );
      return;
    }

    throw error;
}
}


function isDatabaseUnavailableError(error) {
  return Boolean(error && typeof error.message === "string" && error.message.startsWith("Database is not configured."));
}

function getDatabaseErrorResponse(error) {
  if (isDatabaseUnavailableError(error)) {
    return {
      status: 503,
      body: {
        error: "Database is not configured",
        details: "Set MYSQL_URL (or DATABASE_URL) or DB_HOST + DB_NAME before using database-backed endpoints."
      }
    };
  }

  return {
    status: 500,
    body: { error: "Database error" }
  };
}

module.exports = { db, checkConnection, initializeDatabase, getDatabaseErrorResponse };
