const sql = require('mssql');
const logger = require('./logger');

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE || 'BuildingManagementDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true,
  },
  pool: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

let pool = null;

async function connectDB() {
  try {
    pool = await sql.connect(dbConfig);
    logger.info('✅ SQL Server connected successfully');
    logger.info(`   Server: ${dbConfig.server}:${dbConfig.port}`);
    logger.info(`   Database: ${dbConfig.database}`);
    return pool;
  } catch (err) {
    logger.error('❌ SQL Server connection failed:', err.message);
    throw err;
  }
}

function getPool() {
  if (!pool) throw new Error('Database not connected. Call connectDB() first.');
  return pool;
}

// Utility: Execute a parameterized query
async function query(queryText, inputs = {}) {
  const request = getPool().request();
  for (const [key, { type, value }] of Object.entries(inputs)) {
    request.input(key, type, value);
  }
  return request.query(queryText);
}

// Utility: Execute a stored procedure
async function execute(procName, inputs = {}) {
  const request = getPool().request();
  for (const [key, { type, value }] of Object.entries(inputs)) {
    request.input(key, type, value);
  }
  return request.execute(procName);
}

// Utility: Begin a transaction
async function beginTransaction() {
  const transaction = new sql.Transaction(getPool());
  await transaction.begin();
  return transaction;
}

module.exports = { connectDB, getPool, query, execute, beginTransaction, sql };
