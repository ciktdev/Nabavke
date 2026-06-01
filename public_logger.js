const fs = require('fs');
const { Console } = require('console');

// Funkcija koja će isprazniti fajlove i vratiti novi logger
function inicijalizujLogere() {
    // Koristimo 'w' flag da prebrišemo sadržaj ako postoji
    const output = fs.createWriteStream('./sve_konzole.log', { flags: 'w' });
    const errorOutput = fs.createWriteStream('./sve_greske.log', { flags: 'w' });

    const fajlLogger = new Console({ stdout: output, stderr: errorOutput });

    global.console.log = (...args) => {
        const vreme = new Date().toLocaleString('sr-RS');
        fajlLogger.log(`[${vreme}] LOG:`, ...args);
    };

    global.console.error = (...args) => {
        const vreme = new Date().toLocaleString('sr-RS');
        fajlLogger.error(`[${vreme}] ERR:`, ...args);
    };
}

// Pokreni jednom pri startu servera
inicijalizujLogere();

// Izvezi funkciju da možemo da je pozovemo iz rute
module.exports = inicijalizujLogere;