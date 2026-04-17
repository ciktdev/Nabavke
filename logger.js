const fs = require('fs');

function upisiULog(akcija, podaci) {
    const vreme = new Date().toLocaleString('sr-RS'); // Vreme na srpskom formatu
    const poruka = `[${vreme}] AKCIJA: ${akcija} | PODACI: ${JSON.stringify(podaci)}\n`;

    // 'a' flag znači "append" (dodaj na kraj), da ne briše stare logove
    fs.appendFile('promene.log', poruka, (err) => {
        if (err) console.error("Greška pri pisanju loga:", err);
    });
}

module.exports = upisiULog;