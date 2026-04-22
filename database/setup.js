require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const config = {
  host: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  multipleStatements: true,
};

async function setup() {
  console.log('🚀 Setting up BMS MySQL database...');
  let connection;
  try {
    connection = await mysql.createConnection(config);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schema);
    console.log('✅ Database setup completed!');
    console.log('📧 Super Admin: superadmin@bms.com / Admin@123');
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

setup();
