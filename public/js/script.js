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
                // Tražimo red fonda. 
                // Koristimo querySelector da nađemo red koji u sebi ima onclick sa tvojim ID-em
                const red = document.querySelector(`tr[onclick*="prikaziKonta('${id}')"]`);
            
                if (red) {
                    // 1. Ažuriramo kolonu "Sredstva (Planirano)"
                    // Prema slici to je cells[2]
                    red.cells[2].innerText = formatirajBroj(data.podaci.sredstva);
                    red.cells[2].style.fontWeight = 'bold';

                    // 2. Ažuriramo kolonu "Dostupno"
                    // Prema slici to je cells[4] (pre Akcija)
                    red.cells[4].innerText = formatirajBroj(data.podaci.dostupna_sredstva);
            
                    // Boja i stil za Dostupno
                    red.cells[4].style.color = data.podaci.dostupna_sredstva < 0 ? 'red' : 'green';
                    red.cells[4].style.fontWeight = 'bold';

                    // 3. Čistimo kolonu "Akcije" (cells[5]) ako je JS tu nešto pogrešno upisao
                    // Ovde ne diraj ništa osim ako ne vidiš da ti je JS obrisao kanticu
                }
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
        const fGodina = glavniRed.cells[0].innerText.trim();
        const fIme = glavniRed.cells[1].innerText.trim();

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

        // Generisanje tabele sa klasama za svaku kolonu (za checkbox filtere)
        let html = `
            <table style="width: 100%; font-size: 0.85em; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr class="stavke-header" style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                        <th class="col-datum" style="padding: 8px; text-align: left;">Datum nabavke</th>
                        <th class="col-racun" style="padding: 8px; text-align: left;">Br. računa</th>
                        <th class="col-artikal" style="padding: 8px; text-align: left;">Naziv artikla</th>
                        <th class="col-kolicina" style="padding: 8px; text-align: left;">Količina</th>
                        <th class="col-cena-bez" style="padding: 8px; text-align: left;">Cena bez PDV</th>
                        <th class="col-cena-sa" style="padding: 8px; text-align: left;">Cena sa PDV</th>
                        <th class="col-vred-bez" style="padding: 8px; text-align: left;">Vrednost bez PDV</th>
                        <th class="col-vred-sa" style="padding: 8px; text-align: left;">Vrednost sa PDV</th>
                        <th class="col-status" style="padding: 8px; text-align: left;">Status plaćanja</th>
                        <th class="col-datum-pl" style="padding: 8px; text-align: left;">Datum plaćanja</th>
                        <th class="col-institut" style="padding: 8px; text-align: left;">Institut</th>
                    </tr>
                </thead>
                <tbody>`;
        
        if (stavke.length === 0) {
            html += `<tr><td colspan="11" style="padding: 15px; text-align: center; color: #666;">Nema pronađenih stavki za ovaj konto.</td></tr>`;
        } else {
            stavke.forEach(s => {
                // Pomoćne funkcije za formatiranje unutar petlje
                const dNabavke = s.datum_nabavke ? s.datum_nabavke.split('T')[0] : '-';
                const dPlacanja = s.datum_placanja ? s.datum_placanja.split('T')[0] : '-';
                const institut = s.institut || '-';

                html += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td class="col-datum" style="padding: 8px;">${dNabavke}</td>
                        <td class="col-racun" style="padding: 8px;">${s.br_racuna || '-'}</td>
                        <td class="col-artikal" style="padding: 8px; font-weight: 500;">${s.naziv_artikla}</td>
                        <td class="col-kolicina" style="padding: 8px;">${s.kolicina || 1}</td>
                        <td class="col-cena-bez" style="padding: 8px;">${formatirajBroj(s.cena_bez_pdv)}</td>
                        <td class="col-cena-sa" style="padding: 8px;">${formatirajBroj(s.cena_sa_pdv)}</td>
                        <td class="col-vred-bez" style="padding: 8px;">${formatirajBroj(s.vred_bez_pdv)}</td>
                        <td class="col-vred-sa" style="padding: 8px; font-weight: bold;">${formatirajBroj(s.vred_sa_pdv)}</td>
                        <td class="col-status" style="padding: 8px;">
                            <span class="badge-${s.status_placanja || 'nepoznato'}">${s.status_placanja || '-'}</span>
                        </td>
                        <td class="col-datum-pl" style="padding: 8px;">${dPlacanja}</td>
                        <td class="col-institut" style="padding: 8px;">${institut}</td>
                    </tr>`;
            });
        }
        
        container.innerHTML = html + `</tbody></table>`;

        // KLJUČNO: Odmah nakon iscrtavanja tabele, primenjujemo filtere kolona
        // kako bi se sakrile one kolone koje nisu čekirane u checkboxovima.
        if (typeof primeniPrikazKolona === "function") {
            primeniPrikazKolona();
        }

    } catch (e) { 
        console.error("Greška pri učitavanju stavki:", e);
        container.innerHTML = `<span style="color: red;">Greška prilikom učitavanja podataka.</span>`; 
    }
}

async function rucnoDodajKonto(fondId, fondIme, fondGodina) {
    const imeKonta = document.getElementById(`novo-ime-konta-${fondId}`).value;
    const sredstva = document.getElementById(`nova-sredstva-konta-${fondId}`).value;

    if (!imeKonta) return alert("Unesite broj konta!");

    try {
        const response = await fetch('/dodaj-konto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // OVDE MENJAŠ: Ključevi (levo) moraju biti kao u bazi
            body: JSON.stringify({ 
                fond_ime: fondIme, 
                fond_godina: fondGodina, 
                ime_konta: imeKonta, 
                sredstva: sredstva 
            })
        });
        
        const data = await response.json();
        if (data.success) {
            window.location.reload(); 
        } else {
            alert("Greška: " + data.message);
        }
    } catch (e) {
        console.error(e);
        alert("Greška na mreži.");
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

function primeniPrikazKolona() {
    const checkboxovi = document.querySelectorAll('.col-toggle');
    
    checkboxovi.forEach(cb => {
        const klasaKolone = cb.value;
        const sviElementiTeKolone = document.querySelectorAll(`.${klasaKolone}`);
        
        sviElementiTeKolone.forEach(el => {
            if (cb.checked) {
                el.style.display = ""; // Vraća na podrazumevano (vidljivo)
            } else {
                el.style.display = "none"; // Sakriva
            }
        });
    });
}