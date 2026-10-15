/* =====================================================================
   script.js – zajednička skripta (početna stranica + ugovori)
   Novi izgled: toast poruke i modali zamenjuju alert / prompt / confirm.
   Na stranicama bez klase "app" na <body> (npr. ugovori) sve radi
   kao ranije: koriste se obični alert / prompt / confirm.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Pomoćne funkcije
   --------------------------------------------------------------------- */

// Formatiranje brojeva (npr. 2500000 -> 2.500.000,00)
function formatirajBroj(broj) {
    if (broj === null || broj === undefined || isNaN(broj)) return "0,00";
    return parseFloat(broj).toLocaleString('sr-RS', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Escape za tekst koji dolazi iz baze, pre ubacivanja u HTML
function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

const JE_APP = () => !!(document.body && document.body.classList.contains('app'));

function mnozinaFajlova(n) {
    const z = n % 10, d = n % 100;
    if (z === 1 && d !== 11) return 'fajl';
    if (z >= 2 && z <= 4 && (d < 12 || d > 14)) return 'fajla';
    return 'fajlova';
}

const _svg = d => '<svg class="ik" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const IKONE = {
    trash: _svg('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    chev: _svg('<path d="M9 18l6-6-6-6"/>'),
    pencil: _svg('<path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    uspeh: _svg('<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>'),
    greska: _svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
    upozorenje: _svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    info: _svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>')
};

/* ---------------------------------------------------------------------
   Tema (svetla / tamna)
   --------------------------------------------------------------------- */
function promeniTemu() {
    const html = document.documentElement;
    const nova = html.dataset.tema === 'tamna' ? 'svetla' : 'tamna';
    html.dataset.tema = nova;
    try { localStorage.setItem('tema', nova); } catch (e) { /* ignoriši */ }
}

/* ---------------------------------------------------------------------
   Toast poruke
   --------------------------------------------------------------------- */
function prikaziToast(tekst, tip = 'info', trajanje = 4500) {
    if (!JE_APP()) { alert(tekst); return; }

    let root = document.getElementById('toast-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'toast-root';
        document.body.appendChild(root);
    }

    const t = document.createElement('div');
    t.className = `toast toast-${tip}`;
    t.setAttribute('role', tip === 'greska' ? 'alert' : 'status');
    t.innerHTML = `<span class="toast-ikona">${IKONE[tip] || IKONE.info}</span>
                   <span class="toast-tekst">${esc(tekst)}</span>
                   <button type="button" class="toast-x" aria-label="Zatvori">×</button>`;
    const ukloni = () => t.remove();
    t.querySelector('.toast-x').addEventListener('click', ukloni);
    root.appendChild(t);
    if (trajanje > 0) setTimeout(ukloni, trajanje);
}

// Poruka koja treba da preživi osvežavanje stranice
function zapamtiToast(tekst, tip = 'uspeh') {
    try { sessionStorage.setItem('toastPoruka', JSON.stringify({ tekst, tip })); } catch (e) { /* ignoriši */ }
}

function prikaziSacuvaniToast() {
    try {
        const sirovo = sessionStorage.getItem('toastPoruka');
        if (!sirovo) return;
        sessionStorage.removeItem('toastPoruka');
        const { tekst, tip } = JSON.parse(sirovo);
        prikaziToast(tekst, tip);
    } catch (e) { /* ignoriši */ }
}

/* ---------------------------------------------------------------------
   Modali
   --------------------------------------------------------------------- */
function otvoriModal({ naslov, sirina = 460, naZatvaranje }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = sirina + 'px';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const glava = document.createElement('div');
    glava.className = 'modal-glava';
    const h = document.createElement('h3');
    h.textContent = naslov;
    glava.appendChild(h);

    const telo = document.createElement('div');
    telo.className = 'modal-telo';
    const podnozje = document.createElement('div');
    podnozje.className = 'modal-podnozje';

    modal.append(glava, telo, podnozje);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let zatvoren = false;
    const naEsc = e => { if (e.key === 'Escape') zatvori(undefined); };
    const zatvori = (rezultat) => {
        if (zatvoren) return;
        zatvoren = true;
        document.removeEventListener('keydown', naEsc);
        overlay.remove();
        if (naZatvaranje) naZatvaranje(rezultat);
    };
    document.addEventListener('keydown', naEsc);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) zatvori(undefined); });
    requestAnimationFrame(() => overlay.classList.add('vidljiv'));

    return { telo, podnozje, zatvori };
}

function napraviDugme(tekst, klasa, naKlik) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = klasa;
    b.textContent = tekst;
    b.addEventListener('click', naKlik);
    return b;
}

// Zamena za prompt(): vraća string ili null ako je korisnik odustao
function pitajVrednost(naslov, vrednost, opis = '') {
    if (!JE_APP()) return Promise.resolve(prompt(naslov, vrednost));

    return new Promise(resolve => {
        const m = otvoriModal({
            naslov,
            sirina: 420,
            naZatvaranje: rez => resolve(rez === undefined ? null : rez)
        });
        m.telo.innerHTML = (opis ? `<p class="modal-opis">${esc(opis)}</p>` : '') +
            `<input type="text" class="input" inputmode="decimal" value="${esc(vrednost)}">`;
        const input = m.telo.querySelector('input');
        m.podnozje.append(
            napraviDugme('Odustani', 'btn btn-ghost', () => m.zatvori(null)),
            napraviDugme('Sačuvaj', 'btn btn-primary', () => m.zatvori(input.value))
        );
        input.addEventListener('keydown', e => { if (e.key === 'Enter') m.zatvori(input.value); });
        input.focus();
        input.select();
    });
}

// Zamena za confirm(): vraća true / false
function potvrdi(naslov, tekst, { oznaka = 'Potvrdi', opasno = false } = {}) {
    if (!JE_APP()) return Promise.resolve(confirm(tekst));

    return new Promise(resolve => {
        const m = otvoriModal({
            naslov,
            sirina: 440,
            naZatvaranje: rez => resolve(rez === true)
        });
        m.telo.innerHTML = `<p class="modal-opis" style="margin:0">${esc(tekst)}</p>`;
        m.podnozje.append(
            napraviDugme('Odustani', 'btn btn-ghost', () => m.zatvori(false)),
            napraviDugme(oznaka, opasno ? 'btn btn-danger' : 'btn btn-primary', () => m.zatvori(true))
        );
    });
}

// Prikaz rezultata uvoza (uspeh + lista grešaka po stavkama)
function prikaziRezultatUvoza(rezultat) {
    const greske = rezultat.detaljiGresaka || [];

    if (!JE_APP()) {
        let poruka = (rezultat.message || "Greška pri uvozu.");
        if (!rezultat.success) {
            poruka += "\n\nDETALJI ZA ISPRAVKU:\n";
            if (greske.length) {
                greske.forEach((g, i) => {
                    poruka += `${i + 1}. [Fajl: ${g.fajl}]\n   Artikal: "${g.artikal}"\n   Greška: ${g.poruka}\n\n`;
                });
            } else {
                poruka += "Sistemska greška: " + (rezultat.error || "Nepoznato");
            }
        }
        alert(poruka);
        return Promise.resolve();
    }

    return new Promise(resolve => {
        const m = otvoriModal({
            naslov: greske.length || !rezultat.success ? 'Uvoz nije prošao bez grešaka' : 'Uvoz završen',
            sirina: 720,
            naZatvaranje: () => resolve()
        });
        let html = `<p class="modal-opis">${esc(rezultat.message || '')}</p>`;
        if (greske.length) {
            html += '<div class="greske-lista">' + greske.map((g, i) => `
                <div class="greska-stavka">
                    <div class="greska-naslov">${i + 1}. ${esc(g.artikal)}</div>
                    <div class="greska-meta">Fajl: ${esc(g.fajl)}</div>
                    <div class="greska-poruka">${esc(g.poruka)}</div>
                </div>`).join('') + '</div>';
        } else if (!rezultat.success && rezultat.error) {
            html += `<p class="greska-poruka">Sistemska greška: ${esc(rezultat.error)}</p>`;
        }
        m.telo.innerHTML = html;
        m.podnozje.append(napraviDugme('Zatvori', 'btn btn-primary', () => m.zatvori(true)));
    });
}

/* ---------------------------------------------------------------------
   Dijalozi (<dialog>), tabovi i dropzone
   --------------------------------------------------------------------- */
function otvoriDijalog(id) {
    const d = document.getElementById(id);
    if (d && !d.open) d.showModal();
}

function zatvoriDijalog(id) {
    const d = document.getElementById(id);
    if (d && d.open) d.close();
}

function uvozTab(ime) {
    document.querySelectorAll('[data-uvoz-tab]').forEach(b => b.classList.toggle('aktivan', b.dataset.uvozTab === ime));
    document.querySelectorAll('[data-uvoz-panel]').forEach(p => { p.hidden = p.dataset.uvozPanel !== ime; });
}

function inicijalizujDropzone() {
    document.querySelectorAll('.dropzone').forEach(zona => {
        const input = document.getElementById(zona.getAttribute('for'));
        const info = zona.querySelector('.dz-info');
        if (!input || !info) return;

        const poruka = info.textContent;
        const jeFolder = input.hasAttribute('webkitdirectory');

        const osvezi = () => {
            const lista = Array.from(input.files || []);
            if (lista.length === 0) { info.textContent = poruka; return; }
            if (lista.length === 1 && !jeFolder) { info.textContent = lista[0].name; return; }
            const excel = lista.filter(f => /\.xlsx?$/i.test(f.name)).length;
            info.textContent = jeFolder
                ? `Pronađeno ${excel} Excel ${mnozinaFajlova(excel)} u izabranom folderu`
                : `Izabrano: ${lista.length} ${mnozinaFajlova(lista.length)}`;
        };
        input.addEventListener('change', osvezi);

        if (jeFolder) return; // prevlačenje foldera nije pouzdano, koristi se klik

        zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('prevlaci'); });
        ['dragleave', 'dragend'].forEach(n => zona.addEventListener(n, () => zona.classList.remove('prevlaci')));
        zona.addEventListener('drop', e => {
            e.preventDefault();
            zona.classList.remove('prevlaci');
            let lista = e.dataTransfer.files;
            if (!lista || lista.length === 0) return;
            if (!input.multiple && lista.length > 1) {
                const dt = new DataTransfer();
                dt.items.add(lista[0]);
                lista = dt.files;
            }
            input.files = lista;
            input.dispatchEvent(new Event('change'));
        });
    });
}

function postaviUcitavanje(btn, tekst) {
    if (!btn) return () => {};
    const staro = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('ucitava');
    btn.innerHTML = `<span class="spinner"></span>${esc(tekst)}`;
    return () => {
        btn.disabled = false;
        btn.classList.remove('ucitava');
        btn.innerHTML = staro;
    };
}

/* ---------------------------------------------------------------------
   Uvoz Excel fajlova i narudžbenica
   --------------------------------------------------------------------- */
async function obradiRezultatUvoza(response, vrati) {
    const rezultat = await response.json();

    // Odgovor je stigao: ugasi spinner i zatvori prozor za uvoz, da rezultat ne ostane
    // iza njega (native <dialog> je uvek ispred običnih prozora) uz vrteće dugme.
    if (vrati) vrati();
    document.querySelectorAll('dialog.dlg[open]').forEach(d => d.close());
    const greske = rezultat.detaljiGresaka || [];

    if (rezultat.success && greske.length === 0) {
        zapamtiToast(rezultat.message || 'Uvoz je završen.', 'uspeh');
    } else {
        await prikaziRezultatUvoza(rezultat);
    }
    window.location.reload();
}

async function posaljiSaInputa(inputId, dugme) {
    const input = document.getElementById(inputId);
    const files = input.files;

    if (files.length === 0) return prikaziToast("Niste izabrali fajlove.", 'upozorenje');

    const vrati = postaviUcitavanje(dugme, "Skeniram...");

    const formData = new FormData();
    for (const file of files) {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            formData.append('excelFajlovi', file);
        }
    }

    try {
        const response = await fetch('/skeniraj', { method: 'POST', body: formData });
        await obradiRezultatUvoza(response, vrati);
    } catch (err) {
        console.error(err);
        prikaziToast("Greška pri komunikaciji sa serverom.", 'greska');
    } finally {
        vrati();
    }
}

async function posaljiNarudzbenicu(dugme) {
    const input = document.getElementById('narudzbenicaFileInput');
    if (!input.files || input.files.length === 0) {
        return prikaziToast('Molimo odaberite Excel fajl narudžbenice.', 'upozorenje');
    }

    const vrati = postaviUcitavanje(dugme, "Upisujem u bazu...");

    const formData = new FormData();
    formData.append('excelFajl', input.files[0]);

    try {
        const response = await fetch('/ucitaj-narudzbenice', { method: 'POST', body: formData });
        await obradiRezultatUvoza(response, vrati);
    } catch (err) {
        console.error('Greška pri slanju narudžbenice:', err);
        prikaziToast('Došlo je do mrežne greške prilikom slanja fajla.', 'greska');
    } finally {
        vrati();
    }
}

/* ---------------------------------------------------------------------
   Čuvanje pozicije skrola
   --------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
    const scrollPos = localStorage.getItem("scrollPosition");
    if (scrollPos) {
        window.scrollTo(0, parseInt(scrollPos));
        localStorage.removeItem("scrollPosition");
    }
});

window.addEventListener("beforeunload", () => {
    localStorage.setItem("scrollPosition", window.scrollY);
});

/* ---------------------------------------------------------------------
   Trake potrošnje
   --------------------------------------------------------------------- */
function trakaHtml(utroseno, planirano) {
    const plan = Number(planirano) || 0;
    const utr = Number(utroseno) || 0;
    if (plan > 0) {
        const pct = Math.round(utr / plan * 100);
        const nivo = pct >= 90 ? 'kriticno' : (pct >= 70 ? 'upozorenje' : 'ok');
        const sirina = Math.max(0, Math.min(100, pct));
        return `<div class="traka ${nivo}"><span style="width:${sirina}%"></span></div><span class="traka-oznaka">${pct}%</span>`;
    }
    return '';
}

function osveziRedFonda(id, podaci) {
    const postavi = (elId, tekst) => { const el = document.getElementById(elId); if (el) el.textContent = tekst; };
    postavi(`iznos-${id}`, formatirajBroj(podaci.sredstva));
    postavi(`utroseno-fond-${id}`, formatirajBroj(podaci.utrosena_sredstva));

    const dost = document.getElementById(`dostupno-fond-${id}`);
    if (dost) {
        dost.textContent = formatirajBroj(podaci.dostupna_sredstva);
        dost.className = Number(podaci.dostupna_sredstva) < 0 ? 'neg' : 'pos';
    }
    const traka = document.getElementById(`traka-fond-${id}`);
    if (traka) traka.innerHTML = trakaHtml(podaci.utrosena_sredstva, podaci.sredstva);

    const red = document.getElementById(`fond-red-${id}`);
    if (red) {
        red.dataset.sredstva = podaci.sredstva;
    }
}

/* ---------------------------------------------------------------------
   Traka konteksta: pri skrolu pokazuje čije stavke gledaš
   (Izvor finansiranja › Konto). Klik vraća na taj red.
   --------------------------------------------------------------------- */
let _kontekstZakazan = false;
let _kontekstCilj = null;

function zakaziKontekst() {
    if (_kontekstZakazan) return;
    _kontekstZakazan = true;
    requestAnimationFrame(() => { _kontekstZakazan = false; osveziKontekst(); });
}

function osveziKontekst() {
    const bar = document.getElementById('kontekst');
    const unutra = document.getElementById('kontekst-in');
    if (!bar || !unutra) return;

    if (document.querySelector('.tbl-ugovori')) { osveziKontekstUgovori(bar, unutra); return; }

    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 58;
    const linija = topbar + 46; // ispod same trake

    // Red je "iznad" ako je njegov naslovni red već izašao pod traku, a proširenje još traje
    const aktivan = (red, prosirenje) => {
        if (!red || !prosirenje || prosirenje.style.display !== 'table-row') return false;
        return red.getBoundingClientRect().bottom <= linija && prosirenje.getBoundingClientRect().bottom > linija + 40;
    };

    let fondRed = null, fondExp = null;
    document.querySelectorAll('tr.fond-glavni-red.otvoreno').forEach(r => {
        const exp = document.getElementById(`fond-expand-${r.dataset.id}`);
        if (aktivan(r, exp)) { fondRed = r; fondExp = exp; }
    });

    if (!fondRed) { bar.hidden = true; _kontekstCilj = null; return; }

    let kontoRed = null;
    fondExp.querySelectorAll('tr.konto-red-otvoren').forEach(r => {
        const exp = document.getElementById(r.id.replace('konto-glavni-', 'konto-expand-'));
        if (aktivan(r, exp)) kontoRed = r;
    });

    _kontekstCilj = kontoRed || fondRed;
    const kljuc = fondRed.dataset.id + '|' + (kontoRed ? kontoRed.id : '');
    if (unutra.dataset.kljuc !== kljuc) {
        unutra.dataset.kljuc = kljuc;
        unutra.innerHTML =
            `<span class="k-lab">Izvor</span><strong>${esc(fondRed.dataset.ime)}</strong>` +
            `<span class="godina-chip">${esc(fondRed.dataset.godina)}</span>` +
            (kontoRed ? `<span class="k-sep">›</span><span class="k-lab">Konto</span><strong>${esc(kontoRed.dataset.ime)}</strong>` : '') +
            `<span class="k-vr">↑ na red</span>`;
    }
    bar.hidden = false;
}

// Stranica Ugovori: traka "Ugovor ..." dok se gledaju njegove stavke
function osveziKontekstUgovori(bar, unutra) {
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 58;
    const linija = topbar + 46;
    let red = null;
    document.querySelectorAll('tr.ugovor-red.ugovor-red-otvoren').forEach(r => {
        const exp = document.getElementById(`ugovor-expand-${r.dataset.id}`);
        if (exp && exp.style.display === 'table-row' &&
            r.getBoundingClientRect().bottom <= linija && exp.getBoundingClientRect().bottom > linija + 40) red = r;
    });
    if (!red) { bar.hidden = true; _kontekstCilj = null; return; }

    _kontekstCilj = red;
    const kljuc = 'ug|' + red.dataset.id;
    if (unutra.dataset.kljuc !== kljuc) {
        unutra.dataset.kljuc = kljuc;
        unutra.innerHTML =
            `<span class="k-lab">Ugovor</span><strong>${esc(red.dataset.broj)}</strong>` +
            `<span class="k-vr">↑ na red</span>`;
    }
    bar.hidden = false;
}

function inicijalizujKontekst() {
    const unutra = document.getElementById('kontekst-in');
    if (!unutra) return;
    const idi = () => {
        if (!_kontekstCilj) return;
        const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 58;
        const y = _kontekstCilj.getBoundingClientRect().top + window.scrollY - (topbar + 54);
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    };
    unutra.addEventListener('click', idi);
    unutra.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); idi(); } });
    window.addEventListener('scroll', zakaziKontekst, { passive: true });
    window.addEventListener('resize', zakaziKontekst);
}

/* ---------------------------------------------------------------------
   Izvori finansiranja (fond)
   --------------------------------------------------------------------- */
async function izmeniSredstva(id, ime, trenutnaVrednost) {
    const red = document.getElementById(`fond-red-${id}`);
    if (red) {
        if (ime === undefined) ime = red.dataset.ime;
        if (trenutnaVrednost === undefined) trenutnaVrednost = red.dataset.sredstva;
    }

    const noviIznos = await pitajVrednost(`Novi iznos za izvor „${ime}“`, trenutnaVrednost, 'Planirana sredstva (RSD)');
    if (noviIznos === null || noviIznos === "") return;

    try {
        const res = await fetch('/azuriraj-sredstva', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, sredstva: noviIznos })
        });
        const data = await res.json();

        if (data.success) {
            osveziRedFonda(id, data.podaci);
            prikaziToast("Uspešno ažurirano!", 'uspeh');
        } else {
            prikaziToast("Greška: " + data.message, 'greska');
        }
    } catch (e) {
        console.error(e);
        prikaziToast("Greška pri komunikaciji sa serverom.", 'greska');
    }
}

async function obrisiFond(fondId) {
    const ok = await potvrdi(
        'Brisanje izvora finansiranja',
        'Da li ste sigurni da želite da obrišete ovaj fond? Ova operacija je trajna.',
        { oznaka: 'Obriši', opasno: true }
    );
    if (!ok) return;

    fetch('/obrisi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fondId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            zapamtiToast(data.message, 'uspeh');
            location.reload();
        } else {
            prikaziToast(data.message, 'greska', 7000);
        }
    })
    .catch(err => {
        console.error("Greška:", err);
        prikaziToast("Greška pri komunikaciji sa serverom.", 'greska');
    });
}

/* ---------------------------------------------------------------------
   Konta unutar izvora
   --------------------------------------------------------------------- */
async function prikaziKonta(fondId) {
    const row = document.getElementById(`fond-expand-${fondId}`);
    const container = document.getElementById(`lista-konta-${fondId}`);
    const glavniRed = document.getElementById(`fond-red-${fondId}`);

    if (row.style.display === 'table-row') {
        row.style.display = 'none';
        if (glavniRed) glavniRed.classList.remove('otvoreno');
        zakaziKontekst();
        return;
    }

    row.style.display = 'table-row';
    if (glavniRed) glavniRed.classList.add('otvoreno');
    container.innerHTML = '<div class="ucitavanje"><span class="spinner"></span>Učitavanje konta…</div>';

    try {
        const response = await fetch(`/api/fond/${fondId}/kontovi`);
        const kontovi = await response.json();

        const fGodina = glavniRed ? glavniRed.dataset.godina : '';
        const fIme = glavniRed ? glavniRed.dataset.ime : '';

        let html = `
            <div class="novi-konto">
                <strong>Novi konto za ${esc(fIme)} (${esc(fGodina)}):</strong>
                <input type="text" class="input input-sm" id="novo-ime-konta-${fondId}" placeholder="npr. 421111">
                <input type="number" class="input input-sm" id="nova-sredstva-konta-${fondId}" placeholder="Sredstva" value="0">
                <button type="button" class="btn btn-primary btn-sm"
                        data-ime="${esc(fIme)}" data-godina="${esc(fGodina)}"
                        onclick="rucnoDodajKonto('${fondId}', this.dataset.ime, this.dataset.godina)">+ Kreiraj</button>
            </div>
            <div class="tbl-konta">
            <table class="tbl">
                <thead>
                    <tr class="konto-header-red">
                        <th>Konto</th>
                        <th class="num">Planirano (klikni za izmenu)</th>
                        <th class="num">Za plaćanje</th>
                        <th class="num">Plaćeno</th>
                        <th class="num">Utrošeno (ukupno)</th>
                        <th class="num">Dostupno</th>
                        <th class="akcija"><span class="sr-only">Obriši</span></th>
                    </tr>
                </thead>
                <tbody>`;

        if (kontovi.length === 0) {
            html += `<tr><td colspan="7" class="prazno">Nema konta. Unesite prvi iznad.</td></tr>`;
        } else {
            kontovi.forEach(k => {
                html += `
                    <tr id="konto-glavni-${k.id}" class="konto-red"
                        data-ime="${esc(k.ime_konta)}" data-sredstva="${esc(k.sredstva)}" data-utroseno="${esc(k.utrosena_sredstva)}"
                        onclick="prikaziStavkeKonta('${k.id}')">
                        <td><span class="chev">${IKONE.chev}</span><strong>${esc(k.ime_konta)}</strong></td>

                        <td class="num sredstva-celija" title="Klik za izmenu planiranog iznosa"
                            onclick="event.stopPropagation(); izmeniSredstvaKonta('${k.id}')">
                            <span id="sredstva-konta-${k.id}">${formatirajBroj(k.sredstva)}</span><span class="olovka">${IKONE.pencil}</span>
                        </td>

                        <td class="num tekst-warn" id="za-placanje-konta-${k.id}">${formatirajBroj(k.za_placanje || 0)}</td>
                        <td class="num tekst-ok" id="placeno-konta-${k.id}">${formatirajBroj(k.placeno || 0)}</td>
                        <td class="num">
                            <span class="v-utroseno" id="utroseno-konta-${k.id}">${formatirajBroj(k.utrosena_sredstva)}</span>
                            <div class="traka-omot" id="traka-konta-${k.id}">${trakaHtml(k.utrosena_sredstva, k.sredstva)}</div>
                        </td>
                        <td class="num">
                            <span id="dostupno-konta-${k.id}" class="${k.dostupna_sredstva < 0 ? 'neg' : 'pos'}">${formatirajBroj(k.dostupna_sredstva)}</span>
                        </td>

                        <td class="akcija" onclick="event.stopPropagation();">
                            <button type="button" onclick="obrisiKonto(${k.id})" class="icon-btn btn-obrisi" title="Obriši konto">${IKONE.trash}</button>
                        </td>
                    </tr>
                    <tr id="konto-expand-${k.id}" class="konto-expand-red" style="display: none;">
                        <td colspan="7"><div id="kontejner-stavki-${k.id}" class="stavke-kontejner"></div></td>
                    </tr>`;
            });
        }
        container.innerHTML = html + `</tbody></table></div>`;
        zakaziKontekst();
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="greska-tekst">Greška pri učitavanju konta.</div>';
    }
}

async function rucnoDodajKonto(fondId, fondIme, fondGodina) {
    const imeKonta = document.getElementById(`novo-ime-konta-${fondId}`).value;
    const sredstva = document.getElementById(`nova-sredstva-konta-${fondId}`).value;

    if (!imeKonta) return prikaziToast("Unesite broj konta!", 'upozorenje');

    try {
        const response = await fetch('/dodaj-konto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Ključevi (levo) moraju biti kao u bazi
            body: JSON.stringify({
                fond_ime: fondIme,
                fond_godina: fondGodina,
                ime_konta: imeKonta,
                sredstva: sredstva
            })
        });

        const data = await response.json();
        if (data.success) {
            zapamtiToast(data.message || 'Konto je kreiran.', 'uspeh');
            window.location.reload();
        } else {
            prikaziToast("Greška: " + data.message, 'greska');
        }
    } catch (e) {
        console.error(e);
        prikaziToast("Greška na mreži.", 'greska');
    }
}

async function izmeniSredstvaKonta(id, imeKonta, trenutnaVrednost) {
    const red = document.getElementById(`konto-glavni-${id}`);
    if (red) {
        if (imeKonta === undefined) imeKonta = red.dataset.ime;
        if (trenutnaVrednost === undefined) trenutnaVrednost = red.dataset.sredstva;
    }

    const noviIznos = await pitajVrednost(`Novi iznos za konto „${imeKonta}“`, trenutnaVrednost, 'Planirana sredstva (RSD)');
    if (noviIznos === null || noviIznos === "") return;

    try {
        const res = await fetch('/azuriraj-sredstva-konta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, sredstva: noviIznos })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || "Server nije potvrdio izmenu.");
        }

        const celijaSredstva = document.getElementById(`sredstva-konta-${id}`);
        if (celijaSredstva) celijaSredstva.innerText = formatirajBroj(noviIznos);

        const utroseno = red ? (parseFloat(red.dataset.utroseno) || 0) : 0;
        const novoDostupno = parseFloat(noviIznos) - utroseno;

        const dostupnoEl = document.getElementById(`dostupno-konta-${id}`);
        if (dostupnoEl) {
            dostupnoEl.textContent = formatirajBroj(novoDostupno);
            dostupnoEl.className = novoDostupno < 0 ? 'neg' : 'pos';
        }
        const traka = document.getElementById(`traka-konta-${id}`);
        if (traka) traka.innerHTML = trakaHtml(utroseno, noviIznos);
        if (red) red.dataset.sredstva = noviIznos;

        prikaziToast("Uspešno ažurirano!", 'uspeh');
    } catch (err) {
        console.error("Detalji:", err);
        prikaziToast("GREŠKA: " + err.message, 'greska');
    }
}

async function obrisiKonto(kontoId) {
    const ok = await potvrdi(
        'Brisanje konta',
        'Da li ste sigurni da želite da obrišete ovaj konto? Ova operacija je trajna.',
        { oznaka: 'Obriši', opasno: true }
    );
    if (!ok) return;

    try {
        const response = await fetch('/obrisi-konto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: kontoId })
        });

        const data = await response.json();

        if (data.success) {
            zapamtiToast(data.message, 'uspeh');
            window.location.reload();
        } else {
            prikaziToast(data.message, 'greska', 7000);
        }
    } catch (err) {
        console.error("Greška pri brisanju konta:", err);
        prikaziToast("Došlo je do greške pri komunikaciji sa serverom.", 'greska');
    }
}

/* ---------------------------------------------------------------------
   Stavke unutar konta
   --------------------------------------------------------------------- */
function filtrirajTabeluStavki(kontoId) {
    const input = document.getElementById(`filter-stavki-${kontoId}`);
    // Razbijamo unos na pojedinačne reči i čistimo prazne razmake
    const filterReci = input.value.toLowerCase().split(' ').filter(rec => rec.length > 0);

    const tabela = document.getElementById(`tabela-stavki-${kontoId}`);
    const redovi = tabela.getElementsByClassName('stavka-red');
    const brojac = document.getElementById(`count-${kontoId}`);

    let vidljivoStavki = 0;

    for (let i = 0; i < redovi.length; i++) {
        const tekstReda = redovi[i].textContent.toLowerCase();

        // Red mora da sadrži SVAKU reč koju smo ukucali (AND logika)
        const podudaraSe = filterReci.every(rec => tekstReda.includes(rec));

        if (podudaraSe) {
            redovi[i].style.display = "";
            vidljivoStavki++;
        } else {
            redovi[i].style.display = "none";
        }
    }

    if (brojac) brojac.innerText = vidljivoStavki;
}

// Datum iz baze (ISO) -> dd.mm.yyyy.
function formatirajDatumPrikaz(input) {
    if (!input || input === '-') return '-';
    if (typeof input === 'string') {
        const datumDeo = input.split('T')[0];
        const delovi = datumDeo.split('-');
        if (delovi.length === 3) {
            if (input.includes('T22:') || input.includes('T23:')) {
                const d = new Date(input);
                d.setHours(d.getHours() + 5);
                return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
            }
            return `${delovi[2]}.${delovi[1]}.${delovi[0]}.`;
        }
    }
    return '-';
}

async function prikaziStavkeKonta(kontoId) {
    const row = document.getElementById(`konto-expand-${kontoId}`);
    const glavniRedKonta = document.getElementById(`konto-glavni-${kontoId}`);
    const container = document.getElementById(`kontejner-stavki-${kontoId}`);

    if (row.style.display === 'table-row') {
        row.style.display = 'none';
        glavniRedKonta.classList.remove('konto-red-otvoren');
        zakaziKontekst();
        return;
    }

    row.style.display = 'table-row';
    glavniRedKonta.classList.add('konto-red-otvoren');
    container.innerHTML = '<div class="ucitavanje"><span class="spinner"></span>Učitavanje stavki…</div>';

    try {
        const response = await fetch(`/api/konto/${kontoId}/stavke`);
        const stavke = await response.json();

        const f = (br) => {
            if (br === undefined || br === null) return '0,00';
            return Number(br).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        let html = `
            <div class="stavke-alat">
                <input type="text" class="input input-sm"
                       id="filter-stavki-${kontoId}"
                       placeholder="Pretraži stavke (dobavljač, račun, artikal...)"
                       onkeyup="filtrirajTabeluStavki(${kontoId})">
                <span class="stavke-brojac">Prikazano: <strong id="count-${kontoId}">${stavke.length}</strong> stavki</span>
            </div>
            <div class="stavke-omot">
            <table id="tabela-stavki-${kontoId}" class="tbl tbl-stavke">
                <thead>
                    <tr class="stavke-header">
                        <th class="col-datum">Datum nabavke</th>
                        <th class="col-racun">Br. računa</th>
                        <th class="col-dobavljac">Dobavljač</th>
                        <th class="col-nabavka">Broj nabavke</th>
                        <th class="col-partija">Partija</th>
                        <th class="col-ugovor">Broj ugovora</th>
                        <th class="col-datum-ug">Datum ugovora</th>
                        <th class="col-artikal">Naziv artikla</th>
                        <th class="col-kolicina num">Količina</th>
                        <th class="col-cena-bez num">Cena bez PDV</th>
                        <th class="col-cena-sa num">Cena sa PDV</th>
                        <th class="col-vred-bez num">Vrednost bez PDV</th>
                        <th class="col-vred-sa num">Vrednost sa PDV</th>
                        <th class="col-status">Status plaćanja</th>
                        <th class="col-datum-pl">Datum plaćanja</th>
                        <th class="col-institut">Institut</th>
                        <th class="col-izuzece">Izuzeće</th>
                        <th class="col-vrsta-pred">Vrsta predmeta</th>
                        <th class="col-realizovano num">Realizovano</th>
                        <th class="col-valuta">Valuta</th>
                        <th class="col-fajl">Excel fajl</th>
                    </tr>
                </thead>
                <tbody>`;

        if (stavke.length === 0) {
            html += `<tr><td colspan="21" class="prazno">Nema pronađenih stavki za ovaj konto.</td></tr>`;
        } else {
            stavke.forEach(s => {
                const dNabavke = formatirajDatumPrikaz(s.datum_nabavke);
                const dPlacanja = formatirajDatumPrikaz(s.datum_placanja);
                const dUgovora = formatirajDatumPrikaz(s.datum_zakljucenja);

                // Plaćeno, a nema datuma plaćanja -> istaknuta (žuta) ćelija
                const nedostajeDatum = (s.status_placanja || '').toLowerCase() === 'placeno' && (!s.datum_placanja || s.datum_placanja === '-');

                const statusKlasa = (s.status_placanja || 'za placanje')
                    .toLowerCase()
                    .replace('ć', 'c')
                    .replace('č', 'c')
                    .replace(' ', '-');

                html += `
                    <tr class="stavka-red">
                        <td class="col-datum">${dNabavke}</td>
                        <td class="col-racun">${esc(s.br_racuna || '-')}</td>
                        <td class="col-dobavljac">${esc(s.dobavljac || '-')}</td>
                        <td class="col-nabavka">${esc(s.broj_nabavke || s.brojNabavke || '-')}</td>
                        <td class="col-partija">${esc(s.partija || '-')}</td>
                        <td class="col-ugovor">${esc(s.broj_ugovora || s.brojUgovora || '-')}</td>
                        <td class="col-datum-ug">${dUgovora}</td>
                        <td class="col-artikal">${esc(s.naziv_artikla)}</td>
                        <td class="col-kolicina num">${esc(s.kolicina || 0)}</td>
                        <td class="col-cena-bez num">${f(s.cena_bez_pdv || s.cenaBez)}</td>
                        <td class="col-cena-sa num">${f(s.cena_sa_pdv || s.cenaSa)}</td>
                        <td class="col-vred-bez num">${f(s.vred_bez_pdv || s.vrednostBez)}</td>
                        <td class="col-vred-sa num">${f(s.vred_sa_pdv || s.vrednostSa)}</td>

                        <td class="col-status" title="Dvoklik menja status"
                            ondblclick="promeniStatusKlikom(this, ${s.id}, '${s.status_placanja || 'za placanje'}', ${s.ugovor_id})">
                            <span class="badge-${statusKlasa}">${esc(s.status_placanja || '-')}</span>
                        </td>

                        <td class="col-datum-pl${nedostajeDatum ? ' nedostaje-datum' : ''}" title="Klik menja datum plaćanja"
                            onclick="omoguciIzmenuDatumaPlacanja(this, ${s.id}, '${s.status_placanja || 'za placanje'}', '${s.datum_placanja || '-'}')">
                            ${dPlacanja}
                        </td>

                        <td class="col-institut">${esc(s.institut || '-')}</td>
                        <td class="col-izuzece">${esc(s.izuzece || '-')}</td>
                        <td class="col-vrsta-pred">${esc(s.vrsta_predmeta || '-')}</td>
                        <td class="col-realizovano num">${f(s.realizovano) || '-'}</td>
                        <td class="col-valuta">${esc(s.valuta || '-')}</td>
                        <td class="col-fajl">${esc(s.ime_fajla || s.nazivFajla || '-')}</td>
                    </tr>`;
            });
        }

        container.innerHTML = html + `</tbody></table></div>`;

        if (typeof primeniPrikazKolona === "function") {
            primeniPrikazKolona();
        }
        zakaziKontekst();

    } catch (e) {
        console.error("Greška pri učitavanju stavki:", e);
        container.innerHTML = `<div class="greska-tekst">Greška prilikom učitavanja podataka.</div>`;
    }
}

/* ---------------------------------------------------------------------
   Podešavanje prikaza kolona (čuva se u localStorage)
   --------------------------------------------------------------------- */
function primeniPrikazKolona() {
    const podesavanja = {};

    document.querySelectorAll('.col-toggle').forEach(checkbox => {
        const klasaKolone = checkbox.value; // npr. "col-partija"
        const isCekiran = checkbox.checked;

        document.querySelectorAll(`.${klasaKolone}`).forEach(celija => {
            celija.style.display = isCekiran ? '' : 'none';
        });

        podesavanja[klasaKolone] = isCekiran;
    });

    localStorage.setItem('prikazKolonaStanje', JSON.stringify(podesavanja));
}

// Brzi izbor: sve kolone ili samo osnovne
function kolonePodesi(mod) {
    const osnovne = ['col-datum', 'col-racun', 'col-artikal', 'col-vred-sa', 'col-status', 'col-datum-pl', 'col-dobavljac', 'col-ugovor'];
    document.querySelectorAll('.col-toggle').forEach(cb => {
        cb.checked = mod === 'sve' ? true : osnovne.includes(cb.value);
    });
    primeniPrikazKolona();
}

// Promena bilo kog checkboxa u podešavanju kolona
document.querySelectorAll('.col-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', primeniPrikazKolona);
});

function ucitajPodesavanjaKolona() {
    const sacuvano = localStorage.getItem('prikazKolonaStanje');
    if (!sacuvano) return; // Prvi put na sajtu, ne radi ništa

    const podesavanja = JSON.parse(sacuvano);

    document.querySelectorAll('.col-toggle').forEach(checkbox => {
        const klasaKolone = checkbox.value;
        if (podesavanja.hasOwnProperty(klasaKolone)) {
            checkbox.checked = podesavanja[klasaKolone];
        }
    });

    izvrsiSakrivanjeBezCuvanja();
}

// Samo sakriva/prikazuje, bez pisanja u localStorage
function izvrsiSakrivanjeBezCuvanja() {
    document.querySelectorAll('.col-toggle').forEach(checkbox => {
        const klasaKolone = checkbox.value;
        const isCekiran = checkbox.checked;
        document.querySelectorAll(`.${klasaKolone}`).forEach(celija => {
            celija.style.display = isCekiran ? '' : 'none';
        });
    });
}

/* ---------------------------------------------------------------------
   Trenutno osvežavanje suma posle promene statusa / datuma plaćanja
   (bez osvežavanja cele stranice)
   --------------------------------------------------------------------- */
function osveziRedKonta(k) {
    const red = document.getElementById(`konto-glavni-${k.id}`);
    if (!red) return;
    const tekst = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = formatirajBroj(v); };

    tekst(`sredstva-konta-${k.id}`, k.sredstva);
    tekst(`za-placanje-konta-${k.id}`, k.za_placanje || 0);
    tekst(`placeno-konta-${k.id}`, k.placeno || 0);
    tekst(`utroseno-konta-${k.id}`, k.utrosena_sredstva);

    const dost = document.getElementById(`dostupno-konta-${k.id}`);
    if (dost) {
        dost.textContent = formatirajBroj(k.dostupna_sredstva);
        dost.className = Number(k.dostupna_sredstva) < 0 ? 'neg' : 'pos';
    }
    const traka = document.getElementById(`traka-konta-${k.id}`);
    if (traka) traka.innerHTML = trakaHtml(k.utrosena_sredstva, k.sredstva);

    red.dataset.sredstva = k.sredstva;
    red.dataset.utroseno = k.utrosena_sredstva;
}

async function osveziFondSume(red) {
    const id = red.dataset.id;
    const res = await fetch(`/api/fond/${id}/kontovi`);
    const kontovi = await res.json();
    if (!Array.isArray(kontovi)) return;

    const prosirenje = document.getElementById(`fond-expand-${id}`);
    const lista = document.getElementById(`lista-konta-${id}`);
    if (prosirenje && lista && prosirenje.style.display === 'table-row') {
        const prikazano = lista.querySelectorAll('tr.konto-red').length;
        const nedostaje = kontovi.some(k => !document.getElementById(`konto-glavni-${k.id}`));
        if (nedostaje || prikazano !== kontovi.length) {
            // Skup konta se promenio (stavka je prešla na drugi konto) -> ponovo iscrtaj listu
            prosirenje.style.display = 'none';
            await prikaziKonta(id);
        } else {
            kontovi.forEach(osveziRedKonta);
        }
    }

    // "Utrošeno (suma konta)" i "Dostupno" izvora
    const utroseno = kontovi.reduce((z, k) => z + (Number(k.utrosena_sredstva) || 0), 0);
    const planirano = Number(red.dataset.sredstva) || 0;
    osveziRedFonda(id, { sredstva: planirano, utrosena_sredstva: utroseno, dostupna_sredstva: planirano - utroseno });
}

// Osvežava izvor u kome je stavka, ali i izvore istog naziva (druge godine),
// jer promena datuma plaćanja može da premesti stavku u drugu godinu.
async function osveziSumeNakonPromene(prosirenjeRed) {
    if (!prosirenjeRed) return; // nije početna stranica
    try {
        const glavni = document.getElementById(prosirenjeRed.id.replace('fond-expand-', 'fond-red-'));
        if (!glavni) return;
        const ime = glavni.dataset.ime;
        const redovi = Array.from(document.querySelectorAll('tr.fond-glavni-red')).filter(r => r.dataset.ime === ime);
        await Promise.all(redovi.map(osveziFondSume));
    } catch (e) {
        console.error('Greška pri osvežavanju suma:', e);
    }
}

// Ako je stavka prešla na konto druge godine, više ne pripada ovoj listi
function ukloniAkoPremestena(redStavke, tabela, data) {
    if (!redStavke || !tabela || tabela.id.includes('ugovora') || !data.kontoId) return false;
    const trenutni = tabela.id.replace('tabela-stavki-', '');
    if (String(data.kontoId) === trenutni) return false;

    redStavke.remove();
    const brojac = document.getElementById(`count-${trenutni}`);
    if (brojac) brojac.innerText = tabela.querySelectorAll('tr.stavka-red').length;
    prikaziToast('Stavka je zbog datuma premeštena na konto druge godine.', 'upozorenje', 6000);
    return true;
}

/* ---------------------------------------------------------------------
   Ugovori / status i datum plaćanja stavki (koristi i stranica ugovori)
   --------------------------------------------------------------------- */
async function izmeniPoljeUgovora(id, polje, trenutnaVrednost) {
    const nazivPoljaPoruka = polje === 'vrednost_sa_pdv' ? 'sa PDV-om' : 'bez PDV-a';

    const novaVrednost = await pitajVrednost(`Nova vrednost ugovora ${nazivPoljaPoruka}`, trenutnaVrednost, 'Iznos (RSD)');
    if (novaVrednost === null || String(novaVrednost).trim() === "") return;

    // Ključ je naziv polja ('vrednost_bez_pdv' ili 'vrednost_sa_pdv')
    const podaciZaSlanje = {
        id: id,
        [polje]: parseFloat(String(novaVrednost).replace(',', '.')) || 0
    };

    try {
        const response = await fetch('/azuriraj-ugovor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(podaciZaSlanje)
        });

        const data = await response.json();
        if (data.success) {
            zapamtiToast('Vrednost ugovora je sačuvana.', 'uspeh');
            window.location.reload();
        } else {
            prikaziToast("Greška: " + data.message, 'greska');
        }
    } catch (error) {
        prikaziToast("Došlo je do greške na serveru.", 'greska');
    }
}

// Odmah osvežava red ugovora (značka, traka, preostalo) nakon promene statusa stavke
function osveziRedUgovora(ugovorId, utrosenoSa, utrosenoBez) {
    const red = document.getElementById(`ugovor-glavni-${ugovorId}`);
    if (!red) return;
    const vSa = Number(red.dataset.vSa) || 0;
    const vBez = Number(red.dataset.vBez) || 0;
    const uSa = Number(utrosenoSa) || 0;
    const uBez = utrosenoBez === undefined ? null : Number(utrosenoBez);

    const postavi = (elId, tekst, klasa) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = tekst;
        if (klasa) el.className = klasa;
    };
    postavi(`utroseno-sa-${ugovorId}`, formatirajBroj(uSa));
    postavi(`preostalo-sa-${ugovorId}`, formatirajBroj(vSa - uSa), (vSa - uSa) < 0 ? 'neg' : 'pos');
    if (uBez !== null) {
        postavi(`utroseno-bez-${ugovorId}`, formatirajBroj(uBez));
        postavi(`preostalo-bez-${ugovorId}`, formatirajBroj(vBez - uBez), (vBez - uBez) < 0 ? 'neg' : 'pos');
    }

    const traka = document.getElementById(`traka-ugovor-${ugovorId}`);
    if (traka) traka.innerHTML = vSa > 0 ? trakaHtml(uSa, vSa) : '';

    // Isto pravilo kao pri učitavanju: preko 70%, ili vrednost 0 a troši se -> crven red
    let alarm = null;
    if (vSa > 0) {
        if (uSa / vSa > 0.7) alarm = 'Upozorenje: Potrošeno je preko 70% ugovora!';
    } else if (vSa === 0 && uSa > 0) {
        alarm = 'Kritično: Ugovorena vrednost je 0,00, a sredstva se troše!';
    }
    red.classList.toggle('ugovor-kriticno', !!alarm);
    if (alarm) red.title = alarm; else red.removeAttribute('title');
}

// Žuta oznaka za "plaćeno, a bez datuma" (radi i na novoj i na staroj stranici)
function oznaciNedostajuciDatum(td, nedostaje) {
    td.classList.toggle('nedostaje-datum', nedostaje);
    if (JE_APP()) {
        td.style.backgroundColor = '';
    } else {
        td.style.backgroundColor = nedostaje ? '#fff3cd' : 'transparent';
    }
}

async function promeniStatusKlikom(tdElement, stavkaId, trenutniStatus, ugovorId) {
    const prosirenjeRed = tdElement.closest('tr.fond-expand-red');
    const tabelaStavki = tdElement.closest('table[id^="tabela-stavki-"]');
    const redStavke = tdElement.closest('tr');
    const statusi = ['za placanje', 'placeno', 'stornirano'];
    const trenutniIndex = statusi.indexOf(trenutniStatus);
    const noviStatus = statusi[(trenutniIndex + 1) % statusi.length];

    try {
        const response = await fetch('/azuriraj-status-stavke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: stavkaId, status_placanja: noviStatus })
        });

        const data = await response.json();

        if (data.success) {
            // 1. Ažuriraj badge u samoj ćeliji statusa
            const statusKlasa = noviStatus.toLowerCase().replace(' ', '-');
            tdElement.innerHTML = `<span class="badge-${statusKlasa}">${noviStatus}</span>`;

            // Ažuriraj ondblclick same ćelije za status
            tdElement.setAttribute('ondblclick', `promeniStatusKlikom(this, ${stavkaId}, '${noviStatus}', ${ugovorId})`);

            // 2. Ažuriraj onclick atribut ćelije za datum (da bi prepoznala novi status)
            const red = tdElement.closest('tr');
            const datumCelija = red.querySelector('.col-datum-pl');

            if (datumCelija) {
                const stariOnclick = datumCelija.getAttribute('onclick');
                if (stariOnclick) {
                    const noviOnclick = stariOnclick.replace(
                        /omoguciIzmenuDatumaPlacanja\(this, \d+, '[^']+'/,
                        `omoguciIzmenuDatumaPlacanja(this, ${stavkaId}, '${noviStatus}'`
                    );
                    datumCelija.setAttribute('onclick', noviOnclick);
                }

                // Ako status više nije 'placeno', resetuj vizuelno datum
                if (noviStatus !== 'placeno') {
                    datumCelija.innerHTML = '-';
                    oznaciNedostajuciDatum(datumCelija, false);
                }
            }

            // 3. Ažuriraj ukupnu potrošnju u glavnoj tabeli ugovora (gornji red)
            if (data.novaPotrosnjaUgovora !== undefined) {
                const elBez = document.getElementById(`utroseno-bez-${ugovorId}`);
                const elSa = document.getElementById(`utroseno-sa-${ugovorId}`);

                if (elSa) {
                    elSa.innerText = parseFloat(data.novaPotrosnjaUgovora).toLocaleString('sr-RS', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2
                    });
                }
                if (elBez && data.novaPotrosnjaBezPdva !== undefined) {
                    elBez.innerText = parseFloat(data.novaPotrosnjaBezPdva).toLocaleString('sr-RS', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2
                    });
                }
                osveziRedUgovora(ugovorId, data.novaPotrosnjaUgovora, data.novaPotrosnjaBezPdva);
            }

            // 4. Odmah osveži sume konta i izvora (bez osvežavanja stranice)
            ukloniAkoPremestena(redStavke, tabelaStavki, data);
            osveziSumeNakonPromene(prosirenjeRed);
        } else {
            prikaziToast("Greška: " + data.message, 'greska');
        }
    } catch (e) {
        console.error(e);
        prikaziToast("Došlo je do greške pri ažuriranju.", 'greska');
    }
}

// Klik na datum plaćanja (dozvoljeno samo ako je status 'placeno')
function omoguciIzmenuDatumaPlacanja(tdElement, stavkaId, trenutniStatus, trenutniDatum) {
    const status = trenutniStatus ? trenutniStatus.toString().trim().toLowerCase() : "";

    if (status !== 'placeno' && status !== 'plaćeno') {
        prikaziToast("Datum plaćanja možete uneti samo ako je status postavljen na 'placeno'.", 'upozorenje');
        return;
    }

    // Da li input već postoji
    if (tdElement.querySelector('input')) return;

    const originalniHtml = tdElement.innerHTML;

    // Pretvaranje u yyyy-mm-dd za HTML input (prihvata ISO iz baze i dd.mm.yyyy.)
    let prikaz = '-';
    if (trenutniDatum && trenutniDatum !== '-') {
        prikaz = /^\d{1,2}\.\d{1,2}\.\d{4}\.?$/.test(trenutniDatum) ? trenutniDatum : formatirajDatumPrikaz(trenutniDatum);
    }
    let formatiranZaInput = "";
    const delovi = prikaz.split('.');
    if (delovi.length >= 3 && delovi[2]) {
        formatiranZaInput = `${delovi[2]}-${delovi[1].padStart(2, '0')}-${delovi[0].padStart(2, '0')}`;
    }

    const input = document.createElement('input');
    input.type = 'date';
    input.value = formatiranZaInput;
    input.className = 'input input-sm';
    input.style.cssText = 'padding: 4px; font-family: inherit; width: auto;';
    input.addEventListener('change', () => snimiDatumStavke(stavkaId, input.value, tdElement));
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (input.parentElement === tdElement) tdElement.innerHTML = originalniHtml;
        }, 200);
    });

    tdElement.innerHTML = '';
    tdElement.appendChild(input);
    input.focus();
    if (typeof input.showPicker === 'function') {
        try { input.showPicker(); } catch (e) { /* ignoriši */ }
    }
}

// Slanje novog datuma na backend
async function snimiDatumStavke(id, noviDatum, tdElement) {
    const prosirenjeRed = tdElement ? tdElement.closest('tr.fond-expand-red') : null;
    const tabelaStavki = tdElement ? tdElement.closest('table[id^="tabela-stavki-"]') : null;
    const redStavke = tdElement ? tdElement.closest('tr') : null;
    try {
        const response = await fetch('/azuriraj-status-stavke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, datum_placanja: noviDatum })
        });
        const data = await response.json();

        if (data.success) {
            // Ćelija datuma: prosleđena ili pronađena po ID-ju stavke
            let ciljanaDatumCelija = tdElement || null;
            if (!ciljanaDatumCelija) {
                document.querySelectorAll('.col-datum-pl').forEach(td => {
                    const oc = td.getAttribute('onclick');
                    if (oc && oc.includes(`omoguciIzmenuDatumaPlacanja(this, ${id},`)) {
                        ciljanaDatumCelija = td;
                    }
                });
            }

            if (ciljanaDatumCelija) {
                // Trenutni status se čita iz onclick-a
                const stariOnclick = ciljanaDatumCelija.getAttribute('onclick') || '';
                const match = stariOnclick.match(/omoguciIzmenuDatumaPlacanja\(this, \d+, '([^']+)'/);
                const trenutniStatus = match ? match[1] : 'placeno'; // Rezerva: placeno

                let prikazDatuma = '-';
                if (noviDatum) {
                    const delovi = noviDatum.split('-');
                    prikazDatuma = `${delovi[2]}.${delovi[1]}.${delovi[0]}.`;
                }

                ciljanaDatumCelija.innerHTML = prikazDatuma;
                oznaciNedostajuciDatum(ciljanaDatumCelija, !noviDatum);

                ciljanaDatumCelija.setAttribute('onclick', `omoguciIzmenuDatumaPlacanja(this, ${id}, '${trenutniStatus}', '${prikazDatuma}')`);
            }

            // Odmah osveži sume konta i izvora (datum može da premesti stavku u drugu godinu)
            ukloniAkoPremestena(redStavke, tabelaStavki, data);
            osveziSumeNakonPromene(prosirenjeRed);
        } else {
            prikaziToast(data.message, 'greska');
        }
    } catch (e) {
        console.error(e);
        prikaziToast("Greška pri čuvanju datuma.", 'greska');
    }
}

/* ---------------------------------------------------------------------
   Inicijalizacija pri učitavanju stranice
   --------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    // Stanje otvorenih/zatvorenih ugovora (stara logika)
    document.querySelectorAll('.ugovor-sadrzaj').forEach(u => {
        const status = localStorage.getItem('ugovor_' + u.id);
        if (status === 'open') {
            u.style.display = 'block';
        } else if (status === 'closed') {
            u.style.display = 'none';
        }
    });

    // Vrati checkboxove i sakrij kolone
    ucitajPodesavanjaKolona();

    // Nova interakcija
    inicijalizujDropzone();
    inicijalizujKontekst();
    prikaziSacuvaniToast();

    // Zatvaranje <dialog> klikom na pozadinu
    document.querySelectorAll('dialog.dlg').forEach(d => {
        d.addEventListener('mousedown', e => { if (e.target === d) d.close(); });
    });
});

// Padajući meni (kolone) se zatvara klikom van njega
document.addEventListener('click', e => {
    document.querySelectorAll('details.dropdown[open]').forEach(d => {
        if (!d.contains(e.target)) d.removeAttribute('open');
    });
});
