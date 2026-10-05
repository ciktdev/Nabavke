const xlsx = require('xlsx');

/**
 * Konvertuje bilo koji unos iz Excel-a (broj, DD.MM.YYYY., YYYY-MM-DD...) u važeći JS Date objekat.
 * Vraća null ako unos nije datum (npr. tekst, iznos ili prazna ćelija).
 */
function parsujDatum(val) {
    if (val === null || val === undefined) return null;

    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }

    // Excel serijski broj za datume (opseg od ~2000. do 2090. godine)
    const numVal = Number(val);
    if (!isNaN(numVal) && typeof val !== 'boolean') {
        if (numVal >= 35000 && numVal <= 70000) {
            try {
                const parsed = xlsx.SSF.parse_date_code(numVal);
                if (parsed && parsed.y && parsed.m && parsed.d) {
                    return new Date(parsed.y, parsed.m - 1, parsed.d);
                }
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    if (typeof val !== 'string') return null;

    const strVal = val.trim();
    if (!strVal || strVal === '/' || strVal === '-' || strVal.toLowerCase() === 'null') return null;

    // 1. Format: DD.MM.YYYY ili D.M.YYYY (sa ili bez tačke na kraju)
    const dotMatch = strVal.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
    if (dotMatch) {
        const dan = parseInt(dotMatch[1], 10);
        const mesec = parseInt(dotMatch[2], 10) - 1;
        const godina = parseInt(dotMatch[3], 10);
        const d = new Date(godina, mesec, dan);
        if (!isNaN(d.getTime())) return d;
    }

    // 2. Format: DD/MM/YYYY ili DD-MM-YYYY
    const slashMatch = strVal.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (slashMatch) {
        const dan = parseInt(slashMatch[1], 10);
        const mesec = parseInt(slashMatch[2], 10) - 1;
        const godina = parseInt(slashMatch[3], 10);
        const d = new Date(godina, mesec, dan);
        if (!isNaN(d.getTime())) return d;
    }

    // 3. Format: YYYY-MM-DD ili YYYY/MM/DD
    const isoMatch = strVal.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (isoMatch) {
        const godina = parseInt(isoMatch[1], 10);
        const mesec = parseInt(isoMatch[2], 10) - 1;
        const dan = parseInt(isoMatch[3], 10);
        const d = new Date(godina, mesec, dan);
        if (!isNaN(d.getTime())) return d;
    }

    const dStandard = new Date(strVal);
    if (!isNaN(dStandard.getTime()) && dStandard.getFullYear() > 1990 && dStandard.getFullYear() < 2100) {
        return dStandard;
    }

    return null;
}

/**
 * Određuje finansijsku godinu za stavku:
 * - Ako postoji datum plaćanja -> stvarna godina bez +45 dana
 * - Ako ne postoji -> dodaje 45 dana na datum nabavke
 */
function izracunajGodinuZaStavku(siroviDatumPla, siroviDatum) {
    const dPla = parsujDatum(siroviDatumPla);
    if (dPla) {
        return dPla.getFullYear();
    }

    const dNab = parsujDatum(siroviDatum);
    if (dNab) {
        const dKopija = new Date(dNab.getTime());
        dKopija.setDate(dKopija.getDate() + 45);
        return dKopija.getFullYear();
    }

    if (siroviDatum) {
        const match = siroviDatum.toString().match(/\b(19|20)\d{2}\b/);
        if (match) return parseInt(match[0], 10);
    }

    return null;
}

const izvuciPodatkeIzExcela = (files) => {
    let sveStavke = [];

    files.forEach(fajl => {
        try {
            const workbook = xlsx.read(fajl.buffer, { type: 'buffer' });
            
            const stvarniNazivSheeta = workbook.SheetNames.find(
                name => name.toLowerCase().trim() === 'realizacija'
            );
            
            const sheet = stvarniNazivSheeta ? workbook.Sheets[stvarniNazivSheeta] : null;
            
            console.log(`\n[SKENER] Obrađujem fajl: ${fajl.originalname}`);
            if (!sheet) {
                console.log(`[SKENER] Preskačem fajl "${fajl.originalname}" - nema taba REALIZACIJA.`);
                return;
            }

            const dobavljacSirovo = sheet['A1'] ? sheet['A1'].v.toString().toUpperCase().trim() : '';
            const nabavkaPartijaSirovo = sheet['A2'] ? sheet['A2'].v.toString().toUpperCase().trim() : '';
            const ugovorDatumSirovo = sheet['A3'] ? sheet['A3'].v.toString().toUpperCase().trim() : '';
            const vrednost_ugovora_bez_pdv = sheet['A4'] ? parseFloat(sheet['A4'].v.toString()) : 0;
            const vrednost_ugovora_sa_pdv = sheet['A5'] ? parseFloat(sheet['A5'].v.toString()) : 0;
            const organizacionaJedinica = sheet['A6'] ? sheet['A6'].v.toString().toUpperCase().trim() : null;
            let brojNabavke = nabavkaPartijaSirovo;
            let partija = null;

            if (nabavkaPartijaSirovo.toLowerCase().includes('partija')) {
                const deloviNabavke = nabavkaPartijaSirovo.split(new RegExp('partija', 'i'));
                brojNabavke = deloviNabavke[0].replace(/[,;:]\s*$/, '').trim();
                partija = "PARTIJA " + deloviNabavke[1].replace(/[:\s=-]+/g, '').trim();
            }

            let brojUgovora = ugovorDatumSirovo;
            let datumUgovoraSirovo = null;

            if (ugovorDatumSirovo.toLowerCase().includes(' od ')) {
                const deloviUgovora = ugovorDatumSirovo.split(new RegExp('\\s+od\\s+', 'i'));
                brojUgovora = deloviUgovora[0].trim();
                datumUgovoraSirovo = deloviUgovora[1].trim();
            }

            const podaci = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            
            let kolone = { 
                konto: -1, datum: -1, izvor: -1, artikal: -1, racun: -1, 
                kol: -1, cenaBez: -1, cenaSa: -1, 
                vrednostBez: -1, vrednostSa: -1, 
                status: -1, datumPla: -1, institut: -1 
            };

            let startniRed = -1;
            for (let i = 0; i < podaci.length; i++) {
                const red = podaci[i].map(c => 
                    c ? c.toString().replace(/[\r\n]+/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim() : ""
                );

                if (red.includes('izvor finansiranja') && red.includes('datum')) {
                    kolone.datum = red.indexOf('datum');
                    kolone.izvor = red.indexOf('izvor finansiranja');
                    kolone.artikal = red.findIndex(c => c.includes('artikl') || c.includes('naziv artikla'));
                    kolone.racun = red.findIndex(c => c.includes('račun') || c.includes('racun'));
                    kolone.kol = red.findIndex(c => c.includes('kol.'));
                    kolone.cenaBez = red.findIndex(c => c.includes('cena bez'));
                    kolone.cenaSa = red.findIndex(c => c.includes('cena sa'));
                    kolone.vrednostBez = red.findIndex(c => c.includes('vred. bez') || c.includes('vrednost bez'));
                    kolone.vrednostSa = red.findIndex(c => (c.includes('vrednost sa') || c.includes('vred.')) && !c.includes('nerealizovan'));
                    kolone.status = red.findIndex(c => c.includes('status'));
                    kolone.datumPla = red.findIndex(c => c.includes('datum placa') || c.includes('datum plaća'));
                    kolone.konto = red.findIndex(c => c.includes('konto'));
                    kolone.institut = red.findIndex(c => c.includes('institut'));
                    startniRed = i + 1;
                    break;
                }
            }

            if (startniRed !== -1 && kolone.izvor !== -1) {
                for (let i = startniRed; i < podaci.length; i++) {
                    const red = podaci[i];
                    if (!red || red.length === 0) continue;

                    let imeFonda = red[kolone.izvor] ? red[kolone.izvor].toString().trim() : null;
                    let nazivArtikla = red[kolone.artikal] ? red[kolone.artikal].toString().trim() : null;
                    let siroviDatum = red[kolone.datum];
                    let siroviDatumPla = kolone.datumPla !== -1 ? red[kolone.datumPla] : null;

                    let godina = izracunajGodinuZaStavku(siroviDatumPla, siroviDatum);

                    const proveraArtikla = nazivArtikla ? nazivArtikla.toString().trim() : '';
                    const proveraRacuna = red[kolone.racun] ? red[kolone.racun].toString().trim() : '';
                    const proveraVrednosti = parseFloat(red[kolone.vrednostSa]) || 0;

                    if ((proveraArtikla !== '' && proveraArtikla !== '-') || (proveraRacuna !== '' && proveraRacuna !== '/' && proveraVrednosti > 0)) {
                        const nijeNaslovniRed = imeFonda ? imeFonda.toLowerCase() !== 'izvor finansiranja' : true;

                        if (nijeNaslovniRed) {
                            sveStavke.push({
                                ime_fonda: imeFonda || 'nepoznato',
                                godina: godina || null,
                                datum: siroviDatum,
                                br_racuna: red[kolone.racun] || "/",
                                artikal: nazivArtikla || "Nepoznat artikal",
                                kolicina: parseFloat(red[kolone.kol]) || 0,
                                cenaBez: parseFloat(red[kolone.cenaBez]) || 0,
                                cenaSa: parseFloat(red[kolone.cenaSa]) || 0,
                                vrednostBez: parseFloat(red[kolone.vrednostBez]) || 0,
                                vrednostSa: parseFloat(red[kolone.vrednostSa]) || 0,
                                status: red[kolone.status] || null,
                                datumPla: siroviDatumPla || null,
                                konto: red[kolone.konto] || null,
                                institut: red[kolone.institut] || organizacionaJedinica,
                                nazivFajla: fajl.originalname,
                                dobavljac: dobavljacSirovo,
                                broj_nabavke: brojNabavke,
                                partija: partija,
                                broj_ugovora: brojUgovora,
                                datum_zakljucenja: datumUgovoraSirovo,
                                vrednost_ugovora_bez_pdv: vrednost_ugovora_bez_pdv,
                                vrednost_ugovora_sa_pdv: vrednost_ugovora_sa_pdv
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[GREŠKA] Problem sa fajlom ${fajl.originalname}:`, e.message);
        }
    });

    return sveStavke;
};

module.exports = {
    izvuciPodatkeIzExcela
};