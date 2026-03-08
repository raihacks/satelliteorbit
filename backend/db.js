require("dotenv").config();
const mysql = require("mysql2");

const {
  MYSQL_URL,
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL = "false",
  MYSQLHOST,
  MYSQLPORT,
  MYSQLUSER,
  MYSQLPASSWORD,
  MYSQLDATABASE,
  MYSQL_SSL
} = process.env;

const connectionUri = MYSQL_URL || DATABASE_URL;
const sslFlag = MYSQL_SSL || DB_SSL;
const useSsl = ["1", "true", "required"].includes(String(sslFlag).toLowerCase());

const db = connectionUri
  ? mysql.createPool(connectionUri)
  : mysql.createPool({
      host: DB_HOST || MYSQLHOST || "localhost",
      port: Number(DB_PORT || MYSQLPORT || 3306),
      user: DB_USER || MYSQLUSER || "root",
      password: DB_PASSWORD || MYSQLPASSWORD || "",
      database: DB_NAME || MYSQLDATABASE || "satellite_tracker",
      ssl: useSsl ? { rejectUnauthorized: true } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

function checkConnection() {
  db.getConnection((err, connection) => {
    if (err) {
      console.error("DB connection failed:", err.message || err.code || "unknown error");
      return;
    }

    connection.ping((pingErr) => {
      if (pingErr) {
        console.error("DB ping failed:", pingErr.message || pingErr.code || "unknown error");
      } else {
        console.log("Database pool connected");
      }
      connection.release();
    });
  });
}

module.exports = { db, checkConnection };