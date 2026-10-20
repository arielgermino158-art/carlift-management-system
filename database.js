// database.js (Supabase / PostgreSQL version)
const { Pool } = require('pg');

// Gumagamit ito ng DATABASE_URL na nilagay natin sa Render environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Kailangan para sa secure connection papuntang Supabase
  }
});

// Function para i-initialize ang tables kung wala pa
async function initDB() {
  try {
    const client = await pool.connect();
    
    // 1. Lumikha ng Tables (PostgreSQL syntax)
    await client.query(`
      CREATE TABLE IF NOT EXISTS passengers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        photo TEXT,
        mobile TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        pickup TEXT NOT NULL,
        dropoff TEXT NOT NULL,
        schedule TEXT NOT NULL,
        status TEXT DEFAULT 'Pending Payment',
        join_date TEXT,
        time TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payments (
        receipt_no TEXT PRIMARY KEY,
        passenger_id TEXT,
        amount REAL DEFAULT 250.00,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payment_method TEXT DEFAULT 'CASH',
        collector TEXT DEFAULT 'Admin',
        billing_month TEXT,
        notes TEXT,
        FOREIGN KEY(passenger_id) REFERENCES passengers(id)
      );
    `);
    
    console.log("Database initialized successfully on Supabase (PostgreSQL).");
    client.release();
  } catch (err) {
    console.error("Error initializing database:", err);
  }
}

// Patakbuhin ang initialization
initDB();

module.exports = pool;