const crypto = require('crypto');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '192.168.2.30',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'opd',
  password: process.env.DB_PASSWORD || 'opd',
  database: process.env.DB_NAME || 'db_hrd',
  charset: 'utf8mb4',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

if (pool.pool) {
  pool.pool.on('connection', (conn) => {
    conn.query('SET NAMES utf8mb4');
  });
}

function md5(text) {
  return crypto.createHash('md5').update(String(text || ''), 'utf8').digest('hex');
}

module.exports = { pool, md5 };
