const xlsx = require('xlsx');

/**
 * Funkcija prolazi kroz dostavljene fajlove, traži sheet "REALIZACIJA"
 * i izvlači parove { ime, godina } iz kolona "Izvor finansiranja" i "Datum".
 */
const izvuciFondoveIzFajlova = (files) => {
    let sviPronadjeniPodaci = [];

    files.forEach(fajl => {
        try {
            const workbook = xlsx.read(fajl.buffer);
            const sheet = workbook.Sheets["REALIZACIJA"];
            
            if (!sheet) {
                console.log(`[SKENER] Preskačem fajl "${fajl.originalname}" - nema sheet-a REALIZACIJA.`);
                return;
            }

            const podaci = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            let kolonaIzvora = -1;
            let kolonaDatuma = -1;
            let startniRed = -1;

            // 1. Pronalaženje zaglavlja (tražimo gde su kolone Datum i Izvor)
            for (let i = 0; i < podaci.length; i++) {
                const red = podaci[i];
                if (!red) continue;
                
                const indexDatuma = red.findIndex(c => c && c.toString().toLowerCase().includes('datum'));
                const indexIzvora = red.findIndex(c => c && c.toString().toLowerCase().includes('izvor finansiranja'));

                if (indexDatuma !== -1 && indexIzvora !== -1) {
                    startniRed = i + 1;
                    kolonaDatuma = indexDatuma;
                    kolonaIzvora = indexIzvora;
                    break;
                }
            }

            // 2. Izvlačenje podataka red po red
            if (kolonaIzvora !== -1 && kolonaDatuma !== -1) {
                console.log(`[SKENER] Obrađujem fajl: ${fajl.originalname}`);
                
                for (let i = startniRed; i < podaci.length; i++) {
                    const red = podaci[i];
                    if (!red) continue;

                    let ime = red[kolonaIzvora] ? red[kolonaIzvora].toString().trim() : null;
                    let siroviDatum = red[kolonaDatuma];
                    let godina = null;

                    // Logika za izvlačenje godine
                    if (siroviDatum) {
                        if (typeof siroviDatum === 'number') {
                            // Excel datumski format
                            const dateObj = xlsx.SSF.parse_date_code(siroviDatum);
                            godina = dateObj.y;
                        } else {
                            // Tekstualni format (tražimo 4 cifre, npr. 2026)
                            const match = siroviDatum.toString().match(/\d{4}/);
                            if (match) {
                                godina = parseInt(match[0]);
                            }
                        }
                    }

                    // Validacija i logovanje
                    if (ime && godina && ime.toLowerCase() !== 'izvor finansiranja') {
                        // Ovde vidiš u terminalu šta je tačno upareno
                        console.log(` -> Pronađeno u redu ${i + 1}: [${godina}] ${ime}`);
                        sviPronadjeniPodaci.push({ ime, godina });
                    } else if (ime) {
                        // Loguj ako smo našli ime ali ne i godinu u tom istom redu
                        console.log(` -> PRESKOČENO u redu ${i + 1}: Nađeno ime "${ime}", ali fali godina.`);
                    }
                }
            } else {
                console.log(`[SKENER] Fajl "${fajl.originalname}" nema potrebne kolone (Datum ili Izvor).`);
            }
        } catch (e) {
            console.error(`[GREŠKA] Problem sa fajlom ${fajl.originalname}:`, e.message);
        }
    });

    // 3. Uklanjanje duplikata pre slanja u bazu (unikatni parovi Ime-Godina)
    const unikati = [];
    const mapaDuplikata = new Set();

    for (const stavka of sviPronadjeniPodaci) {
        const kljuc = `${stavka.ime.toLowerCase()}-${stavka.godina}`;
        if (!mapaDuplikata.has(kljuc)) {
            mapaDuplikata.add(kljuc);
            unikati.push(stavka);
        }
    }

    console.log(`[SKENER] Ukupno pronađeno unikatnih parova za uvoz: ${unikati.length}`);
    return unikati;
};

module.exports = { izvuciFondoveIzFajlova };