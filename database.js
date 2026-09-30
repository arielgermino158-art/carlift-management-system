// database.js

const Database = require('better-sqlite3');

const db = new Database('carlift.db');



// 1. Lumikha ng Tables (Base Schema - Kasama na ang billing_month at join_date)

db.exec(`

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

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP

  );



  CREATE TABLE IF NOT EXISTS payments (

    receipt_no TEXT PRIMARY KEY,

    passenger_id TEXT,

    amount REAL DEFAULT 250.00,

    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,

    payment_method TEXT DEFAULT 'CASH',

    collector TEXT DEFAULT 'Admin',

    billing_month TEXT,

    notes TEXT,

    FOREIGN KEY(passenger_id) REFERENCES passengers(id)

  );

`);



// 2. Auto-migration: Idadagdag ang 'photo' column kung wala pa sa passengers

const passengerColumns = db.prepare("PRAGMA table_info(passengers)").all();

const hasPhotoColumn = passengerColumns.some(col => col.name === 'photo');



if (!hasPhotoColumn) {

  db.exec("ALTER TABLE passengers ADD COLUMN photo TEXT;");

  console.log("Database Migration: Added 'photo' column to 'passengers' table.");

}



// 3. Auto-migration: Idadagdag ang 'join_date' column kung wala pa sa passengers

const hasJoinDateColumn = passengerColumns.some(col => col.name === 'join_date');



if (!hasJoinDateColumn) {

  db.exec("ALTER TABLE passengers ADD COLUMN join_date TEXT;");

  console.log("Database Migration: Added 'join_date' column to 'passengers' table.");

}



// 4. Auto-migration: Idadagdag ang 'billing_month' column kung wala pa sa payments

const paymentColumns = db.prepare("PRAGMA table_info(payments)").all();

const hasBillingMonthColumn = paymentColumns.some(col => col.name === 'billing_month');



if (!hasBillingMonthColumn) {

  db.exec("ALTER TABLE payments ADD COLUMN billing_month TEXT;");

  console.log("Database Migration: Added 'billing_month' column to 'payments' table.");

}



// 5. Auto-migration: Idadagdag ang 'time' column kung wala pa sa passengers

const hasTimeColumn = passengerColumns.some(col => col.name === 'time');



if (!hasTimeColumn) {

  db.exec("ALTER TABLE passengers ADD COLUMN time TEXT;");

  console.log("Database Migration: Added 'time' column to 'passengers' table.");

}



module.exports = db; 

