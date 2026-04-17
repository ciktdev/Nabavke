// FUNKCIJA ZA BRISANJE
async function potvrdiBrisanje(id, ime) {
    if (!confirm(`Da li ste sigurni da želite da obrišete fond: ${ime}?`)) return;

    let lozinka = prompt("Unesite administratorsku lozinku:");
    if (lozinka === null) return;

    try {
        const response = await fetch('/obrisi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `id=${id}&lozinka=${encodeURIComponent(lozinka)}`
        });

        const data = await response.json();
        if (data.success) {
            alert("Obrađeno!");
            window.location.reload();
        } else {
            alert(data.message);
        }
        } catch (error) {
            alert("Greška na serveru.");
        }
}

        // FUNKCIJA ZA SLANJE FOLDERA
async function posaljiSaInputa(inputId) {
    const input = document.getElementById(inputId);
    const files = input.files;

    if (files.length === 0) {
        alert("Niste izabrali nijedan fajl.");
        return;
    }

    const formData = new FormData();
    let brojacExcela = 0;

    for (const file of files) {
            // Provera ekstenzije
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            formData.append('excelFajlovi', file);
            brojacExcela++;
        }
    }

    if (brojacExcela === 0) {
        alert("Među izabranim stavkama nema Excel fajlova (.xlsx ili .xls)");
        return;
    }
    
// Vizuelni feedback
    const btn = event.target;
    const originalniTekst = btn.innerText;
    btn.innerText = "Slanje...";
    btn.disabled = true;

   // ... tvoj postojeći kod koji proverava ekstenzije ...
        
    // DODAJ OVO ISPOD btn.disabled = true;
    try {
        const response = await fetch('/skeniraj', { // OVDE ide tvoja stara ruta za fondove
            method: 'POST',
            body: formData
        });

        const rezultat = await response.json();

        if (rezultat.success) {
            alert(rezultat.message || "Fondovi uspešno učitani.");
            window.location.reload();
        } else {
            alert("Greška: " + rezultat.message);
        }
    } catch (err) {
        console.error(err);
        alert("Došlo je do greške pri slanju na server.");
    } finally {
        // Vraćamo dugme u prvobitno stanje
        btn.innerText = originalniTekst;
        btn.disabled = false;
    }
} // Zatvaranje funkcije

// 1. Čim se stranica učita, proveri da li imamo sačuvanu poziciju
document.addEventListener("DOMContentLoaded", function() {
    const scrollPos = localStorage.getItem("scrollPosition");
    if (scrollPos) {
        window.scrollTo(0, parseInt(scrollPos));
         // Opciono: obriši nakon vraćanja ako ne želiš da "lepi" stalno
        localStorage.removeItem("scrollPosition");
    }
});

// 2. Pre nego što korisnik napusti stranicu (klik na link ili slanje forme)
// sačuvaj trenutnu vertikalnu poziciju (window.scrollY)
window.addEventListener("beforeunload", function() {
    localStorage.setItem("scrollPosition", window.scrollY);
});

function izmeniSredstva(id, ime, trenutnaVrednost) {
    // 1. Tražimo novi iznos
    const noviIznos = prompt(`Unesite novi iznos sredstava za fond "${ime}":`, trenutnaVrednost);
    
    // Ako je korisnik kliknuo Cancel ili uneo prazno, prekidamo
    if (noviIznos === null || noviIznos === "") return;

    // 2. Tražimo lozinku (sigurnosna provera)
    const lozinka = prompt("Unesite lozinku za potvrdu izmene:");
    
    if (lozinka) {
        // Šaljemo podatke serveru putem Fetch API-ja
        fetch('/azuriraj-sredstva', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: id,
                sredstva: noviIznos,
                lozinka: lozinka
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Ako je uspelo, ažuriramo broj u tabeli bez osvežavanja stranice
                document.getElementById(`iznos-${id}`).innerText = noviIznos;
                alert("Iznos uspešno ažuriran!");
            } else {
                alert("Greška: " + data.message);
            }
        })
        .catch(err => alert("Došlo je do greške pri komunikaciji sa serverom."));
    }
}
