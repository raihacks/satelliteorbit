const mysql = require("mysql2");

const {
  DATABASE_URL,
  MYSQL_URL,
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "satellite_tracker",
  DB_SSL = "false"
} = process.env;

const connectionUri = DATABASE_URL || MYSQL_URL;
const useSsl = ["1", "true", "required"].includes(String(DB_SSL).toLowerCase());

const db = connectionUri
  ? mysql.createPool(connectionUri)
  : mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      ssl: useSsl ? { rejectUnauthorized: true } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

function checkConnection() {
  db.getConnection((err, connection) => {
    if (err) {
      console.error("DB connection failed:", err.message);
      return;
    }

        connection.ping((pingErr) => {
      if (pingErr) {
        console.error("DB ping failed:", pingErr.message);
      } else {
        console.log("Database pool connected");
      }
      connection.release();
    });
  });
}

module.exports = { db, checkConnection };