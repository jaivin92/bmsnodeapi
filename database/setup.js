require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
  }
};

async function setup() {
  console.log('🚀 Setting up BMS Database...');
  let pool;
  try {
    pool = await sql.connect(config);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    
    // Split by GO statements and execute each batch
    const batches = schema.split(/\bGO\b/gi).map(b => b.trim()).filter(Boolean);
    for (const batch of batches) {
      try {
        await pool.request().query(batch);
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('There is already an object')) {
          console.warn('Batch warning:', err.message.substring(0, 100));
        }
      }
    }
    console.log('✅ Database setup completed!');
    console.log('📧 Super Admin: superadmin@bms.com / Admin@123');
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
  } finally {
    if (pool) await sql.close();
  }
}

setup();
