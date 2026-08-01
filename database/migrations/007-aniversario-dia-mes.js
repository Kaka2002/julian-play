module.exports = {
    versao: '2026-08-01-007-aniversario-dia-mes',
    nome: 'Remove o ano das datas de aniversário dos clientes',
    async up({ run }) {
        await run(`UPDATE clientes
            SET nascimento = substr(trim(nascimento), 6, 5)
            WHERE trim(nascimento) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                AND strftime('%m-%d', '2000-' || substr(trim(nascimento), 6, 5)) = substr(trim(nascimento), 6, 5)`);
    }
};
