// main.js (Electron Main Process)
const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./database');

// 1. Dashboard Stats
ipcMain.handle('get-dashboard-stats', () => {
  const totalPassengers = db.prepare('SELECT COUNT(*) as count FROM passengers').get().count;
  const activePassengers = db.prepare("SELECT COUNT(*) as count FROM passengers WHERE status='Active'").get().count;
  const pendingPassengers = db.prepare("SELECT COUNT(*) as count FROM passengers WHERE status='Pending Payment'").get().count;
  const totalCollection = db.prepare("SELECT SUM(amount) as total FROM payments").get().total || 0;
  
  return { totalPassengers, activePassengers, pendingPassengers, totalCollection };
});

// 2. Get All Passengers (IPC)
ipcMain.handle('get-passengers', () => {
  try {
    return db.prepare("SELECT * FROM passengers ORDER BY created_at DESC").all();
  } catch (err) {
    console.error('Error fetching passengers via IPC:', err);
    return [];
  }
});

// 3. Register Passenger (IPC - kasama na ang join_date)
ipcMain.handle('register-passenger', (event, data) => {
  const { name, photo, mobile, whatsapp, pickup, dropoff, schedule, join_date } = data;

  try {
    const lastRow = db.prepare('SELECT id FROM passengers ORDER BY rowid DESC LIMIT 1').get();
    let nextIdNum = 1;
    
    if (lastRow && lastRow.id) {
      const numPart = parseInt(lastRow.id.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(numPart)) {
        nextIdNum = numPart + 1;
      }
    }
    
    const nextId = `P-${String(nextIdNum).padStart(4, '0')}`;
    const finalJoinDate = join_date || new Date().toISOString().split('T')[0];

    const stmt = db.prepare(`
      INSERT INTO passengers (id, name, photo, mobile, whatsapp, pickup, dropoff, schedule, status, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending Payment', ?)
    `);

    stmt.run(nextId, name, photo, mobile, whatsapp, pickup, dropoff, schedule, finalJoinDate);

    return {
      success: true,
      passengerId: nextId,
      status: 'Pending Payment',
      message: 'Registration successful!'
    };
  } catch (err) {
    console.error('IPC Registration Error:', err);
    return { success: false, error: err.message };
  }
});

// 4. Record Payment & Activate Status (Kasama na ang custom payment_date)
ipcMain.handle('record-payment', (event, { passengerId, amount, collector, notes, payment_date }) => {
  const receiptNo = `RCP-${Date.now().toString().slice(-6)}`;
  const finalPaymentDate = payment_date || new Date().toISOString();
  
  // 1. Record Payment
  const insertPayment = db.prepare(`
    INSERT INTO payments (receipt_no, passenger_id, amount, collector, payment_date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  // 2. Update Status into Active
  const updatePassenger = db.prepare(`
    UPDATE passengers SET status = 'Active' WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    insertPayment.run(receiptNo, passengerId, amount || 250, collector || 'Admin', finalPaymentDate, notes || 'Cash Payment Received');
    updatePassenger.run(passengerId);
  });

  try {
    transaction();
    return { success: true, receiptNo, message: 'Payment recorded successfully.' };
  } catch (err) {
    console.error('IPC Payment Error:', err);
    return { success: false, error: err.message };
  }
});