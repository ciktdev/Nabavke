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

// 1. Glavna ruta sa prikazom i filtriranjem (Ažurirana verzija)
app.get('/', (req, res) => {
    // 1. Prihvatamo parametre za filtere i sortiranje
    const filteri = {
        pretraga: req.query.pretraga || '',
        // Izbacili smo status jer više ne postoji u tabeli fond
        godina: req.query.godina || '',
        sort_by: req.query.sort_by || 'id', // Podrazumevano po ID-u
        order: req.query.order === 'desc' ? 'desc' : 'asc' // Podrazumevano ASC
    };

    let sql = "SELECT * FROM fond WHERE 1=1";
    let params = [];

    // 2. Logika filtriranja
    if (filteri.pretraga) {
        // Proveri da li se tvoja kolona zove 'ime' ili 'ime_fonda' (u prethodnim porukama je bila ime_fonda)
        sql += " AND ime LIKE ?";
        params.push(`%${filteri.pretraga}%`);
    }
    
    if (filteri.godina) {
        sql += " AND godina = ?";
        params.push(filteri.godina);
    }

    // 3. DINAMIČKI ORDER BY
    // Ažurirane dozvoljene kolone: dodate utrosena_sredstva i dostupna_sredstva, izbačen status
    const dozvoljeneKolone = ['id', 'ime', 'godina', 'sredstva', 'utrosena_sredstva', 'dostupna_sredstva'];
    const sortirajPo = dozvoljeneKolone.includes(filteri.sort_by) ? filteri.sort_by : 'id';
    
    sql += ` ORDER BY ${sortirajPo} ${filteri.order.toUpperCase()}`;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Greška pri učitavanju fondova:", err);
            return res.status(500).send("Greška u bazi: " + err.message);
        }
        
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
            // KORAK 1: Upis u fond (Kolona se zove 'ime', a ne 'ime_fonda')
            console.log(s)
            db.query(
                "INSERT IGNORE INTO fond (ime, godina, sredstva) VALUES (?, ?, 0)",
                [s.ime_fonda, s.godina], // s.ime_fonda dolazi iz Excel servisa
                (err) => {
                    if (err) { greske++; proveriKraj(); return; }

                    const nazivKonta = s.konto;
                    // KORAK 2: Upis u konto
                    db.query(
                        "INSERT IGNORE INTO konto (fond_ime, fond_godina, ime_konta, sredstva) VALUES (?, ?, ?, 0)",
                        [s.ime_fonda, s.godina, nazivKonta],
                        (errKonto) => {
                            if (errKonto) { greske++; console.error(errKonto.message); proveriKraj(); return; }

                            // KORAK 3: Pronalaženje ID-a konta (FIX za sliku image_b384da.png)
                            db.query(
                                "SELECT id FROM konto WHERE fond_ime = ? AND fond_godina = ? AND ime_konta = ?",
                                [s.ime_fonda, s.godina, nazivKonta],
                                (errSelect, rezultati) => {
                                    if (errSelect || rezultati.length === 0) {
                                        console.error("Neuspešno pronalaženje ID-a konta", s.ime_fonda, s.konto);
                                        greske++; proveriKraj(); return;
                                    }

                                            const aktuelniKontoId = rezultati[0].id;
                                            // 4. KORAK: Upis stavke (Sa ispravnim ID-em)
                                            const sqlStavka = `INSERT INTO stavke 
                                                (konto_id, datum_nabavke, br_racuna, naziv_artikla, 
                                                kolicina, cena_bez_pdv, cena_sa_pdv, vred_bez_pdv, vred_sa_pdv, 
                                                status_placanja, datum_placanja, institut) 
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                                            const paramsStavka = [
                                                aktuelniKontoId, formatirajZaBazu(s.datum), s.br_racuna, s.artikal,
                                                s.kolicina, s.cenaBez, s.cenaSa, s.vrednostBez, s.vrednostSa,
                                                s.status, formatirajZaBazu(s.datumPla), s.institut
                                            ];

                                            db.query(sqlStavka, paramsStavka, (errStavka) => {
                                                if (errStavka){
                                                    console.error("Greška kod stavke:", errStavka);
                                                    greske++;

                                                } else obradjeno++;
                                                proveriKraj();
                                            });
                                        }
                                    );
                                }
                            );
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
    const { ime, sredstva, godina } = req.body;
    const sql = "INSERT INTO fond (ime, sredstva, godina) VALUES (?, ?, ?)";

    db.query(sql, [ime, sredstva, godina], (err) => {
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
app.post('/azuriraj-sredstva', (req, res) => {
    const { id, sredstva, lozinka } = req.body;
    if (lozinka !== 'moja_tajna_lozinka') return res.json({ success: false, message: 'Pogrešna lozinka' });

    const sqlUpdate = "UPDATE fond SET sredstva = ? WHERE id = ?";
    db.query(sqlUpdate, [sredstva, id], (err) => {
        if (err) return res.json({ success: false, message: 'Greška u bazi' });

        // KLJUČNI DEO: Nakon update-a, odmah čitamo novo stanje
        const sqlSelect = "SELECT sredstva, utrosena_sredstva, dostupna_sredstva FROM fond WHERE id = ?";
        db.query(sqlSelect, [id], (err, results) => {
            if (err) return res.json({ success: false, message: 'Greška pri čitanju' });
            
            // Šaljemo nazad prave brojeve iz baze
            res.json({ 
                success: true, 
                podaci: results[0] 
            });
        });
    });
});

// Ruta za dobijanje kontova za određeni fond
app.get('/api/fond/:id/kontovi', (req, res) => {
    const fondId = req.params.id;
    // Spajamo tabele preko imena i godine jer je to veza u tvojoj šemi
    const sql = `
        SELECT k.* FROM konto k
        JOIN fond f ON k.fond_ime = f.ime AND k.fond_godina = f.godina
        WHERE f.id = ?`;
    
    db.query(sql, [fondId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json(results);
    });
});

// Ruta za dobijanje stavki za određeni konto
app.get('/api/konto/:id/stavke', (req, res) => {
    const kontoId = req.params.id;
    db.query('SELECT * FROM stavke WHERE konto_id = ?', [kontoId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json(results);
    });
});

// Ruta za ručno dodavanje konta u određeni fond
app.post('/dodaj-konto', (req, res) => {
    // Ovde hvatamo tačna imena koja šalje script.js
    const { fond_ime, fond_godina, ime_konta, sredstva } = req.body;
    
    // Provera da li su podaci stigli kako treba
    console.log("Dodajem konto:", { fond_ime, fond_godina, ime_konta });

    const sql = "INSERT INTO konto (fond_ime, fond_godina, ime_konta, sredstva) VALUES (?, ?, ?, ?)";
    
    // PAZI: Redosled u [ ] mora biti identičan redosledu upitnika u SQL-u!
    db.query(sql, [fond_ime, fond_godina, ime_konta, sredstva || 0], (err, result) => {
        if (err) {
            console.error("Greška u bazi:", err.message);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.json({ success: false, message: "Ovaj konto već postoji!" });
            }
            return res.json({ success: false, message: "Greška u bazi: " + err.message });
        }
        res.json({ success: true, message: "Konto uspešno kreiran!" });
    });
});

app.post('/azuriraj-sredstva-konta', (req, res) => {
    const { id, sredstva, lozinka } = req.body;
    const TAJNA_LOZINKA = "moja_tajna_lozinka";

    if (lozinka !== TAJNA_LOZINKA) {
        return res.status(403).json({ success: false, message: "Pogrešna lozinka!" });
    }

    const sql = "UPDATE konto SET sredstva = ? WHERE id = ?";
    db.query(sql, [sredstva, id], (err, result) => {
        if (err) {
            console.error("Greška u bazi:", err);
            return res.status(500).json({ success: false, message: "Baza podataka nije prihvatila izmenu." });
        }
        
        // Tek kada baza potvrdi uspeh, šaljemo odgovor klijentu
        res.json({ success: true });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server je pokrenut na http://localhost:${PORT}`);
});