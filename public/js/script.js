// Funkcija za formatiranje brojeva (npr. 2500000 -> 2.500.000,00)
function formatirajBroj(broj) {
    if (broj === null || broj === undefined || isNaN(broj)) return "0,00";
    return parseFloat(broj).toLocaleString('sr-RS', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
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
            alert(rezultat.message); 
        } else {
            let porukaZaKorisnika = (rezultat.message || "Greška pri uvozu.") + "\n\nDETALJI ZA ISPRAVKU:\n";
            
            if (rezultat.detaljiGresaka && rezultat.detaljiGresaka.length > 0) {
                rezultat.detaljiGresaka.forEach((g, indeks) => {
                    // 💡 SADA ISPISUJEMO I IME FAJLA
                    porukaZaKorisnika += `${indeks + 1}. [Fajl: ${g.fajl}]\n   Artikal: "${g.artikal}"\n   Greška: ${g.poruka}\n\n`;
                });
            } else {
                porukaZaKorisnika += "Sistemska greška: " + (rezultat.error || "Nepoznato");
            }
            
            alert(porukaZaKorisnika);
        }

        window.location.reload();

    } catch (err) { 
        console.error(err);
        alert("Greška pri komunikaciji sa serverom."); 
    } finally {
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

function izmeniSredstva(id, ime, trenutnaVrednost) {
    const noviIznos = prompt(`Novi iznos za fond "${ime}":`, trenutnaVrednost);
    if (noviIznos === null || noviIznos === "") return;

    //const lozinka = prompt("Unesite lozinku za potvrdu:");
    //if (lozinka) {
    fetch('/azuriraj-sredstva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, sredstva: noviIznos, /*lozinka*/ })
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
        
        // Indeksi prema tabeli: ID(0), Godina(1), Ime(2)
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
        
        // Proveravamo da li red sadrži SVAKU reč koju smo ukucali (AND logika)
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

async function prikaziStavkeKonta(kontoId) {
    const row = document.getElementById(`konto-expand-${kontoId}`);
    const glavniRedKonta = document.getElementById(`konto-glavni-${kontoId}`);
    const container = document.getElementById(`kontejner-stavki-${kontoId}`);

    if (row.style.display === 'table-row') {
        row.style.display = 'none';
        glavniRedKonta.classList.remove('konto-red-otvoren');
        return;
    }

    row.style.display = 'table-row';
    glavniRedKonta.classList.add('konto-red-otvoren');
    container.innerHTML = 'Učitavanje stavki...';

    try {
        const response = await fetch(`/api/konto/${kontoId}/stavke`);
        const stavke = await response.json();

        // Funkcija za formatiranje datuma
        const formatirajZaPrikaz = (input) => {
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
        };

        const f = (br) => {
            if (br === undefined || br === null) return '0,00';
            return Number(br).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        let html = `
            <div style="margin: 10px 0; display: flex; align-items: center; gap: 10px;">
                <input type="text" 
                       id="filter-stavki-${kontoId}" 
                       placeholder="Pretraži stavke (dobavljač, račun, artikal...)" 
                       style="padding: 6px 10px; width: 300px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85em;"
                       onkeyup="filtrirajTabeluStavki(${kontoId})">
                <span style="font-size: 0.8em; color: #666;">Prikazano: <strong id="count-${kontoId}">${stavke.length}</strong> stavki</span>
            </div>
            <table id="tabela-stavki-${kontoId}" style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
                <thead>
                    <tr class="stavke-header" style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                        <th class="col-datum" style="padding: 8px; text-align: left;">Datum nabavke</th>
                        <th class="col-racun" style="padding: 8px; text-align: left;">Br. računa</th>
                        <th class="col-dobavljac" style="padding: 8px; text-align: left;">Dobavljač</th>
                        <th class="col-nabavka" style="padding: 8px; text-align: left;">Broj nabavke</th>
                        <th class="col-partija" style="padding: 8px; text-align: left;">Partija</th>
                        <th class="col-ugovor" style="padding: 8px; text-align: left;">Broj ugovora</th>
                        <th class="col-datum-ug" style="padding: 8px; text-align: left;">Datum ugovora</th>
                        <th class="col-artikal" style="padding: 8px; text-align: left;">Naziv artikla</th>
                        <th class="col-kolicina" style="padding: 8px; text-align: left;">Količina</th>
                        <th class="col-cena-bez" style="padding: 8px; text-align: left;">Cena bez PDV</th>
                        <th class="col-cena-sa" style="padding: 8px; text-align: left;">Cena sa PDV</th>
                        <th class="col-vred-bez" style="padding: 8px; text-align: left;">Vrednost bez PDV</th>
                        <th class="col-vred-sa" style="padding: 8px; text-align: left;">Vrednost sa PDV</th>
                        <th class="col-status" style="padding: 8px; text-align: left;">Status plaćanja</th>
                        <th class="col-datum-pl" style="padding: 8px; text-align: left;">Datum plaćanja</th>
                        <th class="col-institut" style="padding: 8px; text-align: left;">Institut</th>
                        <th class="col-fajl" style="padding: 8px; text-align: left;">Excel fajl</th>
                    </tr>
                </thead>
                <tbody>`;
        
        if (stavke.length === 0) {
            html += `<tr><td colspan="17" style="padding: 15px; text-align: center; color: #666;">Nema pronađenih stavki za ovaj konto.</td></tr>`;
        } else {
            stavke.forEach(s => {
                const dNabavke = formatirajZaPrikaz(s.datum_nabavke);
                const dPlacanja = formatirajZaPrikaz(s.datum_placanja);
                const dUgovora = formatirajZaPrikaz(s.datum_zakljucenja);
                
                // 💡 LOGIKA ZA BOJU POZADINE BEZ TEXTA:
                let stilDatuma = 'padding: 8px; cursor: pointer; text-align: center; transition: background 0.3s;';
                if ((s.status_placanja || '').toLowerCase() === 'placeno' && (!s.datum_placanja || s.datum_placanja === '-')) {
                    stilDatuma += ' background-color: #fff3cd;'; // Nežna pastelno žuta pozadina
                }

                html += `
                    <tr class="stavka-red" style="border-bottom: 1px solid #eee;">
                        <td class="col-datum" style="padding: 8px;">${dNabavke}</td>
                        <td class="col-racun" style="padding: 8px;">${s.br_racuna || '-'}</td>
                        <td class="col-dobavljac" style="padding: 8px;">${s.dobavljac || '-'}</td>
                        <td class="col-nabavka" style="padding: 8px;">${s.broj_nabavke || s.brojNabavke || '-'}</td>
                        <td class="col-partija" style="padding: 8px;">${s.partija || '-'}</td>
                        <td class="col-ugovor" style="padding: 8px;">${s.broj_ugovora || s.brojUgovora || '-'}</td>
                        <td class="col-datum-ug" style="padding: 8px;">${dUgovora}</td>
                        <td class="col-artikal" style="padding: 8px; font-weight: 500;">${s.naziv_artikla}</td>
                        <td class="col-kolicina" style="padding: 8px;">${s.kolicina || 0}</td>
                        <td class="col-cena-bez" style="padding: 8px;">${f(s.cena_bez_pdv || s.cenaBez)}</td>
                        <td class="col-cena-sa" style="padding: 8px;">${f(s.cena_sa_pdv || s.cenaSa)}</td>
                        <td class="col-vred-bez" style="padding: 8px;">${f(s.vred_bez_pdv || s.vrednostBez)}</td>
                        <td class="col-vred-sa" style="padding: 8px; font-weight: bold;">${f(s.vred_sa_pdv || s.vrednostSa)}</td>
                        
                        <td class="col-status" style="padding: 8px; cursor: pointer;" 
                            onclick="promeniStatusKlikom(this, ${s.id}, '${s.status_placanja || 'za placanje'}')">
                            <span class="badge-${(s.status_placanja || 'za placanje').toLowerCase().replace(' ', '-')}">${s.status_placanja || '-'}</span>
                        </td>

                        <td class="col-datum-pl" style="${stilDatuma}" 
                            onclick="omoguciIzmenuDatumaPlacanja(this, ${s.id}, '${s.status_placanja || 'za placanje'}', '${s.datum_placanja || '-'}')">
                            ${dPlacanja}
                        </td>
                        
                        <td class="col-institut" style="padding: 8px;">${s.institut || '-'}</td>
                        <td class="col-fajl" style="padding: 8px; font-size: 0.9em; color: #666;">${s.ime_fajla || s.nazivFajla || '-'}</td>
                    </tr>`;
            });
        }
        
        container.innerHTML = html + `</tbody></table>`;

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

    //const lozinka = prompt("Unesite lozinku za potvrdu:");
    //if (!lozinka) return;

    fetch('/azuriraj-sredstva-konta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, sredstva: noviIznos, /*lozinka*/ })
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
    const podesavanja = {};

    // Prolazimo kroz svaki checkbox
    document.querySelectorAll('.col-toggle').forEach(checkbox => {
        const klasaKolone = checkbox.value; // npr. "col-partija"
        const isCekiran = checkbox.checked;
        
        // Sakrivanje/prikazivanje ćelija
        document.querySelectorAll(`.${klasaKolone}`).forEach(celija => {
            celija.style.display = isCekiran ? '' : 'none';
        });

        // DODATAK: Skupljamo stanja u jedan objekat (koristimo value kao ključ)
        podesavanja[klasaKolone] = isCekiran;
    });

    // DODATAK: Čuvamo taj objekat u localStorage
    localStorage.setItem('prikazKolonaStanje', JSON.stringify(podesavanja));
}

// Takođe vežeš event listener na promenu bilo kog checkboxa u filtrima
document.querySelectorAll('.col-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', primeniPrikazKolona);
});

function ucitajPodesavanjaKolona() {
    const sacuvano = localStorage.getItem('prikazKolonaStanje');
    if (!sacuvano) return; // Ako je prvi put na sajtu, ne radi ništa

    const podesavanja = JSON.parse(sacuvano);

    // Prolazimo kroz sve checkboxove i vraćamo im stanje iz memorije
    document.querySelectorAll('.col-toggle').forEach(checkbox => {
        const klasaKolone = checkbox.value;
        if (podesavanja.hasOwnProperty(klasaKolone)) {
            checkbox.checked = podesavanja[klasaKolone];
        }
    });

    // Na kraju pokrenemo tvoju funkciju da bi se tabela fizički sakrila
    // (Ovo radimo bez čuvanja da ne bi ušli u beskonačnu petlju)
    izvrsiSakrivanjeBezCuvanja();
}

// Pomoćna funkcija koja samo sakriva, bez pisanja u localStorage
function izvrsiSakrivanjeBezCuvanja() {
    document.querySelectorAll('.col-toggle').forEach(checkbox => {
        const klasaKolone = checkbox.value;
        const isCekiran = checkbox.checked;
        document.querySelectorAll(`.${klasaKolone}`).forEach(celija => {
            celija.style.display = isCekiran ? '' : 'none';
        });
    });
}
async function izmeniPoljeUgovora(id, polje, trenutnaVrednost) {
    // Ako klikne na polje sa PDV-om, zabranjujemo izmenu i obaveštavamo ga
    if (polje === 'vrednost_sa_pdv') {
        alert("Ovo polje se računa automatski (Vrednost bez PDV * 1.2) i ne može se ručno menjati.");
        return;
    }
    
    let novaVrednost = prompt("Unesite novu vrednost bez PDV-a:", trenutnaVrednost);
    if (novaVrednost === null || novaVrednost === "") return; 

    const podaciZaSlanje = { 
        id: id, 
        vrednost_bez_pdv: parseFloat(novaVrednost) || 0 
    };

    try {
        const response = await fetch('/azuriraj-ugovor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(podaciZaSlanje)
        });

        const data = await response.json();
        if (data.success) {
            window.location.reload(); // Osvežava stranicu da povuče nove bazične proračune
        } else {
            alert("Greška: " + data.message);
        }
    } catch (error) {
        alert("Došlo je do greške na serveru.");
    }
}

async function promeniStatusKlikom(tdElement, stavkaId, trenutniStatus, ugovorId) {
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
            // Napomena: klasa 'badge-' se oslanja na CSS koji smo ranije definisali
            const statusKlasa = noviStatus.toLowerCase().replace(' ', '-');
            tdElement.innerHTML = `<span class="badge-${statusKlasa}">${noviStatus}</span>`;
            
            // Ažuriraj onclick same ćelije za status
            tdElement.setAttribute('onclick', `promeniStatusKlikom(this, ${stavkaId}, '${noviStatus}', ${ugovorId})`);

            // 2. Ažuriraj onclick atribut ćelije za datum (da bi prepoznala novi status)
            const red = tdElement.closest('tr');
            const datumCelija = red.querySelector('.col-datum-pl');
            
            if (datumCelija) {
                const stariOnclick = datumCelija.getAttribute('onclick');
                if (stariOnclick) {
                    // Regex traži deo u onclick-u koji sadrži status i menja ga
                    // Ovo osigurava da omoguciIzmenuDatumaPlacanja dobije novi status
                    const noviOnclick = stariOnclick.replace(
                        /omoguciIzmenuDatumaPlacanja\(this, \d+, '[^']+'/, 
                        `omoguciIzmenuDatumaPlacanja(this, ${stavkaId}, '${noviStatus}'`
                    );
                    datumCelija.setAttribute('onclick', noviOnclick);
                }

                // Ako status više nije 'placeno', resetuj vizuelno datum
                if (noviStatus !== 'placeno') {
                    datumCelija.innerHTML = '-';
                    datumCelija.style.backgroundColor = 'transparent';
                }
            }

            // 3. Ažuriraj ukupnu potrošnju u glavnoj tabeli (Gornji red)
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
            }
        } else {
            alert("Greška: " + data.message);
        }
    } catch (e) {
        console.error(e);
        alert("Došlo je do greške pri ažuriranju.");
    }
}

// 📅 2. OBRADA KLIKA NA DATUM (Ostaje ista, čista)
function omoguciIzmenuDatumaPlacanja(tdElement, stavkaId, trenutniStatus, trenutniDatum) {
    // 1. Priprema statusa: pretvaramo u string, uklanjamo razmake i prebacujemo u mala slova
    const status = trenutniStatus ? trenutniStatus.toString().trim().toLowerCase() : "";
    
    // Debug: ovo ćeš videti u F12 -> Console
    console.log("Status koji se proverava:", status);

    // 2. Provera uslova (dodali smo i 'plaćeno' sa 'ć' za svaki slučaj)
    if (status !== 'placeno' && status !== 'plaćeno') {
        alert("Datum plaćanja možete uneti samo ako je status postavljen na 'placeno'. (Detektovan status: " + status + ")");
        return; 
    }
    
    // 3. Provera da li input već postoji
    if (tdElement.querySelector('input')) return;

    const originalniHtml = tdElement.innerHTML;

    let formatiranZaInput = "";
    if (trenutniDatum && trenutniDatum !== '-') {
        const delovi = trenutniDatum.split('.');
        if (delovi.length === 3) {
            // Pretvaranje iz dd.mm.yyyy u yyyy-mm-dd za HTML input
            formatiranZaInput = `${delovi[2]}-${delovi[1].padStart(2, '0')}-${delovi[0].padStart(2, '0')}`;
        }
    }

    tdElement.innerHTML = `
        <input type="date" value="${formatiranZaInput}" 
            style="padding: 4px; font-family: inherit;"
            onchange="snimiDatumStavke(${stavkaId}, this.value)" 
            onblur="setTimeout(() => { this.parentElement.innerHTML = \`${originalniHtml}\`; }, 200)">
    `;
    
    const input = tdElement.querySelector('input');
    input.focus();
    if (typeof input.showPicker === 'function') {
        input.showPicker();
    }
}

// 💾 3. SLANJE NOVOG DATUMA NA BACKEND (Sklanja boju čim se unese datum)
async function snimiDatumStavke(id, noviDatum) {
    try {
        const response = await fetch('/azuriraj-status-stavke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, datum_placanja: noviDatum })
        });
        const data = await response.json();
        
        if (data.success) {
            // Pronalaženje datum ćelije
            const sveDatumCelije = document.querySelectorAll('.col-datum-pl');
            let ciljanaDatumCelija = null;
            
            sveDatumCelije.forEach(td => {
                if (td.getAttribute('onclick') && td.getAttribute('onclick').includes(`omoguciIzmenuDatumaPlacanja(this, ${id}`)) {
                    ciljanaDatumCelija = td;
                }
            });

            if (ciljanaDatumCelija) {
                // IZVUCI TRENUTNI STATUS IZ ONCLICK-a umesto da ga zakucavaš
                const stariOnclick = ciljanaDatumCelija.getAttribute('onclick');
                const match = stariOnclick.match(/omoguciIzmenuDatumaPlacanja\(this, \d+, '([^']+)'/);
                const trenutniStatus = match ? match[1] : 'placeno'; // Fallback na placeno

                let prikazDatuma = '-';
                if (noviDatum) {
                    const delovi = noviDatum.split('-');
                    prikazDatuma = `${delovi[2]}.${delovi[1]}.${delovi[0]}.`;
                }

                ciljanaDatumCelija.innerHTML = prikazDatuma;
                ciljanaDatumCelija.style.backgroundColor = noviDatum ? 'transparent' : '#fff3cd';
                
                // AŽURIRAJ SA PROČITANIM STATUSOM
                ciljanaDatumCelija.setAttribute('onclick', `omoguciIzmenuDatumaPlacanja(this, ${id}, '${trenutniStatus}', '${prikazDatuma}')`);
            }
        } else {
            alert(data.message);
        }
    } catch (e) { 
        console.error(e);
        alert("Greška pri čuvanju datuma."); 
    }
}
async function obrisiFond(fondId) {

    console.log("Kliknuto za ID:", fondId); // Ako ovo ne vidis u F12 -> Console, dugme nije dobro povezano

    if (!confirm("Da li ste sigurni da želite da obrišete ovaj fond? Ova operacija je trajna.")) {
        return;
    }

    // 2. Slanje zahteva
    fetch('/obrisi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fondId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload(); // Osveži stranicu
        } else {
            alert(data.message); // Prikazuje upozorenje o utrošenim sredstvima
        }
    })
    .catch(err => console.error("Greška:", err));
}

document.addEventListener('DOMContentLoaded', () => {
    const ugovori = document.querySelectorAll('.ugovor-sadrzaj');
    
    ugovori.forEach(u => {
        // Koristimo direktno ID koji element ima
        const status = localStorage.getItem('ugovor_' + u.id);
        
        if (status === 'open') {
            u.style.display = 'block';
        } else if (status === 'closed') {
            u.style.display = 'none';
        }
    });
});

// Kada se cela stranica učita, vrati checkboxove i sakrij kolone
window.addEventListener('DOMContentLoaded', () => {
    ucitajPodesavanjaKolona();
});