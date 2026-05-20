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
        // Pozivamo funkciju iz servisa koja izvlači sve detalje
        const sveStavke = excelService.izvuciPodatkeIzExcela(req.files);

        if (sveStavke.length === 0) {
            return res.json({ success: false, message: "Nijedna validna stavka nije pronađena." });
        }

        // --- KORAK ZA BRISANJE (ANTI-DUPLIKAT) ---
        const imenaFajlova = [...new Set(sveStavke.map(s => s.nazivFajla))];

        db.query("DELETE FROM stavke WHERE ime_fajla IN (?)", [imenaFajlova], (errDelete) => {
            if (errDelete) {
                console.error("Greška pri čišćenju starih stavki:", errDelete);
                return res.status(500).json({ success: false, message: "Greška pri osvežavanju podataka." });
            }
        
            console.log(`Obrisane stare stavke za fajlove: ${imenaFajlova.join(", ")}`);

            // Tek sada nastavljamo sa upisom
            pokreniUpisStavki();
        });

        let obradjeno = 0;
        let greske = 0;
        let detaljiGresaka = []; // Za praćenje detalja ako nešto pukne

        const formatirajZaBazu = (d, nazivPolja = "nepoznato") => {
            if (!d) return null;

            if (typeof d === 'number') {
                const ms = Math.round((d - 25569) * 86400 * 1000) + (12 * 60 * 60 * 1000);
                const date = new Date(ms);
                if (!isNaN(date.getTime())) {
                    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                }
            }

            const s = d.toString().trim();
            if (s === "") return null;

            const delovi = s.split('.');
            if (delovi.length >= 3) {
                const dan = delovi[0].trim().padStart(2, '0');
                const mesec = delovi[1].trim().padStart(2, '0');
                const godina = delovi[2].trim();
                if (!isNaN(dan) && !isNaN(mesec) && godina.length >= 4) {
                    return `${godina}-${mesec}-${dan}`;
                }
            }

            const probniDatum = new Date(s);
            if (!isNaN(probniDatum.getTime()) && s.includes('-')) {
                return `${probniDatum.getFullYear()}-${String(probniDatum.getMonth() + 1).padStart(2, '0')}-${String(probniDatum.getDate()).padStart(2, '0')}`;
            }

            return s; 
        };

        function pokreniUpisStavki() {
            (async () => {
                for (const s of sveStavke) {
                    try {
                        // KORAK 1: Upis u fond
                        await new Promise((resolve, reject) => {
                            db.query(
                                "INSERT IGNORE INTO fond (ime, godina, sredstva) VALUES (?, ?, 0)",
                                [s.ime_fonda, s.godina],
                                (err) => err ? reject(err) : resolve()
                            );
                        });

                        const nazivKonta = s.konto;
                        // KORAK 2: Upis u konto
                        await new Promise((resolve, reject) => {
                            db.query(
                                "INSERT IGNORE INTO konto (fond_ime, fond_godina, ime_konta, sredstva) VALUES (?, ?, ?, 0)",
                                [s.ime_fonda, s.godina, nazivKonta],
                                (errKonto) => errKonto ? reject(errKonto) : resolve()
                            );
                        });

                        // KORAK 3: Pronalaženje ID-a konta
                        const aktuelniKontoId = await new Promise((resolve, reject) => {
                            db.query(
                                "SELECT id FROM konto WHERE fond_ime = ? AND fond_godina = ? AND ime_konta = ?",
                                [s.ime_fonda, s.godina, nazivKonta],
                                (errSelect, rezultati) => {
                                    if (errSelect || rezultati.length === 0) {
                                        reject(errSelect || new Error("Konto nije pronađen"));
                                    } else {
                                        resolve(rezultati[0].id);
                                    }
                                }
                            );
                        });

                        // KORAK 4: Logika za strani ključ ugovora
                        let ugovorIdZaBazu = null;
                        let cistiBrojUgovora = null;

                        if (s.broj_ugovora && s.broj_ugovora.toString().trim() !== '' && s.broj_ugovora !== '-') {
                            cistiBrojUgovora = s.broj_ugovora.toString().trim();

                            const postojeciUgovori = await new Promise((resolve, reject) => {
                                db.query(
                                    "SELECT id FROM ugovori WHERE broj_ugovora = ?",
                                    [cistiBrojUgovora],
                                    (errUgovori, rezultati) => errUgovori ? reject(errUgovori) : resolve(rezultati)
                                );
                            });

                            if (postojeciUgovori.length > 0) {
                                ugovorIdZaBazu = postojeciUgovori[0].id;
                            } else {
                                const noviUgovorId = await new Promise((resolve, reject) => {
                                    db.query(
                                        `INSERT INTO ugovori (broj_ugovora, vrednost_bez_pdv, vrednost_sa_pdv, utroseno_bez_pdv, utroseno_sa_pdv, ostalo_bez_pdv, ostalo_sa_pdv) 
                                         VALUES (?, 0, 0, 0, 0, 0, 0)`,
                                        [cistiBrojUgovora],
                                        (errNoviUgovor, rezultat) => errNoviUgovor ? reject(errNoviUgovor) : resolve(rezultat.insertId)
                                    );
                                });
                                ugovorIdZaBazu = noviUgovorId;
                            }
                        }

                        // KORAK 5: Upis stavke (VRAĆENI broj_ugovora i datum_zakljucenja na kraj upita)
                        const sqlStavka = `INSERT INTO stavke 
                            (konto_id, ugovor_id, datum_nabavke, br_racuna, naziv_artikla, 
                            kolicina, cena_bez_pdv, cena_sa_pdv, vred_bez_pdv, vred_sa_pdv, 
                            status_placanja, datum_placanja, institut, ime_fajla, dobavljac, 
                            broj_nabavke, partija, broj_ugovora, datum_zakljucenja) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                        const paramsStavka = [
                            aktuelniKontoId, 
                            ugovorIdZaBazu, // INT id ili null
                            formatirajZaBazu(s.datum), 
                            s.br_racuna, 
                            s.artikal,
                            s.kolicina, 
                            s.cenaBez, 
                            s.cenaSa, 
                            s.vrednostBez, 
                            s.vrednostSa,
                            s.status, 
                            formatirajZaBazu(s.datumPla), 
                            s.institut, 
                            s.nazivFajla, 
                            s.dobavljac, 
                            s.broj_nabavke, 
                            s.partija,
                            cistiBrojUgovora, // Tekstualni broj ugovora za istoriju u stavci
                            formatirajZaBazu(s.datum_zakljucenja) // Proveri kako ti se tačno zove polje u servisu!
                        ];

                        await new Promise((resolve, reject) => {
                            db.query(sqlStavka, paramsStavka, (errStavka) => {
                                if (errStavka) {
                                    reject(errStavka);
                                } else {
                                    obradjeno++;
                                    resolve();
                                }
                            });
                        });

                        proveriKraj();

                    } catch (loopError) {
                        console.error("❌ MySQL Greška kod stavke:", loopError); 
                        greske++;
                        detaljiGresaka.push({
                            artikal: s.artikal || "Nepoznato",
                            poruka: loopError.message || loopError.toString()
                        });
                        proveriKraj();
                    }
                }
            })();
        }

        function proveriKraj() {
            if (obradjeno + greske === sveStavke.length) {
                res.json({ 
                    success: greske === 0, // Biće false ako je ijedna stavka pukla
                    message: `Skeniranje završeno. Uspešno dodato: ${obradjeno}. Grešaka: ${greske}.`,
                    detaljiGresaka: detaljiGresaka
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

app.get('/ugovori', (req, res) => {
    // Izvlačimo sve ugovore iz baze
    const sql = "SELECT * FROM ugovori ORDER BY id DESC";
    
    db.query(sql, (err, rezultati) => {
        if (err) {
            console.error("Greška pri čitanju ugovora:", err);
            return res.status(500).send("Greška na serveru prilikom čitanja ugovora.");
        }
        
        // Prikazujemo ugovori.ejs šablon i prosleđujemo mu podatke iz baze
        res.render('ugovori', { ugovori: rezultati });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server je pokrenut na http://localhost:${PORT}`);
});