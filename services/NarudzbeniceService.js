const xlsx = require('xlsx');

// Pomoćna funkcija za preslovljavanje ćirilice u latinicu
function cir2lat(tekst) {
    if (typeof tekst !== 'string') return tekst;
    const mapa = {
        'Љ':'Lj', 'Њ':'Nj', 'Џ':'Dž', 'љ':'lj', 'њ':'nj', 'џ':'dž',
        'А':'A', 'Б':'B', 'В':'V', 'Г':'G', 'Д':'D', 'Ђ':'Đ', 'Е':'E', 'Ж':'Ž', 'З':'Z', 'И':'I',
        'Ј':'J', 'К':'K', 'Л':'L', 'М':'M', 'Н':'N', 'О':'O', 'П':'P', 'Р':'R', 'С':'S', 'Т':'T',
        'Ћ':'Ć', 'У':'U', 'Ф':'F', 'Х':'H', 'Ц':'C', 'Ч':'Č', 'Ш':'Š',
        'а':'a', 'б':'b', 'в':'v', 'г':'g', 'д':'d', 'ђ':'đ', 'е':'e', 'ж':'ž', 'з':'z', 'и':'i',
        'ј':'j', 'к':'k', 'л':'l', 'м':'m', 'н':'n', 'о':'o', 'п':'p', 'р':'r', 'с':'s', 'т':'t',
        'ћ':'ć', 'у':'u', 'ф':'f', 'х':'h', 'ц':'c', 'ч':'č', 'ш':'š'
    };
    return tekst.replace(/Љ|Њ|Џ|љ|њ|џ|[А-Ша-шЂђЋћ]/g, chr => mapa[chr] || chr);
}

const parsujNarudzbeniceExcel = (fileBuffer, originalname = 'Dokument') => {
    try {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : null;

        if (!sheet) {
            return {
                success: false,
                message: 'E, ovo ti nisu narudžbenice! Fajl je prazan ili nema radnih listova.'
            };
        }

        const podaci = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        let kolone = { 
            izvor: -1, 
            konto: -1, 
            predmetNabavke: -1, 
            izuzece: -1, 
            vrstaPredmeta: -1, 
            brojOznaka: -1, 
            datumZakljucenja: -1, 
            nazivUgovorneStrane: -1, 
            ukupniIznos: -1, 
            ukupniIznosSaPdv: -1, 
            realizovano: -1, 
            valuta: -1, 
            status: -1 
        };

        let startniRed = -1;

        // Provera zaglavlja: OBAVEZNO mora imati i 'konto' i 'izvor' u ISTOM redu
        for (let i = 0; i < podaci.length; i++) {
            const red = podaci[i].map(c => 
                c ? cir2lat(c.toString()).replace(/[\r\n]+/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim() : ""
            );

            const imaKonto = red.some(c => c.includes('konto'));
            const imaIzvor = red.some(c => c.includes('izvor') || c.includes('fond'));

            if (imaKonto && imaIzvor) {
                kolone.izvor = red.findIndex(c => c.includes('izvor') || c.includes('fond'));
                kolone.konto = red.findIndex(c => c.includes('konto'));
                kolone.predmetNabavke = red.findIndex(c => c.includes('predmet') || c.includes('artikal'));
                kolone.izuzece = red.findIndex(c => c.includes('izuzeće') || c.includes('izuzece'));
                kolone.vrstaPredmeta = red.findIndex(c => c.includes('vrsta'));
                kolone.brojOznaka = red.findIndex(c => c.includes('broj') || c.includes('oznaka') || c.includes('cpv'));
                kolone.datumZakljucenja = red.findIndex(c => c.includes('datum'));
                kolone.nazivUgovorneStrane = red.findIndex(c => c.includes('naziv'));
                kolone.ukupniIznos = red.findIndex(c => c.includes('ukupni iznos') && !c.includes('pdv'));
                kolone.ukupniIznosSaPdv = red.findIndex(c => c.includes('sa pdv') || (c.includes('iznos') && c.includes('sa')));
                kolone.realizovano = red.findIndex(c => c.includes('realizovano') || c.includes('realizacija'));
                kolone.valuta = red.findIndex(c => c.includes('valuta'));
                kolone.status = red.findIndex(c => c.includes('status'));
                kolone.datumPlacanja = red.findIndex(c => c.includes('zavr'));
                startniRed = i + 1;
                break;
            }
        }

        // Ako ne postoji validno zaglavlje, odmah prekida rad
        if (startniRed === -1 || kolone.konto === -1 || kolone.izvor === -1) {
            return {
                success: false,
                message: 'E, ovo ti nisu narudžbenice! Nije pronađeno zaglavlje sa kolonama Konto i Izvor finansiranja.'
            };
        }

        const dajTekst = (row, idx) => {
            if (idx === -1 || row[idx] === undefined || row[idx] === null) return null;
            const val = row[idx].toString().trim();
            return val === "" ? null : cir2lat(val);
        };

        const parsujBroj = (row, idx) => {
            if (idx === -1 || row[idx] === undefined || row[idx] === null) return 0;
            let s = row[idx].toString().replace(/\./g, '').replace(',', '.').trim();
            let num = parseFloat(s);
            return isNaN(num) ? 0 : num;
        };

        let narudzbenice = [];

        for (let i = startniRed; i < podaci.length; i++) {
            const red = podaci[i];
            if (!red || red.length === 0) continue;

            const siroviIzvor = dajTekst(red, kolone.izvor);
            const ime_fonda = siroviIzvor ? siroviIzvor : 'nepoznato';
            const artikal = dajTekst(red, kolone.predmetNabavke);
            const brojOznaka = dajTekst(red, kolone.brojOznaka);

            if (!artikal && !brojOznaka && parsujBroj(red, kolone.ukupniIznosSaPdv) === 0) {
                continue;
            }

            const datumZakljucenja = red[kolone.datumZakljucenja] || null;
            const datumPlacanja = red[kolone.datumPlacanja] || null;
            
            let godina = null;
            if (datumZakljucenja) {
                if (typeof datumZakljucenja === 'number') {
                    godina = xlsx.SSF.parse_date_code(datumZakljucenja).y;
                } else {
                    const match = datumZakljucenja.toString().match(/\b(19|20)\d{2}\b/);
                    if (match) godina = parseInt(match[0], 10);
                }
            }


            // Mapiranje statusa (zakljucen -> za placanje, izvrsen -> placeno)
            const siroviStatus = dajTekst(red, kolone.status);
            let mapiraniStatus = siroviStatus;

            if (siroviStatus) {
                const statusLower = siroviStatus.toLowerCase();
                if (statusLower.includes('zakljucen') || statusLower.includes('zaključen')) {
                    mapiraniStatus = 'za placanje';
                } else if (statusLower.includes('izvrsen') || statusLower.includes('izvršen')) {
                    mapiraniStatus = 'placeno';
                }
            }

            narudzbenice.push({
                ime_fonda,
                konto: dajTekst(red, kolone.konto),
                artikal: artikal || "Bez naziva",
                izuzece: dajTekst(red, kolone.izuzece),
                vrsta_predmeta: dajTekst(red, kolone.vrstaPredmeta),
                broj_oznaka: brojOznaka,
                broj_ugovora: null,
                datum: datumZakljucenja,
                datum_zakljucenja: datumZakljucenja,
                godina: godina || null,
                dobavljac: dajTekst(red, kolone.nazivUgovorneStrane),
                vrednostBez: parsujBroj(red, kolone.ukupniIznos),
                vrednostSa: parsujBroj(red, kolone.ukupniIznosSaPdv),
                vrednost_ugovora_bez_pdv: null,
                vrednost_ugovora_sa_pdv: null,
                realizovano: parsujBroj(red, kolone.realizovano),
                valuta: dajTekst(red, kolone.valuta) || 'RSD',
                status: mapiraniStatus,
                nazivFajla: originalname,
                br_racuna: null,
                kolicina: 1,
                cenaBez: parsujBroj(red, kolone.ukupniIznos),
                cenaSa: parsujBroj(red, kolone.ukupniIznosSaPdv),
                datumPla: datumPlacanja,
                institut: null,
                broj_nabavke: null,
                partija: null
            });
        }

        if (narudzbenice.length === 0) {
            return {
                success: false,
                message: 'E, ovo ti nisu narudžbenice! Nije pronađena nijedna važeća stavka.'
            };
        }

        return {
            success: true,
            podaci: narudzbenice
        };

    } catch (e) {
        console.error(`[GREŠKA] NarudzbeniceService (${originalname}):`, e.message);
        return {
            success: false,
            message: 'Došlo je do greške prilikom čitanja Excel fajla.'
        };
    }
};

module.exports = {
    parsujNarudzbeniceExcel
};