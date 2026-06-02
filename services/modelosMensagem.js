const db = require('../database/sqlite');

const modelosPadrao = [
    {
        chave: 'padrao_vencimento',
        plano: 'padrao',
        titulo: 'Aviso de Vencimento Próximo',
        cor: 'blue',
        texto: 'Olá, *{{nome}}!*\n\nPassando para avisar que seu plano *{{plano}}* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nPara renovar e continuar com acesso, entre em contato comigo.'
    },
    {
        chave: 'padrao_expirado',
        plano: 'padrao',
        titulo: 'Aviso de Plano Expirado',
        cor: 'red',
        texto: 'Olá, *{{nome}}!*\n\nSeu plano *{{plano}}* venceu no dia *{{vencimento}}*.\n\nPara reativar seu acesso, entre em contato o quanto antes.'
    },
    {
        chave: 'mensal_vencimento',
        plano: 'mensal',
        titulo: 'Renovação Mensal - Vencimento Próximo',
        cor: 'blue',
        texto: 'Olá, *{{nome}}!*\n\nSeu plano *mensal* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e continue com acesso sem interrupções.'
    },
    {
        chave: 'trimestral_vencimento',
        plano: 'trimestral',
        titulo: 'Renovação Trimestral - Vencimento Próximo',
        cor: 'purple',
        texto: 'Olá, *{{nome}}!*\n\nSeu plano *trimestral* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e garanta mais 3 meses de acesso.'
    },
    {
        chave: 'semestral_vencimento',
        plano: 'semestral',
        titulo: 'Renovação Semestral - Vencimento Próximo',
        cor: 'orange',
        texto: 'Olá, *{{nome}}!*\n\nSeu plano *semestral* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e garanta mais 6 meses de acesso.'
    },
    {
        chave: 'anual_vencimento',
        plano: 'anual',
        titulo: 'Renovação Anual - Vencimento Próximo',
        cor: 'green',
        texto: 'Olá, *{{nome}}!*\n\nSeu plano *anual* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e garanta mais 1 ano de acesso.'
    },
    {
        chave: 'aniversario_bonus',
        plano: 'aniversario',
        titulo: 'Aniversário - Bônus de 1 Mês',
        cor: 'green',
        texto: 'Olá, *{{nome}}!*\n\nFeliz aniversário! Para comemorar com você, preparamos um *bônus de 1 mês de acesso*.\n\nEntre em contato para ativar seu presente.'
    }
];

const modelosLegadosSemAcento = {
    padrao_vencimento: {
        titulo: 'Aviso de Vencimento Proximo',
        texto: 'Ola, *{{nome}}!*\n\nPassando para avisar que seu plano *{{plano}}* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nPara renovar e continuar com acesso, entre em contato comigo.'
    },
    padrao_expirado: {
        titulo: 'Aviso de Plano Expirado',
        texto: 'Ola, *{{nome}}!*\n\nSeu plano *{{plano}}* venceu no dia *{{vencimento}}*.\n\nPara reativar seu acesso, entre em contato o quanto antes.'
    },
    mensal_vencimento: {
        titulo: 'Renovacao Mensal - Vencimento Proximo',
        texto: 'Ola, *{{nome}}!*\n\nSeu plano *mensal* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e continue com acesso sem interrupcoes.'
    },
    trimestral_vencimento: {
        titulo: 'Renovacao Trimestral - Vencimento Proximo',
        texto: 'Ola, *{{nome}}!*\n\nSeu plano *trimestral* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e garanta mais 3 meses de acesso.'
    },
    semestral_vencimento: {
        titulo: 'Renovacao Semestral - Vencimento Proximo',
        texto: 'Ola, *{{nome}}!*\n\nSeu plano *semestral* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e garanta mais 6 meses de acesso.'
    },
    anual_vencimento: {
        titulo: 'Renovacao Anual - Vencimento Proximo',
        texto: 'Ola, *{{nome}}!*\n\nSeu plano *anual* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nRenove agora e garanta mais 1 ano de acesso.'
    },
    aniversario_bonus: {
        titulo: 'Aniversario - Bonus de 1 Mes',
        texto: 'Ola, *{{nome}}!*\n\nFeliz aniversario! Para comemorar com voce, preparamos um *bonus de 1 mes de acesso*.\n\nEntre em contato para ativar seu presente.'
    }
};

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    }));
}

function limparTexto(valor) {
    return String(valor || '').trim();
}

function normalizarPlano(plano) {
    const valor = limparTexto(plano).toLowerCase();

    if (valor.includes('mensal')) return 'mensal';
    if (valor.includes('trimestral')) return 'trimestral';
    if (valor.includes('semestral')) return 'semestral';
    if (valor.includes('anual')) return 'anual';

    return valor || 'padrao';
}

async function garantirModelosPadrao() {
    for (const modelo of modelosPadrao) {
        await executar(
            `INSERT OR IGNORE INTO modelos_mensagem (chave, plano, titulo, texto, cor)
            VALUES (?, ?, ?, ?, ?)`,
            [modelo.chave, modelo.plano, modelo.titulo, modelo.texto, modelo.cor]
        );

        const legado = modelosLegadosSemAcento[modelo.chave];
        if (legado) {
            await executar(
                `UPDATE modelos_mensagem
                SET
                    titulo = CASE WHEN titulo = ? THEN ? ELSE titulo END,
                    texto = CASE WHEN texto = ? THEN ? ELSE texto END
                WHERE chave = ?
                    AND (titulo = ? OR texto = ?)`,
                [
                    legado.titulo,
                    modelo.titulo,
                    legado.texto,
                    modelo.texto,
                    modelo.chave,
                    legado.titulo,
                    legado.texto
                ]
            );
        }
    }
}

async function listarModelos() {
    await garantirModelosPadrao();

    return buscarTodos(
        `SELECT * FROM modelos_mensagem
        ORDER BY
            CASE plano
                WHEN 'mensal' THEN 1
                WHEN 'trimestral' THEN 2
                WHEN 'semestral' THEN 3
                WHEN 'anual' THEN 4
                WHEN 'padrao' THEN 5
                ELSE 6
            END,
            titulo ASC`
    );
}

async function buscarModeloPorId(id) {
    await garantirModelosPadrao();
    return buscarUm('SELECT * FROM modelos_mensagem WHERE id = ?', [id]);
}

async function salvarModelo(dados = {}) {
    const id = limparTexto(dados.id);
    const plano = normalizarPlano(dados.plano);
    const titulo = limparTexto(dados.titulo);
    const texto = limparTexto(dados.texto);
    const cor = limparTexto(dados.cor) || 'blue';

    if (!titulo) throw new Error('Informe o titulo do modelo.');
    if (!texto) throw new Error('Informe o texto da mensagem.');

    if (id) {
        await executar(
            `UPDATE modelos_mensagem SET
                plano = ?,
                titulo = ?,
                texto = ?,
                cor = ?,
                ativo = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [plano, titulo, texto, cor, dados.ativo === '0' ? 0 : 1, id]
        );

        return buscarModeloPorId(id);
    }

    const chave = `${plano}_${Date.now()}`;
    const resultado = await executar(
        `INSERT INTO modelos_mensagem (chave, plano, titulo, texto, cor, ativo)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [chave, plano, titulo, texto, cor, dados.ativo === '0' ? 0 : 1]
    );

    return buscarModeloPorId(resultado.id);
}

function removerModelo(id) {
    return executar('DELETE FROM modelos_mensagem WHERE id = ?', [id]);
}

function primeiroNome(nome) {
    return limparTexto(nome).split(/\s+/)[0] || 'cliente';
}

function formatarData(dataISO) {
    if (!dataISO) return '';

    const [ano, mes, dia] = dataISO.split('-');
    if (!ano || !mes || !dia) return dataISO;

    return `${dia}/${mes}/${ano}`;
}

function aplicarVariaveis(texto, variaveis) {
    return String(texto || '').replace(/\{\{(nome|plano|vencimento|dias|valor)\}\}/g, (_, chave) => {
        return variaveis[chave] ?? '';
    });
}

async function obterModeloPorChave(chave) {
    await garantirModelosPadrao();

    return buscarUm(
        `SELECT * FROM modelos_mensagem
        WHERE ativo = 1 AND chave = ?
        LIMIT 1`,
        [chave]
    );
}

async function obterModeloParaCliente(cliente, dias) {
    await garantirModelosPadrao();

    const plano = normalizarPlano(cliente.plano);
    const expirado = dias < 0;

    if (expirado) {
        return buscarUm(
            `SELECT * FROM modelos_mensagem
            WHERE ativo = 1 AND chave = 'padrao_expirado'
            LIMIT 1`
        );
    }

    return buscarUm(
        `SELECT * FROM modelos_mensagem
        WHERE ativo = 1 AND plano IN (?, 'padrao')
        ORDER BY CASE WHEN plano = ? THEN 0 ELSE 1 END, id ASC
        LIMIT 1`,
        [plano, plano]
    );
}

async function montarMensagemPorModelo(cliente, dias) {
    const modelo = await obterModeloParaCliente(cliente, dias);
    const variaveis = {
        nome: primeiroNome(cliente.nome),
        plano: cliente.plano || 'assinatura',
        vencimento: formatarData(cliente.vencimento),
        dias: Math.abs(dias),
        valor: cliente.valor || ''
    };

    return aplicarVariaveis(modelo?.texto || modelosPadrao[0].texto, variaveis);
}

async function montarMensagemAniversario(cliente) {
    const modelo = await obterModeloPorChave('aniversario_bonus');
    const variaveis = {
        nome: primeiroNome(cliente.nome),
        plano: cliente.plano || 'assinatura',
        vencimento: formatarData(cliente.vencimento),
        dias: '',
        valor: cliente.valorPlano || cliente.valor || ''
    };

    return aplicarVariaveis(modelo?.texto || modelosPadrao.find(item => item.chave === 'aniversario_bonus').texto, variaveis);
}

module.exports = {
    listarModelos,
    buscarModeloPorId,
    salvarModelo,
    removerModelo,
    montarMensagemPorModelo,
    montarMensagemAniversario,
    normalizarPlano,
    aplicarVariaveis,
    modelosPadrao
};
