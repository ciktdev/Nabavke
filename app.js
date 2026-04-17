const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const db = require('./db');
const upisiULog = require('./logger');
const excelService = require('./services/excelService'); // JEDINI UVOZ ZA SERVIS

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // BITNO: da bi server mogao da čita JSON
app.use(express.static('public'));
// --- RUTE ---

// 1. Glavna ruta sa prikazom i filtriranjem
app.get('/', (req, res) => {
    // 1. Prihvatamo parametre za filtere i sortiranje
    const filteri = {
        pretraga: req.query.pretraga || '',
        status: req.query.status || '',
        godina: req.query.godina || '',
        sort_by: req.query.sort_by || 'id', // Podrazumevano po ID-u
        order: req.query.order === 'desc' ? 'desc' : 'asc' // Podrazumevano ASC
    };

    let sql = "SELECT * FROM fond WHERE 1=1";
    let params = [];

    // 2. Logika filtriranja
    if (filteri.pretraga) {
        sql += " AND ime LIKE ?";
        params.push(`%${filteri.pretraga}%`);
    }
    if (filteri.status) {
        sql += " AND status = ?";
        params.push(filteri.status);
    }
    if (filteri.godina) {
        sql += " AND godina = ?";
        params.push(filteri.godina);
    }

    // 3. DINAMIČKI ORDER BY
    // Dozvoljavamo samo određene kolone zbog sigurnosti (SQL injection zaštita)
    const dozvoljeneKolone = ['id', 'ime', 'godina', 'sredstva', 'status'];
    const sortirajPo = dozvoljeneKolone.includes(filteri.sort_by) ? filteri.sort_by : 'id';
    
    sql += ` ORDER BY ${sortirajPo} ${filteri.order.toUpperCase()}`;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).send("Greška u bazi: " + err.message);
        
        res.render('index', { 
            fondovi: results, 
            filteri: filteri 
        });
    });
});

// RUTA ZA SKENIRANJE SAMO FONDOVA
app.post('/skeniraj', upload.array('excelFajlovi'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ success: false, message: "Niste izabrali nijedan fajl." });
    }

    try {
        // Pozivamo funkciju koja samo traži Ime fonda i Godinu
        const pronadjeniFondovi = excelService.izvuciFondoveIzFajlova(req.files);

        if (pronadjeniFondovi.length === 0) {
            return res.json({ success: false, message: "Nijedan fond nije pronađen u fajlovima." });
        }

        let novi = 0;
        let zavrseno = 0;

        pronadjeniFondovi.forEach(f => {
            // Koristimo INSERT IGNORE da ne bi duplirali fondove ako već postoje
            db.query(
                "INSERT IGNORE INTO fond (ime, godina, sredstva, status) VALUES (?, ?, 0, 'a')",
                [f.ime, f.godina],
                (err, result) => {
                    zavrseno++;
                    if (!err && result.affectedRows > 0) {
                        novi++;
                    }

                    // Kad prođe kroz sve, vrati odgovor klijentu
                    if (zavrseno === pronadjeniFondovi.length) {
                        res.json({ 
                            success: true, 
                            message: `Obrada završena. Dodato novih: ${novi}.` 
                        });
                    }
                }
            );
        });

    } catch (error) {
        console.error("Greška pri skeniranju:", error);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});

// 2. Ručno dodavanje fonda
app.post('/dodaj', (req, res) => {
    const { ime, sredstva, status, godina } = req.body;
    const sql = "INSERT INTO fond (ime, sredstva, status, godina) VALUES (?, ?, ?, ?)";

    db.query(sql, [ime, sredstva, status, godina], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.send(`<script>alert('Greška: Fond ${ime} već postoji za ${godina}. godinu!'); window.location='/';</script>`);
            }
            console.error(err);
            return res.status(500).send("Greška pri upisu u bazu.");
        }
        upisiULog("RUČNO DODAVANJE", { ime, sredstva });
        res.redirect('/');
    });
});


// 4. Brisanje fonda (Opciono, ako imaš ovu rutu)
app.post('/obrisi', (req, res) => {
    const { id, lozinka } = req.body;
    if (lozinka !== 'moja_tajna_lozinka') { // Zameni pravom lozinkom
        return res.json({ success: false, message: "Pogrešna lozinka!" });
    }

    db.query("DELETE FROM fond WHERE id = ?", [id], (err) => {
        if (err) return res.json({ success: false, message: "Greška u bazi." });
        upisiULog("BRISANJE", { id });
        res.json({ success: true });
    });
});

// Dodaj ovo negde sa ostalim rutama (npr. ispod /dodaj)
app.post('/azuriraj-sredstva', express.json(), (req, res) => {
    const { id, sredstva, lozinka } = req.body;
    const TAJNA_LOZINKA = "moja_tajna_lozinka"; // Postavi svoju lozinku

    if (lozinka !== TAJNA_LOZINKA) {
        return res.json({ success: false, message: "Pogrešna lozinka!" });
    }

    const sql = "UPDATE fond SET sredstva = ? WHERE id = ?";
    db.query(sql, [sredstva, id], (err, result) => {
        if (err) {
            return res.json({ success: false, message: "Greška u bazi podataka." });
        }
        
        upisiULog("IZMENA SREDSTAVA", { id, noviIznos: sredstva });
        res.json({ success: true });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server je pokrenut na http://localhost:${PORT}`);
});