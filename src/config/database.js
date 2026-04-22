const mysql = require('mysql2/promise');
const logger = require('./logger');

const dbConfig = {
  host: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  database: process.env.DB_DATABASE || 'BuildingManagementDB',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  timezone: 'Z',
  namedPlaceholders: false,
};

const sql = {
  UniqueIdentifier: 'UniqueIdentifier',
  NVarChar: 'NVarChar',
  DateTime2: 'DateTime2',
  Date: 'Date',
  Bit: 'Bit',
  Int: 'Int',
  Decimal: 'Decimal',
  Time: 'Time',
};

let pool = null;

function normalizeSql(queryText = '') {
  return queryText
    .replace(/GETUTCDATE\(\)/gi, 'UTC_TIMESTAMP()')
    .replace(/CAST\(UTC_TIMESTAMP\(\)\s+AS\s+DATE\)/gi, 'UTC_DATE()')
    .replace(/DATEADD\(DAY\s*,\s*(-?\d+)\s*,\s*UTC_TIMESTAMP\(\)\)/gi, 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL $1 DAY)')
    .replace(/DATEADD\(MONTH\s*,\s*(-?\d+)\s*,\s*UTC_TIMESTAMP\(\)\)/gi, 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL $1 MONTH)')
    .replace(/OFFSET\s+@([A-Za-z0-9_]+)\s+ROWS\s+FETCH\s+NEXT\s+@([A-Za-z0-9_]+)\s+ROWS\s+ONLY/gi, 'LIMIT @$2 OFFSET @$1')
    .replace(/OUTPUT\s+INSERTED\.\*/gi, 'RETURNING *')
    .replace(/OUTPUT\s+INSERTED\.([A-Za-z0-9_\s,\.]+)/gi, (_, cols) => {
      const cleaned = cols.split(',').map((c) => c.trim().replace(/^INSERTED\./i, '')).join(', ');
      return `RETURNING ${cleaned}`;
    });
}

function buildQuery(queryText, inputs = {}) {
  const normalized = normalizeSql(queryText);
  const values = [];
  const sqlText = normalized.replace(/@([A-Za-z0-9_]+)/g, (_, key) => {
    const input = inputs[key];
    values.push(input ? input.value : null);
    return '?';
  });
  return { sqlText, values };
}

async function connectDB() {
  try {
    pool = mysql.createPool(dbConfig);
    const conn = await pool.getConnection();
    conn.release();
    logger.info('✅ MySQL connected successfully');
    logger.info(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    logger.info(`   Database: ${dbConfig.database}`);
    return pool;
  } catch (err) {
    logger.error('❌ MySQL connection failed:', err.message);
    throw err;
  }
}

function getPool() {
  if (!pool) throw new Error('Database not connected. Call connectDB() first.');
  return pool;
}

async function runQuery(conn, queryText, inputs = {}) {
  const { sqlText, values } = buildQuery(queryText, inputs);
  const [rows] = await conn.query(sqlText, values);
  return {
    recordset: Array.isArray(rows) ? rows : [],
    rowsAffected: Array.isArray(rows) ? [rows.length] : [0],
  };
}

async function query(queryText, inputs = {}) {
  return runQuery(getPool(), queryText, inputs);
}

async function execute() {
  throw new Error('Stored procedures are not supported in this MySQL migration utility.');
}

async function beginTransaction() {
  const connection = await getPool().getConnection();
  await connection.beginTransaction();

  return {
    request() {
      const inputs = {};
      return {
        input(name, _type, value) {
          inputs[name] = { value };
          return this;
        },
        query(queryText) {
          return runQuery(connection, queryText, inputs);
        },
      };
    },
    async commit() {
      try {
        await connection.commit();
      } finally {
        connection.release();
      }
    },
    async rollback() {
      try {
        await connection.rollback();
      } finally {
        connection.release();
      }
    },
    async release() {
      connection.release();
    },
  };
}

module.exports = { connectDB, getPool, query, execute, beginTransaction, sql };
