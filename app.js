const resetujLogove = require('./public_logger');

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const db = require('./db');
const upisiULog = require('./logger');
const excelService = require('./services/excelService'); // JEDINI UVOZ ZA SERVIS
const narudzbeniceService = require('./services/NarudzbeniceService');

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
    resetujLogove();
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

            // 1. Obrada Excel rednog broja datuma
            if (typeof d === 'number') {
                const ms = Math.round((d - 25569) * 86400 * 1000) + (12 * 60 * 60 * 1000);
                const date = new Date(ms);
                if (!isNaN(date.getTime())) {
                    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }
        }

            const s = d.toString().trim();
            if (s === "") return null;

            // 2. Pronalazi PRVI datum u formatu DD.MM.YYYY (ignoriše nove redove i dodatne datume)
            const matchDatum = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
            if (matchDatum) {
                const dan = matchDatum[1].padStart(2, '0');
                const mesec = matchDatum[2].padStart(2, '0');
                const godina = matchDatum[3];
                return `${godina}-${mesec}-${dan}`;
            }

            // 3. Provera za ISO format (YYYY-MM-DD)
            const probniDatum = new Date(s);
            if (!isNaN(probniDatum.getTime()) && s.includes('-')) {
                return `${probniDatum.getFullYear()}-${String(probniDatum.getMonth() + 1).padStart(2, '0')}-${String(probniDatum.getDate()).padStart(2, '0')}`;
            }

            return s; 
        };

function pokreniUpisStavki() {
    (async () => {
        // Ako je niz prazan, odmah završavamo
        if (!sveStavke || sveStavke.length === 0) {
            return res.json({ success: true, message: "Nema stavki za upis." });
        }

        for (const s of sveStavke) {
            try {
                // Čistimo tekstualne vrednosti od praznih mesta
                
                const cistoImeFonda = s.ime_fonda ? s.ime_fonda.toString().trim() : '';
                const cistoImeKonta = s.konto ? s.konto.toString().trim() : '';
                const cistArtikal = s.artikal ? s.artikal.toString().trim() : 'Nepoznat artikal';

                // 💡 OBAVEZAN USLOV: Ako fali Konto ili Izvor finansiranja, odmah bacamo grešku
                if (!cistoImeKonta || cistoImeKonta === '' || cistoImeKonta === '0' || cistoImeKonta === '-') {
                    throw new Error(`U Excelu nedostaje ili je neispravan 'Konto' za ${cistArtikal}`);
                }
                
                if (!cistoImeFonda || cistoImeFonda === '' || cistoImeFonda === '0' || cistoImeFonda === '-') {
                    throw new Error(`U Excelu nedostaje ili je neispravan 'Izvor finansiranja' za ${cistArtikal} `);
                }

                if (!s.godina || s.godina.toString().trim() === '' || s.godina === 0) {
                    throw new Error(`U Excelu nedostaje 'Godina' za ${cistArtikal}`);
                }

                // ------------------------------------------------------------------
                // Ako su gornji uslovi ispunjeni, radi se upis u bazu
                // ------------------------------------------------------------------

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
                                reject(errSelect || new Error("Konto nije uspešno pronađen u bazi"));
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
                        
                        // Ažuriramo SAMO AKO je vrednost iz Excela različita od 0 
                        // I ako želimo da štedimo upite, možemo dodati i proveru da li se razlikuje od postojeće u bazi
                        if (s.vrednost_ugovora_bez_pdv != 0) {
                            await new Promise((resolve, reject) => {
                                // SQL menja vrednost samo ako prosleđena vrednost nije ista kao stara (čime izbegavamo beskoristan update)
                                const sql = `UPDATE ugovori SET vrednost_bez_pdv = ? WHERE id = ? AND (vrednost_bez_pdv <> ? OR vrednost_bez_pdv IS NULL)`;
                                
                                db.query(sql, [s.vrednost_ugovora_bez_pdv, ugovorIdZaBazu, s.vrednost_ugovora_bez_pdv], (err, rezultat) => {
                                    if (err) reject(err);
                                    else {
                                        // rezultat.affectedRows će biti 0 ako je vrednost već bila identična, 
                                        // a 1 ako je stvarno izvršen update!
                                        resolve();
                                    }
                                });
                            });
                        }
                    } else {
                        const noviUgovorId = await new Promise((resolve, reject) => {
                            db.query(
                                `INSERT INTO ugovori (broj_ugovora, vrednost_bez_pdv, vrednost_sa_pdv) 
                                 VALUES (?, ?, ?)`,
                                [cistiBrojUgovora, s.vrednost_ugovora_bez_pdv, s.vrednost_ugovora_sa_pdv],
                                (errNoviUgovor, rezultat) => errNoviUgovor ? reject(errNoviUgovor) : resolve(rezultat.insertId)
                            );
                        });
                        ugovorIdZaBazu = noviUgovorId;
                    }
                }

                // KORAK 5: Upis stavke u bazu
                const sqlStavka = `INSERT INTO stavke 
                    (konto_id, ugovor_id, datum_nabavke, br_racuna, naziv_artikla, 
                    kolicina, cena_bez_pdv, cena_sa_pdv, vred_bez_pdv, vred_sa_pdv, 
                    status_placanja, datum_placanja, institut, ime_fajla, dobavljac, 
                    broj_nabavke, partija, broj_ugovora, datum_zakljucenja) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                const paramsStavka = [
                    aktuelniKontoId, 
                    ugovorIdZaBazu, 
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
                    cistiBrojUgovora, 
                    formatirajZaBazu(s.datum_zakljucenja)
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
                console.error("❌ Greška prilikom obrade stavke:", loopError.message || loopError); 
                greske++;
                
                detaljiGresaka.push({
                    artikal: s.artikal || "Nepoznat artikal",
                    poruka: loopError.message || loopError.toString(),
                    fajl: s.nazivFajla || "Nepoznat fajl"
                });
                
                proveriKraj();
            }
        }
    })();
}

        function proveriKraj() {
            if (obradjeno + greske === sveStavke.length) {
                res.json({ 
                    success: greske === 0, 
                    message: `Skeniranje završeno. Uspešno dodato: ${obradjeno}. Grešaka: ${greske}.`,
                    detaljiGresaka: detaljiGresaka // 💡 Ovo omogućava frontendu da vidi greške baze!
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



app.post('/azuriraj-sredstva', (req, res) => {
    const { id, sredstva, /*lozinka*/ } = req.body;
    //if (lozinka !== 'moja_tajna_lozinka') return res.json({ success: false, message: 'Pogrešna lozinka' });

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

// 💡 NOVA RUTA: Dinamičko ažuriranje pojedinačnog statusa i datuma plaćanja u tabeli stavki
app.post('/azuriraj-status-stavke', (req, res) => {
    const { id, status_placanja, datum_placanja } = req.body;

    if (!id) {
        return res.status(400).json({ success: false, message: "Nedostaje ID stavke." });
    }

    // 1. Pripremi SQL za UPDATE
    let sql = "UPDATE stavke SET ";
    let params = [];

    if (status_placanja !== undefined) {
        sql += "status_placanja = ? ";
        params.push(status_placanja);
        if (status_placanja !== 'placeno') {
            sql += ", datum_placanja = NULL ";
        }
    } else if (datum_placanja !== undefined) {
        sql += "datum_placanja = ? ";
        params.push(datum_placanja === "" ? null : datum_placanja);
    }

    sql += "WHERE id = ?";
    params.push(id);

    // 2. Izvrši UPDATE
    db.query(sql, params, (err, rezultat) => {
        if (err) {
            console.error("Greška pri ažuriranju:", err);
            return res.status(500).json({ success: false, message: "Greška na serveru." });
        }

        // 3. Dohvati konto_id i ugovor_id da znamo šta da osvežimo
        db.query("SELECT konto_id, ugovor_id FROM stavke WHERE id = ?", [id], (err, rows) => {
            if (err || rows.length === 0) return res.json({ success: true }); // Ako ne nađe, bar smo update-ovali

            const { konto_id, ugovor_id } = rows[0];

            // 4. Dohvati sveže sume iz baze (trigeri su već odradili svoj posao)
            let noveSume = { success: true, kontoId: konto_id, ugovorId: ugovor_id };

            db.query("SELECT utrosena_sredstva FROM konto WHERE id = ?", [konto_id], (err, kRows) => {
                if (kRows.length > 0) noveSume.novaPotrosnjaKonta = kRows[0].utrosena_sredstva;

                db.query("SELECT utroseno_sa_pdv FROM ugovori WHERE id = ?", [ugovor_id], (err, uRows) => {
                    if (uRows.length > 0) noveSume.novaPotrosnjaUgovora = uRows[uRows.length - 1].utroseno_sa_pdv;
                    
                    // 5. Vrati sve podatke frontendu
                    res.json(noveSume);
                });
            });
        });
    });
});

// Ruta za dobijanje kontova za određeni fond
app.get('/api/fond/:id/kontovi', (req, res) => {
    const fondId = req.params.id;

    const sql = `
        SELECT 
            k.id,
            k.ime_konta,
            k.sredstva,
            k.fond_ime,
            k.fond_godina,
            COALESCE(SUM(CASE WHEN LOWER(s.status_placanja) = 'za placanje' THEN COALESCE(s.vred_sa_pdv, 0) ELSE 0 END), 0) AS za_placanje,
            COALESCE(SUM(CASE WHEN LOWER(s.status_placanja) = 'placeno' THEN COALESCE(s.vred_sa_pdv, 0) ELSE 0 END), 0) AS placeno,
            COALESCE(SUM(CASE WHEN LOWER(s.status_placanja) IN ('za placanje', 'placeno') THEN COALESCE(s.vred_sa_pdv, 0) ELSE 0 END), 0) AS utrosena_sredstva,
            (COALESCE(k.sredstva, 0) - COALESCE(SUM(CASE WHEN LOWER(s.status_placanja) IN ('za placanje', 'placeno') THEN COALESCE(s.vred_sa_pdv, 0) ELSE 0 END), 0)) AS dostupna_sredstva
        FROM konto k
        JOIN fond f ON k.fond_ime = f.ime AND k.fond_godina = f.godina
        LEFT JOIN stavke s ON s.konto_id = k.id
        WHERE f.id = ?
        GROUP BY k.id, k.ime_konta, k.sredstva, k.fond_ime, k.fond_godina
    `;

    db.query(sql, [fondId], (err, results) => {
        if (err) {
            console.error("Greška pri dohvatanju kontova sa sumama:", err);
            return res.status(500).json({ success: false, error: err.message });
        }
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

   // if (lozinka !== TAJNA_LOZINKA) return res.status(403).json({ success: false, message: "Pogrešna lozinka!" });


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
    const sql = "select distinct u.*, s.datum_zakljucenja  from ugovori u left JOIN stavke s on s.ugovor_id = u.id order by u.id desc";
    
    db.query(sql, (err, rezultati) => {
        if (err) {
            console.error("Greška pri čitanju ugovora:", err);
            return res.status(500).send("Greška na serveru prilikom čitanja ugovora.");
        }
        
        // Prikazujemo ugovori.ejs šablon i prosleđujemo mu podatke iz baze
        res.render('ugovori', { ugovori: rezultati});
    });
});

app.post('/azuriraj-ugovor', (req, res) => {
    const { id, vrednost_bez_pdv, vrednost_sa_pdv } = req.body;

    let sql = "";
    let params = [];

    // Proveravamo koje je polje poslato sa frontenda
    if (vrednost_sa_pdv !== undefined) {
        sql = `UPDATE ugovori SET vrednost_sa_pdv = ? WHERE id = ?`;
        params = [parseFloat(vrednost_sa_pdv) || 0, id];
    } else {
        sql = `UPDATE ugovori SET vrednost_bez_pdv = ? WHERE id = ?`;
        params = [parseFloat(vrednost_bez_pdv) || 0, id];
    }

    db.query(sql, params, (err, rezultat) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: "Greška u bazi." });
        }
        res.json({ success: true, message: "Ugovor uspešno ažuriran!" });
    });
});

const fs = require('fs'); // Proveri da li već imaš fs na vrhu fajla

app.get('/admin/logovi', (req, res) => {
    let konzolaSadrzaj = "Nema zapisa u logu konzole.";
    let greskeSadrzaj = "Nema zapisa u logu grešaka.";
    let promeneSadrzaj = "Nema zapisa u logu promena.";

    try {
        if (fs.existsSync('./sve_konzole.log')) {
            konzolaSadrzaj = fs.readFileSync('./sve_konzole.log', 'utf-8');
        }
        if (fs.existsSync('./sve_greske.log')) {
            greskeSadrzaj = fs.readFileSync('./sve_greske.log', 'utf-8');
        }
        if (fs.existsSync('./promene.log')) {
            promeneSadrzaj = fs.readFileSync('./promene.log', 'utf-8');
        }
    } catch (err) {
        console.error("Greška pri čitanju log fajlova:", err);
    }

    res.render('logovi', { 
        konzola: konzolaSadrzaj, 
        greske: greskeSadrzaj, 
        promene: promeneSadrzaj 
    });
});

app.get('/api/ugovor/:id/stavke', (req, res) => {
    const ugovorId = req.params.id;
    db.query('SELECT s.*, k.fond_ime, k.ime_konta FROM stavke s JOIN konto k on s.konto_id = k.id WHERE ugovor_id = ?', [ugovorId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json(results);
    });
});

app.post('/obrisi', (req, res) => {
    const { id } = req.body;
    
    // Dodaj ovo za debagovanje
    console.log("Pokušaj brisanja fonda sa ID-jem:", id);

    db.query("SELECT utrosena_sredstva FROM fond WHERE id = ?", [id], (err, results) => {
        if (err) {
            console.error("SQL Greška:", err); // Ovo će ti reći da li je problem u upitu
            return res.json({ success: false, message: "Greška u komunikaciji sa bazom." });
        }
        
        if (results.length === 0) {
            console.warn("Fond sa ID-jem", id, "nije pronađen u bazi.");
            return res.json({ success: false, message: "Fond nije pronađen u bazi podataka." });
        }

        const utroseno = parseFloat(results[0].utrosena_sredstva || 0);

        if (utroseno !== 0) {
            return res.json({ success: false, message: "Ne možete obrisati fond koji ima utrošena sredstva!" });
        }

        db.query("DELETE FROM fond WHERE id = ?", [id], (err) => {
            if (err) {
                console.error("SQL Greška pri brisanju:", err);
                return res.json({ success: false, message: "Greška pri brisanju." });
            }
            res.json({ success: true, message: "Fond je uspešno obrisan." });
        });
    });
});

app.post('/obrisi-ugovor', (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.json({ success: false, message: "Nedostaje ID ugovora." });
    }

    // 1. Proveravamo koliko stavki pripada ovom ugovoru
    db.query("SELECT COUNT(*) as broj_stavki FROM stavke WHERE ugovor_id = ?", [id], (err, results) => {
        if (err) {
            console.error("Greška pri proveri stavki ugovora:", err);
            return res.json({ success: false, message: "Greška u bazi podataka." });
        }

        const brojStavki = results[0].broj_stavki;

        // 2. Ako ima stavki, zabranjujemo brisanje
        if (brojStavki > 0) {
            return res.json({ 
                success: false, 
                message: `Ne možete obrisati ovaj ugovor jer ima ${brojStavki} povezanih stavki!` 
            });
        }

        // 3. Ako nema stavki, slobodno ga brišemo
        db.query("DELETE FROM ugovori WHERE id = ?", [id], (errDelete) => {
            if (errDelete) {
                console.error("Greška pri brisanju ugovora:", errDelete);
                return res.json({ success: false, message: "Greška pri brisanju ugovora." });
            }

            res.json({ success: true, message: "Ugovor je uspešno obrisan jer nema stavki." });
        });
    });
});

app.get('/konta-nivoi', (req, res) => {
    const duzinaNivoa = parseInt(req.query.duzina) || 7;
    
    // Čitanje filtera iz URL-a
    const unetiPrefix = req.query.prefix ? req.query.prefix.trim() : '';
    const prefixKonta = unetiPrefix ? `${unetiPrefix}%` : '%';

    const unetiFond = req.query.fond ? req.query.fond.trim() : '';
    const unetaGodina = req.query.godina ? req.query.godina.trim() : '';

    // Osnovni SQL upit
    let sql = `
        SELECT 
            LEFT(ime_konta, ?) AS razred, 
            fond_ime,  
            fond_godina,
            SUM(utrosena_sredstva) AS ukupno_utroseno
        FROM konto
        WHERE ime_konta LIKE ?
    `;
    
    let params = [duzinaNivoa, prefixKonta];

    // Dodavanje dinamičkih filtera za fond i godinu
    if (unetiFond) {
        sql += " AND fond_ime LIKE ?";
        params.push(`%${unetiFond}%`);
    }

    if (unetaGodina) {
        sql += " AND fond_godina = ?";
        params.push(unetaGodina);
    }

    sql += `
        GROUP BY LEFT(ime_konta, ?), fond_ime, fond_godina
        ORDER BY razred ASC, fond_godina DESC
    `;
    params.push(duzinaNivoa);

    db.query(sql, params, (err, rezultati) => {
        if (err) {
            console.error('Greška pri izračunavanju nivoa konta:', err);
            return res.status(500).send('Greška na serveru: ' + err.message);
        }

        res.render('konta_nivoi', { 
            podaci: rezultati, 
            odabranaDuzina: duzinaNivoa, 
            odabraniPrefix: unetiPrefix,
            odabraniFond: unetiFond,
            odabranaGodina: unetaGodina
        });
    });
});

const ExcelJS = require('exceljs');

app.get('/izvoz-ugovori-excel', (req, res) => {
    const sql = `
        SELECT k.fond_ime, k.ime_konta, s.datum_nabavke, s.br_racuna, s.naziv_artikla, s.kolicina, 
               s.cena_bez_pdv, s.cena_sa_pdv, s.vred_bez_pdv, s.vred_sa_pdv, s.status_placanja, 
               s.datum_placanja, s.institut, s.dobavljac, s.broj_nabavke, s.partija, s.broj_ugovora, 
               s.datum_zakljucenja, u.vrednost_bez_pdv, u.vrednost_sa_pdv, u.utroseno_bez_pdv, 
               u.utroseno_sa_pdv, u.ostalo_bez_pdv, u.ostalo_sa_pdv 
        FROM stavke s 
        LEFT JOIN ugovori u ON s.ugovor_id = u.id 
        LEFT JOIN konto k ON s.konto_id = k.id
        ORDER BY s.broj_ugovora
    `;

    db.query(sql, async (err, rezultati) => {
        if (err) {
            console.error("Greška pri dobijanju podataka za Excel:", err);
            return res.status(500).send("Greška na serveru.");
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stavke i Ugovori');

        // Pomoćne funkcije za pretvaranje u broj i formatiranje datuma
        const pNum = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
        };

        const fDat = (val) => {
            if (!val || val === '-') return '-';
            if (val instanceof Date) {
                const d = String(val.getDate()).padStart(2, '0');
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const y = val.getFullYear();
                return `${d}.${m}.${y}.`;
            }
            if (typeof val === 'string') {
                const deo = val.split('T')[0];
                const delovi = deo.split('-');
                if (delovi.length === 3) return `${delovi[2]}.${delovi[1]}.${delovi[0]}.`;
            }
            return val;
        };

        // Format za novčane iznose (sa razmakom/tačkom za hiljade i 2 decimale)
        const fmtBroj = { numFmt: '#,##0.00' };

        // Definisanje naziva kolona i širine u Excelu
        worksheet.columns = [
            { header: 'Izvor finansiranja', key: 'fond_ime', width: 20 },
            { header: 'Konto', key: 'ime_konta', width: 25 },
            { header: 'Datum Nabavke', key: 'datum_nabavke', width: 15 },
            { header: 'Br. Računa', key: 'br_racuna', width: 18 },
            { header: 'Naziv Artikla', key: 'naziv_artikla', width: 30 },
            { header: 'Količina', key: 'kolicina', width: 12, style: { numFmt: '#,##0' } },
            { header: 'Cena bez PDV', key: 'cena_bez_pdv', width: 15, style: fmtBroj },
            { header: 'Cena sa PDV', key: 'cena_sa_pdv', width: 15, style: fmtBroj },
            { header: 'Vrednost bez PDV', key: 'vred_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Vrednost sa PDV', key: 'vred_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Status Plaćanja', key: 'status_placanja', width: 15 },
            { header: 'Datum Plaćanja', key: 'datum_placanja', width: 15 },
            { header: 'Institut', key: 'institut', width: 15 },
            { header: 'Dobavljač', key: 'dobavljac', width: 25 },
            { header: 'Broj Nabavke', key: 'broj_nabavke', width: 15 },
            { header: 'Partija', key: 'partija', width: 12 },
            { header: 'Broj Ugovora', key: 'broj_ugovora', width: 18 },
            { header: 'Datum Zaključenja', key: 'datum_zakljucenja', width: 18 },
            { header: 'Ugovoreno bez PDV', key: 'vrednost_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Ugovoreno sa PDV', key: 'vrednost_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Utrošeno bez PDV', key: 'utroseno_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Utrošeno sa PDV', key: 'utroseno_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Preostalo bez PDV', key: 'ostalo_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Preostalo sa PDV', key: 'ostalo_sa_pdv', width: 18, style: fmtBroj }
        ];

        // Formatiranje zaglavlja (podebljano)
        worksheet.getRow(1).font = { bold: true };

        // Ubacivanje redova sa konvertovanim tipovima
        rezultati.forEach(r => {
            worksheet.addRow({
                fond_ime: r.fond_ime,
                ime_konta: r.ime_konta,
                datum_nabavke: fDat(r.datum_nabavke),
                br_racuna: r.br_racuna,
                naziv_artikla: r.naziv_artikla,
                kolicina: pNum(r.kolicina),
                cena_bez_pdv: pNum(r.cena_bez_pdv),
                cena_sa_pdv: pNum(r.cena_sa_pdv),
                vred_bez_pdv: pNum(r.vred_bez_pdv),
                vred_sa_pdv: pNum(r.vred_sa_pdv),
                status_placanja: r.status_placanja,
                datum_placanja: fDat(r.datum_placanja),
                institut: r.institut,
                dobavljac: r.dobavljac,
                broj_nabavke: r.broj_nabavke,
                partija: r.partija,
                broj_ugovora: r.broj_ugovora,
                datum_zakljucenja: fDat(r.datum_zakljucenja),
                vrednost_bez_pdv: pNum(r.vrednost_bez_pdv),
                vrednost_sa_pdv: pNum(r.vrednost_sa_pdv),
                utroseno_bez_pdv: pNum(r.utroseno_bez_pdv),
                utroseno_sa_pdv: pNum(r.utroseno_sa_pdv),
                ostalo_bez_pdv: pNum(r.ostalo_bez_pdv),
                ostalo_sa_pdv: pNum(r.ostalo_sa_pdv)
            });
        });

        // Postavljanje zaglavlja za preuzimanje fajla
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Izvoz_Ugovora.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    });
});

app.get('/izvoz-sve-excel', (req, res) => {
    const sql = `
        SELECT 
            k.fond_ime, 
            k.fond_godina, 
            f.utrosena_sredstva AS fond_utroseno, 
            k.ime_konta, 
            k.utrosena_sredstva AS konto_utroseno, 
            s.datum_nabavke, 
            s.br_racuna, 
            s.naziv_artikla, 
            s.kolicina, 
            s.cena_bez_pdv, 
            s.cena_sa_pdv, 
            s.vred_bez_pdv, 
            s.vred_sa_pdv, 
            s.status_placanja, 
            s.datum_placanja, 
            s.institut, 
            s.dobavljac, 
            s.broj_nabavke, 
            s.partija, 
            s.broj_ugovora, 
            s.datum_zakljucenja, 
            u.vrednost_bez_pdv, 
            u.vrednost_sa_pdv, 
            u.utroseno_bez_pdv, 
            u.utroseno_sa_pdv,  
            u.ostalo_bez_pdv, 
            u.ostalo_sa_pdv, 
            s.ime_fajla
        FROM stavke s 
        LEFT JOIN ugovori u ON s.ugovor_id = u.id 
        LEFT JOIN konto k ON s.konto_id = k.id 
        LEFT JOIN fond f ON k.fond_godina = f.godina AND k.fond_ime = f.ime 
        ORDER BY k.fond_ime, k.fond_godina, k.ime_konta
    `;

    db.query(sql, async (err, rezultati) => {
        if (err) {
            console.error("Greška pri generisanju Excel fajla:", err);
            return res.status(500).send("Greška na serveru pri izvozu.");
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Pregled svih stavki');

        // Pomoćne funkcije za pretvaranje u broj i formatiranje datuma
        const pNum = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
        };

        const fDat = (val) => {
            if (!val || val === '-') return '-';
            if (val instanceof Date) {
                const d = String(val.getDate()).padStart(2, '0');
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const y = val.getFullYear();
                return `${d}.${m}.${y}.`;
            }
            if (typeof val === 'string') {
                const deo = val.split('T')[0];
                const delovi = deo.split('-');
                if (delovi.length === 3) return `${delovi[2]}.${delovi[1]}.${delovi[0]}.`;
            }
            return val;
        };

        // Format brojeva sa separatorom hiljada i dve decimale
        const fmtBroj = { numFmt: '#,##0.00' };

        worksheet.columns = [
            { header: 'Izvor finansiranja', key: 'fond_ime', width: 20 },
            { header: 'Godina', key: 'fond_godina', width: 15 },
            { header: 'Utrošeno: Izvor finansiranja', key: 'fond_utroseno', width: 18, style: fmtBroj },
            { header: 'Konto', key: 'ime_konta', width: 20 },
            { header: 'Utrošeno Konto', key: 'konto_utroseno', width: 18, style: fmtBroj },
            { header: 'Datum Nabavke', key: 'datum_nabavke', width: 15 },
            { header: 'Br. Računa', key: 'br_racuna', width: 18 },
            { header: 'Naziv Artikla', key: 'naziv_artikla', width: 30 },
            { header: 'Količina', key: 'kolicina', width: 12, style: { numFmt: '#,##0' } },
            { header: 'Cena bez PDV', key: 'cena_bez_pdv', width: 15, style: fmtBroj },
            { header: 'Cena sa PDV', key: 'cena_sa_pdv', width: 15, style: fmtBroj },
            { header: 'Vrednost bez PDV', key: 'vred_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Vrednost sa PDV', key: 'vred_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Status Plaćanja', key: 'status_placanja', width: 15 },
            { header: 'Datum Plaćanja', key: 'datum_placanja', width: 15 },
            { header: 'Institut', key: 'institut', width: 15 },
            { header: 'Dobavljač', key: 'dobavljac', width: 25 },
            { header: 'Broj Nabavke', key: 'broj_nabavke', width: 15 },
            { header: 'Partija', key: 'partija', width: 12 },
            { header: 'Broj Ugovora', key: 'broj_ugovora', width: 18 },
            { header: 'Datum Zaključenja', key: 'datum_zakljucenja', width: 18 },
            { header: 'Ugovoreno bez PDV', key: 'vrednost_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Ugovoreno sa PDV', key: 'vrednost_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Utrošeno bez PDV', key: 'utroseno_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Utrošeno sa PDV', key: 'utroseno_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Preostalo bez PDV', key: 'ostalo_bez_pdv', width: 18, style: fmtBroj },
            { header: 'Preostalo sa PDV', key: 'ostalo_sa_pdv', width: 18, style: fmtBroj },
            { header: 'Ime Fajla', key: 'ime_fajla', width: 25 }
        ];

        // Podešavanje zaglavlja
        worksheet.getRow(1).font = { bold: true };

        // Mapiranje redova i konverzija tipova
        rezultati.forEach(r => {
            worksheet.addRow({
                fond_ime: r.fond_ime,
                fond_godina: r.fond_godina,
                fond_utroseno: pNum(r.fond_utroseno),
                ime_konta: r.ime_konta,
                konto_utroseno: pNum(r.konto_utroseno),
                datum_nabavke: fDat(r.datum_nabavke),
                br_racuna: r.br_racuna,
                naziv_artikla: r.naziv_artikla,
                kolicina: pNum(r.kolicina),
                cena_bez_pdv: pNum(r.cena_bez_pdv),
                cena_sa_pdv: pNum(r.cena_sa_pdv),
                vred_bez_pdv: pNum(r.vred_bez_pdv),
                vred_sa_pdv: pNum(r.vred_sa_pdv),
                status_placanja: r.status_placanja,
                datum_placanja: fDat(r.datum_placanja),
                institut: r.institut,
                dobavljac: r.dobavljac,
                broj_nabavke: r.broj_nabavke,
                partija: r.partija,
                broj_ugovora: r.broj_ugovora,
                datum_zakljucenja: fDat(r.datum_zakljucenja),
                vrednost_bez_pdv: pNum(r.vrednost_bez_pdv),
                vrednost_sa_pdv: pNum(r.vrednost_sa_pdv),
                utroseno_bez_pdv: pNum(r.utroseno_bez_pdv),
                utroseno_sa_pdv: pNum(r.utroseno_sa_pdv),
                ostalo_bez_pdv: pNum(r.ostalo_bez_pdv),
                ostalo_sa_pdv: pNum(r.ostalo_sa_pdv),
                ime_fajla: r.ime_fajla
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Kompletan_Izvestaj.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    });
});

// Ruta za izvoz nivoa konta u Excel
app.get('/izvoz-konta-nivoi-excel', (req, res) => {
    const duzinaNivoa = parseInt(req.query.duzina) || 7;
    const unetiPrefix = req.query.prefix ? req.query.prefix.trim() : '';
    const prefixKonta = unetiPrefix ? `${unetiPrefix}%` : '%';
    const unetiFond = req.query.fond ? req.query.fond.trim() : '';
    const unetaGodina = req.query.godina ? req.query.godina.trim() : '';

    let sql = `
        SELECT 
            LEFT(ime_konta, ?) AS razred, 
            fond_ime,  
            fond_godina,
            SUM(utrosena_sredstva) AS ukupno_utroseno
        FROM konto
        WHERE ime_konta LIKE ?
    `;
    
    let params = [duzinaNivoa, prefixKonta];

    if (unetiFond) {
        sql += " AND fond_ime LIKE ?";
        params.push(`%${unetiFond}%`);
    }

    if (unetaGodina) {
        sql += " AND fond_godina = ?";
        params.push(unetaGodina);
    }

    sql += `
        GROUP BY LEFT(ime_konta, ?), fond_ime, fond_godina
        ORDER BY razred ASC, fond_godina DESC
    `;
    params.push(duzinaNivoa);

    db.query(sql, params, async (err, rezultati) => {
        if (err) {
            console.error('Greška pri generisanju Excel-a za nivoe konta:', err);
            return res.status(500).send('Greška na serveru pri izvozu: ' + err.message);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Nivoi Konta');

        const pNum = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
        };

        const fmtBroj = { numFmt: '#,##0.00' };

        worksheet.columns = [
            { header: 'Konto', key: 'razred', width: 20 },
            { header: 'Izvor finansiranja', key: 'fond_ime', width: 25 },
            { header: 'Godina', key: 'fond_godina', width: 15 },
            { header: 'Ukupno Utrošeno (RSD)', key: 'ukupno_utroseno', width: 22, style: fmtBroj }
        ];

        // Podebljano zaglavlje
        worksheet.getRow(1).font = { bold: true };

        rezultati.forEach(r => {
            worksheet.addRow({
                razred: r.razred,
                fond_ime: r.fond_ime,
                fond_godina: r.fond_godina,
                ukupno_utroseno: pNum(r.ukupno_utroseno)
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Nivoi_Konta.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    });
});

// Prikaz stranice narudžbenica
app.get('/narudzbenice', (req, res) => {
    res.render('narudzbenice', { podaci: [] });
});

// Upload i parsiranje preko memorije
app.post('/ucitaj-narudzbenice', upload.single('excelFajl'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Niste poslali Excel fajl.' });
        }

        // Prosleđujemo req.file.buffer direktno u servis
        const ocitaniPodaci = await narudzbeniceService.parsujNarudzbeniceExcel(req.file.buffer);

        res.json({
            success: true,
            brojUcitanihRedova: ocitaniPodaci.length,
            podaci: ocitaniPodaci
        });

    } catch (error) {
        console.error("Greška pri obradi narudžbenica:", error);
        res.status(500).json({ success: false, message: 'Greška pri obradi Excel fajla.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server je pokrenut na http://localhost:${PORT}`);
});