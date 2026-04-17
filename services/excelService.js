const xlsx = require('xlsx');

/**
 * Funkcija prolazi kroz dostavljene fajlove, traži sheet "REALIZACIJA"
 * i izvlači sve stavke (artikle) zajedno sa informacijama o fondu.
 */
const izvuciPodatkeIzExcela = (files) => {
    let sveStavke = [];

    files.forEach(fajl => {
        try {
            const workbook = xlsx.read(fajl.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets["REALIZACIJA"];
            
            if (!sheet) {
                console.log(`[SKENER] Preskačem fajl "${fajl.originalname}" - nema taba REALIZACIJA.`);
                return;
            }

            // defval: "" sprečava pucanje ako su neke ćelije potpuno prazne
            const podaci = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            
            let kolone = { 
                datum: -1, izvor: -1, artikal: -1, racun: -1, 
                kol: -1, cenaBez: -1, cenaSa: -1, 
                vrednostBez: -1, vrednostSa: -1, 
                status: -1, datumPla: -1 
            };

            let startniRed = -1;

            // 1. Pronalaženje zaglavlja (tražimo red gde su nazivi kolona)
            for (let i = 0; i < podaci.length; i++) {
                const red = podaci[i].map(c => c ? c.toString().toLowerCase().trim() : "");
                
                if (red.includes('izvor finansiranja') && red.includes('datum')) {
                    kolone.datum = red.indexOf('datum');
                    kolone.izvor = red.indexOf('izvor finansiranja');
                    kolone.artikal = red.findIndex(c => c.includes('artikl') || c.includes('naziv artikla'));
                    kolone.racun = red.findIndex(c => c.includes('račun') || c.includes('racun'));
                    kolone.kol = red.findIndex(c => c.includes('kol.'));
                    kolone.cenaBez = red.findIndex(c => c.includes('cena bez'));
                    kolone.cenaSa = red.findIndex(c => c.includes('cena sa'));
                    kolone.vrednostBez = red.findIndex(c => c.includes('vred. bez') || c.includes('vrednost bez'));
                    kolone.vrednostSa = red.findIndex(c => c.includes('vrednost sa') || c.includes('vred. sa'));
                    kolone.status = red.findIndex(c => c.includes('status') || c.includes('status'));
                    kolone.datumPla = red.findIndex(c => c.includes('datum placa') || c.includes('datum plaća'));

                    startniRed = i + 1;
                    break;
                }
            }

            // 2. Provera da li smo našli bar osnovne kolone
            if (startniRed !== -1 && kolone.izvor !== -1) {
                console.log(`[SKENER] Obrađujem fajl: ${fajl.originalname}`);

                for (let i = startniRed; i < podaci.length; i++) {
                    const red = podaci[i];
                    if (!red || red.length === 0) continue;

                    // Izvlačenje osnovnih vrednosti za validaciju
                    let imeFonda = red[kolone.izvor] ? red[kolone.izvor].toString().trim() : null;
                    let nazivArtikla = red[kolone.artikal] ? red[kolone.artikal].toString().trim() : null;
                    let siroviDatum = red[kolone.datum];
                    let godina = null;

                    // Logika za godinu
                    if (siroviDatum) {
                        if (typeof siroviDatum === 'number') {
                            godina = xlsx.SSF.parse_date_code(siroviDatum).y;
                        } else {
                            const match = siroviDatum.toString().match(/\d{4}/);
                            if (match) godina = parseInt(match[0]);
                        }
                    }

                    // --- VALIDACIJA I LOGOVANJE ---
                    // Uslov: Mora imati Fond, Godinu i Naziv artikla, i ne sme biti naslovni red
                    if (imeFonda && godina && nazivArtikla && imeFonda.toLowerCase() !== 'izvor finansiranja') {
                        
                        // Ako prođe validaciju, dodajemo u niz
                        sveStavke.push({
                            ime_fonda: imeFonda,
                            godina: godina,
                            datum: siroviDatum,
                            br_racuna: red[kolone.racun] || "/",
                            artikal: nazivArtikla,
                            kolicina: parseFloat(red[kolone.kol]) || 0,
                            cenaBez: parseFloat(red[kolone.cenaBez]) || 0,
                            cenaSa: parseFloat(red[kolone.cenaSa]) || 0,
                            vrednostBez: parseFloat(red[kolone.vrednostBez]) || 0,
                            vrednostSa: parseFloat(red[kolone.vrednostSa]) || 0,
                            status: red[kolone.status] || "Nije navedeno",
                            datumPla: red[kolone.datumPla] || null
                        });

                        console.log(` -> RED ${i + 1}: DODATO [${godina}] [${imeFonda}] - ${nazivArtikla}`);

                    } else {
                        // Opciono logovanje zašto je red preskočen (samo ako red nije skroz prazan)
                        if (imeFonda || nazivArtikla) {
                            let razlog = !godina ? "fali godina" : (!nazivArtikla ? "fali artikal" : "naslovni red");
                            console.log(` -> RED ${i + 1}: PRESKOČENO (${razlog})`);
                        }
                    }
                }
            } else {
                console.log(`[SKENER] Fajl "${fajl.originalname}" nema potrebne kolone (Izvor finansiranja).`);
            }
        } catch (e) {
            console.error(`[GREŠKA] Problem sa fajlom ${fajl.originalname}:`, e.message);
        }
    });

    console.log(`[SKENER] Ukupno spremno za bazu: ${sveStavke.length} stavki.`);
    return sveStavke;
};

module.exports = {
    izvuciPodatkeIzExcela
};