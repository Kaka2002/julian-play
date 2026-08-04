const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const arquivo = process.argv[2];
if (!arquivo || !fs.existsSync(arquivo)) {
    console.error('Informe um arquivo SQLite existente.');
    process.exit(2);
}

const banco = new sqlite3.Database(arquivo, sqlite3.OPEN_READONLY, erro => {
    if (erro) {
        console.error(erro.message);
        process.exit(1);
    }
    banco.get('PRAGMA quick_check', (err, row) => {
        const resultado = String(row?.quick_check || Object.values(row || {})[0] || '');
        banco.close(() => {
            if (err || resultado.toLowerCase() !== 'ok') {
                console.error(err?.message || resultado || 'Falha de integridade SQLite.');
                process.exit(1);
            }
            console.log('ok');
        });
    });
});
