require("dotenv").config();
const mysql = require("mysql2/promise");

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

function buildPoolConfig() {
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
    host: DB_HOST || MYSQLHOST || "127.0.0.1",
    port: Number(DB_PORT || MYSQLPORT || 3306),
    user: DB_USER || MYSQLUSER || "root",
    password: DB_PASSWORD || MYSQLPASSWORD || "",
    database: DB_NAME || MYSQLDATABASE || "railway",
    ssl: getSslConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

const poolConfig = buildPoolConfig();
const db = poolConfig.uri ? mysql.createPool(poolConfig.uri) : mysql.createPool(poolConfig);

async function checkConnection() {
  try {
    const connection = await db.getConnection();
    await connection.ping();
    connection.release();
    console.log("Database pool connected");
  } catch (error) {
    console.error("DB connection failed:", error.message || error.code);
    throw error;
  }
}

async function initializeDatabase() {
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
}

module.exports = { db, checkConnection, initializeDatabase };