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
    const files = document.getElementById(inputId).files;
    if (files.length === 0) return alert("Niste izabrali fajlove.");

    const formData = new FormData();
    for (const file of files) {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            formData.append('excelFajlovi', file);
        }
    }

    try {
        const response = await fetch('/skeniraj', { method: 'POST', body: formData });
        const rezultat = await response.json();
        if (rezultat.success) window.location.reload();
        else alert("Greška: " + rezultat.message);
    } catch (err) { alert("Greška pri slanju."); }
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
    container.innerHTML = 'Učitavanje kontova...';

    try {
        const response = await fetch(`/api/fond/${fondId}/kontovi`);
        const kontovi = await response.json();

        let html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr class="konto-header-red">
                        <th>Konto</th>
                        <th>Planirano</th>
                        <th>Utrošeno</th>
                        <th>Dostupno</th>
                    </tr>
                </thead>
                <tbody>`;

        kontovi.forEach(k => {
            html += `
                <tr id="konto-glavni-${k.id}" style="border-bottom: 1px solid #ccc; cursor: pointer;" 
                    onclick="event.stopPropagation(); prikaziStavkeKonta('${k.id}')">
                    <td><strong>${k.ime_konta}</strong></td>
                    <td>${k.sredstva}</td>
                    <td>${k.utrosena_sredstva}</td>
                    <td style="color: ${k.dostupna_sredstva < 0 ? 'red' : 'green'}">${k.dostupna_sredstva}</td>
                </tr>
                <tr id="konto-expand-${k.id}" style="display: none;">
                    <td colspan="4">
                        <div id="kontejner-stavki-${k.id}" style="padding: 10px; background: white;"></div>
                    </td>
                </tr>`;
        });
        container.innerHTML = html + `</tbody></table>`;
    } catch (e) { container.innerHTML = "Greška pri učitavanju."; }
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
                        <th>Artikal</th>
                        <th>Račun</th>
                        <th>Vrednost sa PDV</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;
        
        stavke.forEach(s => {
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td>${s.naziv_artikla}</td>
                    <td>${s.br_racuna}</td>
                    <td>${s.vred_sa_pdv}</td>
                    <td><span class="badge-${s.status_placanja}">${s.status_placanja}</span></td>
                </tr>`;
        });
        container.innerHTML = html + `</tbody></table>`;
    } catch (e) { container.innerHTML = "Greška."; }
}

