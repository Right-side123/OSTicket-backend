const mariadb = require("mariadb");
const dotenv = require('dotenv');
dotenv.config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 5,
  timezone: "local"
});

async function query(sql, params) {
  let connection;
  try {
    connection = await pool.getConnection();
    const results = await connection.query(sql, params);
    return results;
  } catch (err) {
    console.error("Database query error:", err);
    throw new Error("Database query failed");
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { query };

// const mysql = require('mysql2');

// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: 'yourpassword',
//   database: 'osticket',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });

// module.exports = pool.promise(); 
