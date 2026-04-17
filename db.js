const mysql = require('mysql2');


// Konekcija sa bazom
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // tvoj username
    password: 'moja_sifra123',      // tvoja lozinka
    database: 'nabavke'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Povezan na MySQL bazu!');
});

module.exports = db;