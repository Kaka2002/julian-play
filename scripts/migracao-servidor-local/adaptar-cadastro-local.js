'use strict';

const sqlite3 = require('sqlite3').verbose();

const banco = String(process.env.JULIAN_MASTER_DB || '').trim();
const dadosAdministrador = String(process.env.JULIAN_ADMIN_DATA || '').trim();

if (!banco) throw new Error('JULIAN_MASTER_DB nao informado.');
if (!dadosAdministrador) throw new Error('JULIAN_ADMIN_DATA nao informado.');

const db = new sqlite3.Database(banco, erroAbertura => {
    if (erroAbertura) {
        console.error(erroAbertura.message);
        process.exitCode = 1;
    }
});

db.run(
    `UPDATE instalacoes
        SET processoPm2 = ?, porta = ?, pastaDados = ?
      WHERE processoPm2 = ? OR porta = ?`,
    ['julian-play-admin', 10001, dadosAdministrador, 'julian-play', 10000],
    erro => {
        if (erro) {
            console.error(erro.message);
            process.exitCode = 1;
        }
        db.close(erroFechamento => {
            if (erroFechamento) {
                console.error(erroFechamento.message);
                process.exitCode = 1;
            }
        });
    }
);
