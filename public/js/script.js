// Funkcija za formatiranje brojeva (npr. 2500000 -> 2.500.000,00)
function formatirajBroj(broj) {
    if (broj === null || broj === undefined || isNaN(broj)) return "0,00";
    return parseFloat(broj).toLocaleString('sr-RS', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
// Globalne funkcije za brisanje i uvoz ostaju slične, ali fokus je na novoj navigaciji
async function potvrdiBrisanje(id, ime) {
    if (!confirm(`Da li ste sigurni da želite da obrišete fond: ${ime}?`)) return;
    let lozinka = prompt("Unesite administratorsku lozinku:");
    if (!lozinka) return;

    try {
        const response = await fetch('/obrisi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `id=${id}&lozinka=${encodeURIComponent(lozinka)}`
        });
        const data = await response.json();
        if (data.success) window.location.reload();
        else alert(data.message);
    } catch (error) { alert("Greška na serveru."); }
}

async function posaljiSaInputa(inputId) {
    const input = document.getElementById(inputId);
    const files = input.files;
    
    if (files.length === 0) return alert("Niste izabrali fajlove.");

    // Hvatanje dugmeta preko event-a i postavljanje statusa učitavanja
    const btn = event.target;
    const originalniTekst = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Skeniram...";

    const formData = new FormData();
    for (const file of files) {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            formData.append('excelFajlovi', file);
        }
    }

    try {
        const response = await fetch('/skeniraj', { method: 'POST', body: formData });
        const rezultat = await response.json();

        if (rezultat.success) {
            // Prikaz detaljne poruke sa servera (Uneto: X, Grešaka: Y)
            alert(rezultat.message); 
            window.location.reload();
        } else {
            alert("Greška: " + rezultat.message);
        }
    } catch (err) { 
        alert("Greška pri slanju."); 
    } finally {
        // Vraćanje dugmeta u prvobitno stanje
        btn.disabled = false;
        btn.innerText = originalniTekst;
    }
}


// Čuvanje pozicije skrola
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

// Vraćena funkcija za promenu sredstava u fondu
function izmeniSredstva(id, ime, trenutnaVrednost) {
    const noviIznos = prompt(`Novi iznos za fond "${ime}":`, trenutnaVrednost);
    if (noviIznos === null || noviIznos === "") return;

    const lozinka = prompt("Unesite lozinku za potvrdu:");
    if (lozinka) {
        fetch('/azuriraj-sredstva', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, sredstva: noviIznos, lozinka })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                document.getElementById(`iznos-${id}`).innerText = noviIznos;
                alert("Uspešno ažurirano!");
            } else {
                alert("Greška: " + data.message);
            }
        });
    }
}

async function prikaziKonta(fondId) {
    const row = document.getElementById(`fond-expand-${fondId}`);
    const container = document.getElementById(`lista-konta-${fondId}`);

    if (row.style.display === 'table-row') {
        row.style.display = 'none';
        return;
    }

    row.style.display = 'table-row';
    container.innerHTML = 'Učitavanje...';

    try {
        const response = await fetch(`/api/fond/${fondId}/kontovi`);
        const kontovi = await response.json();

        const glavniRed = document.querySelector(`tr[onclick*="prikaziKonta('${fondId}')"]`);
        
        // Indeksi prema tvojoj tabeli: ID(0), Godina(1), Ime(2)
        const fGodina = glavniRed.cells[1].innerText.trim();
        const fIme = glavniRed.cells[2].innerText.trim();

        let html = `
            <div style="background: #f0f4f7; padding: 15px; margin-bottom: 15px; border: 1px solid #cfe2e9; border-radius: 4px; display: flex; gap: 10px; align-items: center;">
                <span style="font-weight: bold;">Novi konto za ${fIme} (${fGodina}):</span>
                <input type="text" id="novo-ime-konta-${fondId}" placeholder="npr. 421111" style="width: 120px; padding: 5px;">
                <input type="number" id="nova-sredstva-konta-${fondId}" placeholder="Sredstva" value="0" style="width: 100px; padding: 5px;">
                <button onclick="rucnoDodajKonto('${fondId}', '${fIme}', '${fGodina}')" style="padding: 5px 10px; cursor: pointer;">
                    + Kreiraj
                </button>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr class="konto-header-red">
                        <th>Konto</th>
                        <th>Planirano (Klikni za izmenu)</th>
                        <th>Utrošeno</th>
                        <th>Dostupno</th>
                    </tr>
                </thead>
                <tbody>`;

        if (kontovi.length === 0) {
            html += `<tr><td colspan="4" style="text-align: center; padding: 10px;">Nema kontova. Unesite prvi iznad.</td></tr>`;
        } else {
            function formatirajBroj(broj) {
                return parseFloat(broj).toLocaleString('sr-RS', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
            kontovi.forEach(k => {
                html += `
                    <tr id="konto-glavni-${k.id}" style="border-bottom: 1px solid #ccc; cursor: pointer;" 
                        onclick="prikaziStavkeKonta('${k.id}')">
                        <td><strong>${k.ime_konta}</strong></td>
            
                        <td class="sredstva-celija" onclick="event.stopPropagation(); izmeniSredstvaKonta('${k.id}', '${k.ime_konta}', '${k.sredstva}')">
                            <span id="sredstva-konta-${k.id}">${formatirajBroj(k.sredstva)}</span>
                        </td>
            
                        <td style="color: #d9534f;">${formatirajBroj(k.utrosena_sredstva)}</td>
            
                        <td style="font-weight: bold; color: ${k.dostupna_sredstva < 0 ? 'red' : 'green'};">
                            ${formatirajBroj(k.dostupna_sredstva)}
                        </td>
                    </tr>
                    <tr id="konto-expand-${k.id}" style="display: none;">
                        <td colspan="4"><div id="kontejner-stavki-${k.id}" style="padding: 10px; background: white;"></div></td>
                    </tr>`;
            });
        }
        container.innerHTML = html + `</tbody></table>`;
    } catch (e) { 
        container.innerHTML = "Greška pri učitavanju kontova."; 
    }
}

async function prikaziStavkeKonta(kontoId) {
    const row = document.getElementById(`konto-expand-${kontoId}`);
    const glavniRedKonta = document.getElementById(`konto-glavni-${kontoId}`);
    const container = document.getElementById(`kontejner-stavki-${kontoId}`);

    if (row.style.display === 'table-row') {
        row.style.display = 'none';
        glavniRedKonta.classList.remove('konto-red-otvoren'); // Skloni sticky kad se zatvori
        return;
    }

    row.style.display = 'table-row';
    glavniRedKonta.classList.add('konto-red-otvoren'); // Dodaj sticky kad se otvori
    container.innerHTML = 'Učitavanje stavki...';

    try {
        const response = await fetch(`/api/konto/${kontoId}/stavke`);
        const stavke = await response.json();

        let html = `
            <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
                <thead>
                    <tr class="stavke-header">
                        <th>Datum nabavke</th>
                        <th>Artikal</th>
                        <th>Račun</th>
                        <th>Vrednost sa PDV</th>
                        <th>Status</th>
                        <th>Datum placanja</th>
                    </tr>
                </thead>
                <tbody>`;
        
        stavke.forEach(s => {
            console.log(s)
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td>${s.datum_nabavke.split('T')[0]}</td>
                    <td>${s.naziv_artikla}</td>
                    <td>${s.br_racuna}</td>
                    <td>${s.vred_sa_pdv}</td>
                    <td><span class="badge-${s.status_placanja}">${s.status_placanja}</span></td>
                    <td>${s.datum_placanja?.slice(0, 10) || null}</td>
                </tr>`;
        });
        container.innerHTML = html + `</tbody></table>`;
    } catch (e) { container.innerHTML = "Greška."; }
}

async function rucnoDodajKonto(fondId, imeFonda, godinaFonda) {
    const imeKonta = document.getElementById(`novo-ime-konta-${fondId}`).value;
    const sredstva = document.getElementById(`nova-sredstva-konta-${fondId}`).value;

    if (!imeKonta) return alert("Morate uneti naziv ili broj konta.");

    try {
        const response = await fetch('/dodaj-konto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fond_ime: imeFonda,
                fond_godina: godinaFonda,
                ime_konta: imeKonta,
                sredstva: sredstva
            })
        });

        const rezultat = await response.json();
        if (rezultat.success) {
            alert(rezultat.message);
            // Osveži prikaz kontova za taj fond bez reloada cele stranice
            prikaziKonta(fondId); 
        } else {
            alert(rezultat.message);
        }
    } catch (err) {
        alert("Greška pri komunikaciji sa serverom.");
    }
}

function izmeniSredstvaKonta(id, imeKonta, trenutnaVrednost) {
    const noviIznos = prompt(`Novi iznos za konto "${imeKonta}":`, trenutnaVrednost);
    if (noviIznos === null || noviIznos === "") return;

    const lozinka = prompt("Unesite lozinku za potvrdu:");
    if (!lozinka) return;

    fetch('/azuriraj-sredstva-konta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, sredstva: noviIznos, lozinka })
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success) {
            // Ako status nije 200 ili success nije true, šaljemo grešku u .catch
            throw new Error(data.message || "Server nije potvrdio izmenu.");
        }
        return data;
    })
    .then(data => {
        // AKO SMO OVDE, ZNAČI DA JE 100% USPELO
        const celijaSredstva = document.getElementById(`sredstva-konta-${id}`);
        if (celijaSredstva) {
            celijaSredstva.innerText = formatirajBroj(noviIznos);
        }

        const redKonta = celijaSredstva.closest('tr');
        // Čišćenje formata za matematiku
        const utrosenoTekst = redKonta.cells[2].innerText.replace(/\./g, '').replace(',', '.');
        const utroseno = parseFloat(utrosenoTekst) || 0;
        
        const dostupnoCelija = redKonta.cells[3];
        const novoDostupno = parseFloat(noviIznos) - utroseno;
        
        dostupnoCelija.innerText = formatirajBroj(novoDostupno);
        dostupnoCelija.style.color = novoDostupno < 0 ? 'red' : 'green';
    })
    .catch(err => {
        // Javlja se samo ako se zaista desila greška (mreža, baza ili lozinka)
        console.error("Detalji:", err);
        alert("GREŠKA: " + err.message);
    });
}