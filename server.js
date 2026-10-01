// server.js (Carlift Management System Server - Gemini Powered)

require('dotenv').config();

const express = require('express');

const cors = require('cors');

const jwt = require('jsonwebtoken');

const path = require('path');

const { GoogleGenAI } = require('@google/genai');

const db = require('./database');



const app = express();

const SECRET_KEY = 'carlift_secret_admin_key';



app.use(cors());



// Limit for Base64 Photo Uploads (50MB)

app.use(express.json({ limit: '50mb' }));

app.use(express.urlencoded({ limit: '50mb', extended: true }));



// ==========================================

// STATIC FILES MIDDLEWARE (CSS, JS, HTML)

// ==========================================

app.use(express.static(__dirname));



// ==========================================

// ROOT ROUTE: HOME PAGE AS DEFAULT
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'homepage.html'));
});



// ==========================================

// 0. ADMIN CREDENTIALS & RECOVERY CONFIG

// ==========================================

let adminCredentials = {

  username: 'admin',

  password: 'admin123'

};



const RECOVERY_PIN = '123456'; // Master Recovery PIN



// 0.1 ADMIN LOGIN ENDPOINT

app.post('/api/admin/login', (req, res) => {

  const { username, password } = req.body;

  

  if (username === adminCredentials.username && password === adminCredentials.password) {

    const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '8h' });

    return res.json({ success: true, token, message: 'Login Successful' });

  }

  

  return res.status(401).json({ success: false, message: 'Invalid Admin Credentials' });

});



// 0.2 ADMIN PASSWORD RESET ENDPOINT (RECOVERY PIN)

app.post('/api/admin/reset-password', (req, res) => {

  const { pin, username, newUsername, newPassword } = req.body;



  if (pin !== RECOVERY_PIN) {

    return res.status(400).json({ success: false, message: 'Incorrect Recovery PIN!' });

  }



  const targetUser = username || newUsername;

  if (targetUser) adminCredentials.username = targetUser;

  if (newPassword) adminCredentials.password = newPassword;



  const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '8h' });



  console.log('✅ Admin Credentials Updated:', adminCredentials);

  return res.json({ success: true, token, message: 'Password reset successful!' });

});



// ==========================================

// 0.3 GEMINI AI CHATBOT CONFIG (ENGLISH SYSTEM INSTRUCTION)

// ==========================================

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const systemInstruction = "You are the AI Assistant for Carlift OS (Sharjah to Dubai commute). The monthly fee is AED 250 (CASH ONLY). Help passengers book their ride by collecting their Full Name, WhatsApp Number, Pickup Location, Drop-off Location, and Working Days. Be polite, helpful, and professional.";



// AI Chat Widget Endpoint

app.post('/api/ai-chat', async (req, res) => {

  const { message } = req.body;



  if (!message) {

    return res.status(400).json({ success: false, message: "No message received." });

  }



  try {

    const response = await ai.models.generateContent({

      model: 'gemini-2.5-flash',

      contents: message,

      config: {

        systemInstruction: systemInstruction,

        temperature: 0.7,

      }

    });



    const aiReply = response.text;

    res.json({ success: true, reply: aiReply });



  } catch (error) {

    console.error("Error in Gemini AI Chat:", error);

    res.status(500).json({ success: false, message: "Unable to connect to AI server." });

  }

});



// ==========================================

// HELPER FUNCTION: GET PASSENGERS WITH BALANCE

// ==========================================

function fetchPassengersWithBalance() {

  const passengers = db.prepare("SELECT * FROM passengers ORDER BY created_at DESC").all();

  const payments = db.prepare("SELECT * FROM payments").all();



  return passengers.map(p => {

    const passengerPayments = payments.filter(pay => pay.passenger_id === p.id);

    const totalPaid = passengerPayments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0);

    const monthlyRate = 250;

    const balance = Math.max(0, monthlyRate - totalPaid);

    let paymentStatus = 'Unpaid';



    if (totalPaid >= monthlyRate) {

      paymentStatus = 'Fully Paid';

    } else if (totalPaid > 0) {

      paymentStatus = 'Partial';

    }



    return {

      ...p,

      total_paid: totalPaid,

      balance: balance,

      payment_status: paymentStatus

    };

  });

}



// ==========================================

// 1. PASSENGER REGISTRATION (Form/Portal)

// ==========================================

app.post('/api/register', (req, res) => {

  const { name, photo, mobile, whatsapp, pickup, dropoff, schedule, join_date } = req.body;



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



    res.json({

      success: true,

      passengerId: nextId,

      status: 'Pending Payment',

      message: 'Registration successful! Please pay AED 250 cash to the owner.'

    });

  } catch (err) {

    console.error('Registration Error:', err);

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 2. ADMIN DASHBOARD STATS

// ==========================================

app.get('/api/dashboard-stats', (req, res) => {

  try {

    db.prepare(`

      UPDATE passengers 

      SET status = 'Pending Payment' 

      WHERE status = 'Active' 

      AND id IN (

        SELECT passenger_id FROM payments 

        GROUP BY passenger_id 

        HAVING MAX(payment_date) < datetime('now', '-30 days')

      )

    `).run();



    const total = db.prepare('SELECT COUNT(*) as count FROM passengers').get().count;

    const active = db.prepare("SELECT COUNT(*) as count FROM passengers WHERE status='Active'").get().count;

    const pending = db.prepare("SELECT COUNT(*) as count FROM passengers WHERE status='Pending Payment'").get().count;

    const totalCollection = db.prepare("SELECT SUM(amount) as total FROM payments").get().total || 0;



    res.json({

      success: true,

      stats: { total, active, pending, totalCollection }

    });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 3. GET ALL PASSENGERS LIST (Naka-integrate na ang Balance)

// ==========================================

app.get('/api/passengers', (req, res) => {

  try {

    const passengersWithBalance = fetchPassengersWithBalance();

    res.json({

      success: true,

      passengers: passengersWithBalance,

      data: passengersWithBalance

    });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



app.get('/api/admin/passengers', (req, res) => {

  try {

    const passengersWithBalance = fetchPassengersWithBalance();

    res.json({

      success: true,

      passengers: passengersWithBalance,

      data: passengersWithBalance

    });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 3.1 PASSENGER STATUS UPDATE

// ==========================================

app.put('/api/passengers/:id/status', (req, res) => {

  const passengerId = req.params.id;

  const { status } = req.body;



  try {

    const stmt = db.prepare('UPDATE passengers SET status = ? WHERE id = ?');

    const result = stmt.run(status || 'Active', passengerId);



    if (result.changes > 0) {

      res.json({ success: true, message: 'Passenger status updated successfully.' });

    } else {

      res.status(404).json({ success: false, message: 'Passenger not found.' });

    }

  } catch (err) {

    console.error('Status Update Error:', err);

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 3.2 PASSENGER WORKING TIME UPDATE

// ==========================================

app.put('/api/passengers/:id/time', (req, res) => {

  const passengerId = req.params.id;

  const { time } = req.body;



  try {

    const stmt = db.prepare('UPDATE passengers SET time = ? WHERE id = ?');

    const result = stmt.run(time, passengerId);



    if (result.changes > 0) {

      res.json({ success: true, message: 'Working time updated successfully in database.' });

    } else {

      res.status(404).json({ success: false, message: 'Passenger not found.' });

    }

  } catch (err) {

    console.error('Working Time Update Error:', err);

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 4. RECORD CASH PAYMENT & ACTIVATE STATUS

// ==========================================

app.post('/api/record-payment', (req, res) => {

  const { passengerId, amount, collector, payment_date, billing_month } = req.body;

  const receiptNo = `RCP-${Date.now().toString().slice(-6)}`;

  

  const finalPaymentDate = payment_date || new Date().toISOString();

  const finalBillingMonth = billing_month || finalPaymentDate;



  const insertPayment = db.prepare(`

    INSERT INTO payments (receipt_no, passenger_id, amount, collector, payment_date, billing_month, notes)

    VALUES (?, ?, ?, ?, ?, ?, 'Cash Payment Received')

  `);



  const updatePassenger = db.prepare(`

    UPDATE passengers SET status = 'Active' WHERE id = ?

  `);



  const executePayment = db.transaction(() => {

    insertPayment.run(receiptNo, passengerId, amount || 250, collector || 'Admin', finalPaymentDate, finalBillingMonth);

    updatePassenger.run(passengerId);

  });



  try {

    executePayment();

    res.json({

      success: true,

      receiptNo,

      message: 'Payment recorded and passenger status set to Active.'

    });

  } catch (err) {

    console.error('Record Payment Error:', err);

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 5. GET ALL PAYMENTS / RECEIPTS HISTORY

// ==========================================

app.get('/api/payments', (req, res) => {

  try {

    const payments = db.prepare(`

      SELECT payments.*, passengers.name as passenger_name 

      FROM payments 

      LEFT JOIN passengers ON payments.passenger_id = passengers.id 

      ORDER BY payment_date DESC

    `).all();

    

    res.json({

      success: true,

      data: payments

    });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 6. EXPORT REPORTS & PASSENGERS WITH BALANCE TRACKING

// ==========================================

app.get('/api/reports/summary', (req, res) => {

  try {

    const passengersWithBalance = fetchPassengersWithBalance();

    const payments = db.prepare(`

      SELECT payments.*, passengers.name as passenger_name, passengers.pickup, passengers.dropoff 

      FROM payments 

      LEFT JOIN passengers ON payments.passenger_id = passengers.id 

      ORDER BY payment_date DESC

    `).all();



    const routeRevenue = db.prepare(`

      SELECT (pickup || ' -> ' || dropoff) as route, COUNT(*) as passenger_count, SUM(250) as total_revenue

      FROM passengers

      WHERE status = 'Active'

      GROUP BY pickup, dropoff

    `).all();



    res.json({

      success: true,

      passengers: passengersWithBalance,

      payments,

      routeRevenue

    });

  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

});



// ==========================================

// 7. PERMANENT DELETE PASSENGER ENDPOINT

// ==========================================

app.delete('/api/passengers/:id', (req, res) => {

  const passengerId = req.params.id;



  try {

    db.prepare('DELETE FROM payments WHERE passenger_id = ?').run(passengerId);



    const stmt = db.prepare('DELETE FROM passengers WHERE id = ?');

    const result = stmt.run(passengerId);



    if (result.changes > 0) {

      console.log(`🗑️ Passenger ${passengerId} permanently deleted.`);

      res.json({ success: true, message: 'Passenger deleted successfully.' });

    } else {

      res.status(404).json({ success: false, message: 'Passenger not found.' });

    }

  } catch (err) {

    console.error('Delete Error:', err);

    res.status(500).json({ success: false, error: err.message });

  }

});



// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Carlift Server running on port ${PORT} (Gemini Powered)`));