const ExcelJS = require('exceljs');

// Pomoćna funkcija za pretvaranje ćirilice u latinicu
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

// Izvlačenje čiste vrednosti iz Excel ćelije
function dajVrednost(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return null;
    let val = cell.value;
    if (typeof val === 'object' && val.result !== undefined) val = val.result;
    if (typeof val === 'string') {
        val = val.trim();
        return val === "" ? null : val;
    }
    return val;
}

// Formatiranje numeričkih iznosa
function parsujBroj(val) {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === 'number') return val;
    let s = val.toString().replace(/\./g, '').replace(',', '.').trim();
    let num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

// Izmenjen početak funkcije u NarudzbeniceService.js
async function parsujNarudzbeniceExcel(fileBuffer) {
    const workbook = new ExcelJS.Workbook();
    // Čitanje direktno iz RAM memorije (iz buffer-a)
    await workbook.xlsx.load(fileBuffer);

    const worksheet = workbook.worksheets[0];
    const narudzbenice = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Preskače zaglavlje

        const predmetNabavke = cir2lat(dajVrednost(row.getCell(2)));       // Col B
        const izuzece = cir2lat(dajVrednost(row.getCell(3)));              // Col C
        const pravniOsnov = cir2lat(dajVrednost(row.getCell(4)));          // Col D
        const konto = dajVrednost(row.getCell(5));                         // Col E
        const vrstaPredmeta = cir2lat(dajVrednost(row.getCell(6)));       // Col F
        const brojOznaka = dajVrednost(row.getCell(7));                    // Col G
        const datumZakljucenja = dajVrednost(row.getCell(8));             // Col H
        const pibUgovorneStrane = dajVrednost(row.getCell(9));             // Col I
        const nazivUgovorneStrane = cir2lat(dajVrednost(row.getCell(10))); // Col J
        const ukupniIznos = parsujBroj(dajVrednost(row.getCell(11)));      // Col K
        const ukupniIznosSaPdv = parsujBroj(dajVrednost(row.getCell(12))); // Col L
        const realizovano = parsujBroj(dajVrednost(row.getCell(13)));     // Col M
        const valuta = cir2lat(dajVrednost(row.getCell(14)));             // Col N
        const status = cir2lat(dajVrednost(row.getCell(15)));             // Col O
        const objavljeno = dajVrednost(row.getCell(16));                  // Col P
        const zadnjaIzmena = dajVrednost(row.getCell(17));                // Col Q
        const zavrseno = dajVrednost(row.getCell(18));                    // Col R
        const stornirano = cir2lat(dajVrednost(row.getCell(19)));          // Col S

        if (predmetNabavke || brojOznaka) {
            narudzbenice.push({
                redBroj: rowNumber,
                predmetNabavke,
                izuzece,
                pravniOsnov,
                konto,
                vrstaPredmeta,
                brojOznaka,
                datumZakljucenja,
                pibUgovorneStrane,
                nazivUgovorneStrane,
                ukupniIznos,
                ukupniIznosSaPdv,
                realizovano,
                valuta,
                status,
                objavljeno,
                zadnjaIzmena,
                zavrseno,
                stornirano
            });
        }
    });

    return narudzbenice;
}

module.exports = {
    parsujNarudzbeniceExcel
};