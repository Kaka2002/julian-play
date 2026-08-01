'use strict';

const sqlite3 = require('sqlite3').verbose();

const banco = String(process.env.JULIAN_MASTER_DB || '').trim();
const slug = String(process.env.JULIAN_CLIENT_SLUG || '').trim();
const pastaDados = String(process.env.JULIAN_CLIENT_DATA || '').trim();
const processoPm2 = String(process.env.JULIAN_CLIENT_PROCESS || '').trim();
const porta = Number(process.env.JULIAN_CLIENT_PORT || 0);

if (!banco) throw new Error('JULIAN_MASTER_DB nao informado.');
if (!slug) throw new Error('JULIAN_CLIENT_SLUG nao informado.');
if (!pastaDados) throw new Error('JULIAN_CLIENT_DATA nao informado.');
if (!processoPm2) throw new Error('JULIAN_CLIENT_PROCESS nao informado.');
if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('JULIAN_CLIENT_PORT invalida.');

const db = new sqlite3.Database(banco, erroAbertura => {
    if (erroAbertura) {
        console.error(erroAbertura.message);
        process.exitCode = 1;
    }
});

db.run(
    `UPDATE instalacoes
        SET processoPm2 = ?, porta = ?, pastaDados = ?,
            status = 'parado', detalheStatus = ?, atualizadoEm = CURRENT_TIMESTAMP
      WHERE slug = ?`,
    [processoPm2, porta, pastaDados, 'Dados migrados para o computador local; robo mantido parado.', slug],
    function concluido(erro) {
        if (erro) {
            console.error(erro.message);
            process.exitCode = 1;
        } else if (this.changes !== 1) {
            console.error(`Instalacao ${slug} nao encontrada ou cadastro ambiguo.`);
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
