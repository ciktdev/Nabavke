const mysql = require('mysql2');

// 💡 Učitavamo dotenv konfiguraciju (ovo omogućava čitanje .env fajla)
require('dotenv').config();

// Konekcija sa bazom pomoću varijabli iz okruženja
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // 💡 Lozinka se sada bezbedno vuče odavde
    database: process.env.DB_DATABASE
});

db.connect((err) => {
    if (err) throw err;
    console.log('Povezan na MySQL bazu preko eksternih parametara!');
});

module.exports = db;