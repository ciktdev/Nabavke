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

app.post('/skeniraj', upload.array('excelFajlovi'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ success: false, message: "Niste izabrali nijedan fajl." });
    }

    try {
        // Pozivamo novu funkciju iz servisa koja izvlači sve detalje
        const sveStavke = excelService.izvuciPodatkeIzExcela(req.files);

        if (sveStavke.length === 0) {
            return res.json({ success: false, message: "Nijedna validna stavka nije pronađena." });
        }

        let obradjeno = 0;
        let greske = 0;

        const formatirajZaBazu = (d) => {
            if (!d) return null;

            // 1. Ako je Excel poslao datum kao broj (npr. 46062)
            if (typeof d === 'number') {
                const date = new Date((d - 25569) * 86400 * 1000);
                return date.toISOString().split('T')[0];
            }

            // 2. Ako je datum string sa tačkama (npr. "10.02.2026" ili "10.02.2026.")
            const s = d.toString().trim();
            const delovi = s.split('.');
    
            // Proveravamo da li imamo barem dan, mesec i godinu
            if (delovi.length >= 3) {
                const dan = delovi[0].padStart(2, '0');
                const mesec = delovi[1].padStart(2, '0');
                const godina = delovi[2];
        
                // Vraćamo u formatu koji MySQL jedino prihvata: YYYY-MM-DD
                return `${godina}-${mesec}-${dan}`;
            }

            // 3. Ako je već u dobrom formatu (YYYY-MM-DD), vrati ga tako
            return d;
        };

        sveStavke.forEach(s => {
            // 1. Prvo osiguravamo da fond postoji u tabeli 'fond'
            db.query(
                "INSERT IGNORE INTO fond (ime, godina, sredstva, status) VALUES (?, ?, 0, 'a')",
                [s.ime_fonda, s.godina],
                (err) => {
                    if (err) {
                        console.error("Greška pri unosu fonda:", err);
                        greske++;
                        proveriKraj();
                        return;
                    }

                    // 2. Ubacujemo stavku u tabelu 'stavke'
                    const sqlStavka = `INSERT INTO stavke 
                        (datum_nabavke, godina, br_racuna, izvor_finansiranja, naziv_artikla, 
                         kolicina, cena_bez_pdv, cena_sa_pdv, vred_bez_pdv, vred_sa_pdv, 
                         status_placanja, datum_placanja) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                    const paramsStavka = [
                        formatirajZaBazu(s.datum), s.godina, s.br_racuna, s.ime_fonda, s.artikal,
                        s.kolicina, s.cenaBez, s.cenaSa, s.vrednostBez, s.vrednostSa,
                        s.status, formatirajZaBazu(s.datumPla)
                    ];

                    db.query(sqlStavka, paramsStavka, (errStavka) => {
                        if (errStavka) {
                            console.error("Greška pri unosu stavke:", errStavka);
                            greske++;
                        } else {
                            obradjeno++;
                        }
                        proveriKraj();
                    });
                }
            );
        });

        function proveriKraj() {
            if (obradjeno + greske === sveStavke.length) {
                res.json({ 
                    success: true, 
                    message: `Skeniranje završeno. Uspešno dodato: ${obradjeno}. Grešaka: ${greske}.` 
                });
            }
        }

    } catch (error) {
        console.error("Fatalna greška u ruti /skeniraj:", error);
        res.status(500).json({ success: false, message: "Greška na serveru prilikom obrade." });
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