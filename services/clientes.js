const db = require('../database/sqlite');

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

function normalizarTelefone(telefone) {
    const textoOriginal = limparTexto(telefone);
    let numeros = textoOriginal.replace(/\D/g, '');

    if (!numeros) return '';
    if (textoOriginal.includes('@lid') || (numeros.length > 13 && !numeros.startsWith('55'))) {
        return '';
    }
    if (numeros.startsWith('55') && numeros.length > 13) {
        numeros = `55${numeros.slice(-11)}`;
    }
    if (numeros.startsWith('55')) return numeros;

    return `55${numeros}`;
}

function normalizarLista(valor) {
    if (Array.isArray(valor)) return valor.map(limparTexto).filter(Boolean);
    if (!valor) return [];
    return [limparTexto(valor)].filter(Boolean);
}

function normalizarListaComVazios(valor) {
    if (Array.isArray(valor)) return valor.map(limparTexto);
    if (valor === undefined || valor === null) return [];
    return [limparTexto(valor)];
}

function serializarLista(valor) {
    return JSON.stringify(normalizarLista(valor));
}

function normalizarTags(valor) {
    const itens = Array.isArray(valor)
        ? valor
        : String(valor || '').split(',');

    return itens
        .map(limparTexto)
        .filter(Boolean)
        .join(', ');
}

function telefoneSemDdi(telefone) {
    const numeros = String(telefone || '').replace(/\D/g, '');
    if (numeros.startsWith('55') && numeros.length > 11) return numeros.slice(2);
    return numeros;
}

function normalizarMac(valor) {
    const limpo = limparTexto(valor)
        .replace(/[^a-fA-F0-9]/g, '')
        .toUpperCase()
        .slice(0, 12);

    return limpo.match(/.{1,2}/g)?.join(':') || '';
}

function normalizarMoeda(valor) {
    const texto = limparTexto(valor).replace(/[^\d,.-]/g, '');
    if (!texto) return '';

    const numero = texto.includes(',')
        ? Number(texto.replace(/\./g, '').replace(',', '.'))
        : Number(texto);

    if (!Number.isFinite(numero)) return '';

    return numero.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function normalizarAcessosApp(dados = {}) {
    const apps = normalizarListaComVazios(dados.acessoAppNome);
    const dispositivos = normalizarListaComVazios(dados.acessoDispositivo);
    const paineis = normalizarListaComVazios(dados.acessoPainel);
    const macs = normalizarListaComVazios(dados.acessoEnderecoMac);
    const ids = normalizarListaComVazios(dados.acessoIdAplicativo);
    const total = Math.max(apps.length, dispositivos.length, paineis.length, macs.length, ids.length);
    const acessos = [];

    for (let index = 0; index < total; index += 1) {
        const acesso = {
            app: limparTexto(apps[index]),
            dispositivo: limparTexto(dispositivos[index]),
            painel: limparTexto(paineis[index]),
            enderecoMac: normalizarMac(macs[index]),
            idAplicativo: limparTexto(ids[index])
        };

        if (acesso.app || acesso.dispositivo || acesso.painel || acesso.enderecoMac || acesso.idAplicativo) {
            acessos.push(acesso);
        }
    }

    if (!acessos.length && (limparTexto(dados.enderecoMac) || limparTexto(dados.idAplicativo))) {
        acessos.push({
            app: normalizarLista(dados.appsInstalados)[0] || '',
            dispositivo: normalizarLista(dados.dispositivosSelecionados)[0] || '',
            painel: normalizarLista(dados.paineisSelecionados)[0] || '',
            enderecoMac: normalizarMac(dados.enderecoMac),
            idAplicativo: limparTexto(dados.idAplicativo)
        });
    }

    return JSON.stringify(acessos);
}

function clienteEstaEmTeste(cliente = {}) {
    return String(cliente.status || '').toLowerCase() === 'teste'
        || String(cliente.plano || '').toLowerCase().includes('teste');
}

function gerarCredenciais() {
    const baseTempo = Date.now().toString(36).slice(-5);
    const aleatorio = Math.random().toString(36).slice(2, 5);

    return {
        usuario: `jp${baseTempo}${aleatorio}`.toLowerCase(),
        senha: Math.random().toString(36).slice(2, 8).toUpperCase()
    };
}

function montarCliente(dados = {}) {
    const ddi = limparTexto(dados.ddiTelefone).replace(/\D/g, '');
    let numero = limparTexto(dados.telefone).replace(/\D/g, '');

    if (ddi && numero.startsWith(ddi) && numero.length > 11) {
        numero = numero.slice(ddi.length);
    }

    const telefone = normalizarTelefone(ddi ? `${ddi}${numero}` : dados.telefone);

    if (!limparTexto(dados.nome)) {
        throw new Error('Informe o nome do cliente.');
    }

    if (!telefone) {
        throw new Error('Informe o telefone do cliente.');
    }

    return {
        nome: limparTexto(dados.nome),
        telefone,
        usuario: limparTexto(dados.usuario),
        senha: limparTexto(dados.senha),
        plano: limparTexto(dados.plano),
        aparelho: limparTexto(dados.aparelho),
        vencimento: limparTexto(dados.dataVencimento || dados.vencimento).slice(0, 10),
        nascimento: limparTexto(dados.nascimento),
        tipoPlanoId: limparTexto(dados.tipoPlanoId),
        diasContrato: Number(dados.diasContrato || 0),
        valorPlano: normalizarMoeda(dados.valorPlano),
        assinaturaApp: normalizarMoeda(dados.assinaturaApp),
        validadeApp: limparTexto(dados.validadeApp),
        horasTeste: limparTexto(dados.horasTeste),
        dataInicio: limparTexto(dados.dataInicio),
        dataVencimento: limparTexto(dados.dataVencimento),
        appsInstalados: serializarLista(dados.appsInstalados),
        dispositivosSelecionados: serializarLista(dados.dispositivosSelecionados),
        paineisSelecionados: serializarLista(dados.paineisSelecionados),
        appInstalado: dados.appInstalado ? 1 : 0,
        usuarioApp: limparTexto(dados.usuarioApp),
        senhaApp: limparTexto(dados.senhaApp),
        enderecoMac: normalizarMac(dados.enderecoMac),
        idAplicativo: limparTexto(dados.idAplicativo),
        acessosApp: normalizarAcessosApp(dados),
        observacoes: limparTexto(dados.observacoes),
        origem: limparTexto(dados.origem),
        tags: normalizarTags(dados.tags),
        status: limparTexto(dados.status) || 'ativo'
    };
}

function calcularVencimentoTeste() {
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 1);
    return vencimento.toISOString().slice(0, 10);
}

function parseValidadeTeste(valor) {
    const texto = limparTexto(valor).replace(/\s+às\s+/i, ' ').replace(/\s+as\s+/i, ' ');
    const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)?(\d{2})?:?(\d{2})?/);

    if (isoMatch) {
        const [, ano, mes, dia, horaBruta = '23', minutoBruto = '59'] = isoMatch;
        const vencimento = `${ano}-${mes}-${dia}`;

        return {
            vencimento,
            dataVencimento: `${vencimento}T${horaBruta || '23'}:${minutoBruto || '59'}`
        };
    }

    const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);

    if (!match) return {};

    const [, diaBruto, mesBruto, anoBruto, horaBruta = '23', minutoBruto = '59'] = match;
    const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
    const mes = mesBruto.padStart(2, '0');
    const dia = diaBruto.padStart(2, '0');
    const hora = horaBruta.padStart(2, '0');
    const minuto = minutoBruto.padStart(2, '0');
    const vencimento = `${ano}-${mes}-${dia}`;

    return {
        vencimento,
        dataVencimento: `${vencimento}T${hora}:${minuto}`
    };
}

async function cadastrarOuAtualizarCliente({ telefone, nome, aparelho, plano = 'Teste gratis' }) {
    const telefoneNormalizado = normalizarTelefone(telefone);
    const credenciais = gerarCredenciais();
    const vencimento = calcularVencimentoTeste();

    if (!telefoneNormalizado) return null;

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            limparTexto(nome) || 'Cliente',
            telefoneNormalizado,
            credenciais.usuario,
            credenciais.senha,
            plano,
            limparTexto(aparelho),
            vencimento,
            'teste'
        ]
    );

    return buscarClientePorId(resultado.id);
}
async function cadastrarClienteTesteParcial({ telefone, nome, aparelho }) {
    const telefoneNormalizado = normalizarTelefone(telefone);
    const nomeCliente = limparTexto(nome) || 'Cliente';
    const dispositivo = limparTexto(aparelho);
    const dispositivosSelecionados = dispositivo ? JSON.stringify([dispositivo]) : JSON.stringify([]);

    if (!telefoneNormalizado || !dispositivo) return null;

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, plano, aparelho, dispositivosSelecionados, status
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
            nomeCliente,
            telefoneNormalizado,
            'Teste grátis',
            dispositivo,
            dispositivosSelecionados,
            'teste'
        ]
    );

    return buscarClientePorId(resultado.id);
}
async function cadastrarTesteLiberadoPorAtendente(dados = {}) {
    const telefone = normalizarTelefone(dados.telefone);
    const nome = limparTexto(dados.nome);
    const aparelho = limparTexto(dados.aparelho);
    const aplicativo = limparTexto(dados.aplicativo);
    const painel = limparTexto(dados.painel);
    const usuario = limparTexto(dados.usuario);
    const senha = limparTexto(dados.senha);
    const validade = parseValidadeTeste(dados.validade);
    const inicio = parseValidadeTeste(dados.dataInicio);
    const dataInicio = inicio.dataVencimento || limparTexto(dados.dataInicio);

    if (!telefone || !nome || !aparelho || !usuario || !senha) {
        return null;
    }

    const vencimento = validade.vencimento || calcularVencimentoTeste();
    const dataVencimento = validade.dataVencimento || `${vencimento}T23:59`;
    const dispositivosSelecionados = JSON.stringify([aparelho]);
    const appsInstalados = aplicativo ? JSON.stringify([aplicativo]) : JSON.stringify([]);
    const paineisSelecionados = painel ? JSON.stringify([painel]) : JSON.stringify([]);
    const clienteExistente = await buscarClienteTestePorTelefone(telefone);

    if (clienteExistente?.id) {
        await executar(
            `UPDATE clientes SET
                nome = ?,
                telefone = ?,
                usuario = ?,
                senha = ?,
                plano = ?,
                aparelho = ?,
                vencimento = ?,
                dataInicio = COALESCE(NULLIF(?, ''), dataInicio, CURRENT_TIMESTAMP),
                dataVencimento = ?,
                appsInstalados = ?,
                dispositivosSelecionados = ?,
                paineisSelecionados = ?,
                appInstalado = ?,
                status = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
                nome,
                telefone,
                usuario,
                senha,
                'Teste grátis',
                aparelho,
                vencimento,
                dataInicio,
                dataVencimento,
                appsInstalados,
                dispositivosSelecionados,
                paineisSelecionados,
                aplicativo ? 1 : 0,
                'teste',
                clienteExistente.id
            ]
        );

        return buscarClientePorId(clienteExistente.id);
    }

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento,
            dataInicio, dataVencimento, appsInstalados, dispositivosSelecionados,
            paineisSelecionados, appInstalado, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?)`,
        [
            nome,
            telefone,
            usuario,
            senha,
            'Teste grátis',
            aparelho,
            vencimento,
            dataInicio,
            dataVencimento,
            appsInstalados,
            dispositivosSelecionados,
            paineisSelecionados,
            aplicativo ? 1 : 0,
            'teste'
        ]
    );

    return buscarClientePorId(resultado.id);
}
function buscarClientePorTelefone(telefone) {
    return buscarUm(
        `SELECT * FROM clientes
        WHERE telefone = ?
        ORDER BY
            CASE WHEN status = 'teste' OR plano LIKE '%Teste%' THEN 1 ELSE 0 END ASC,
            datetime(atualizadoEm) DESC,
            id DESC
        LIMIT 1`,
        [normalizarTelefone(telefone)]
    );
}

function buscarClienteTestePorTelefone(telefone) {
    return buscarUm(
        `SELECT * FROM clientes
        WHERE telefone = ?
            AND (status = 'teste' OR plano LIKE '%Teste%')
        ORDER BY datetime(atualizadoEm) DESC, id DESC
        LIMIT 1`,
        [normalizarTelefone(telefone)]
    );
}

function buscarClientePorNomeOuTelefone(valor) {
    const termo = `%${valor}%`;

    return buscarUm(
        `SELECT * FROM clientes
        WHERE telefone LIKE ?
            OR nome LIKE ?
            OR usuario LIKE ?
            OR usuarioApp LIKE ?
            OR paineisSelecionados LIKE ?
        ORDER BY atualizadoEm DESC
        LIMIT 1`,
        [termo, termo, termo, termo, termo]
    );
}

function buscarClientePorUsuarioIPTV(usuario) {
    return buscarUm('SELECT * FROM clientes WHERE usuario = ? LIMIT 1', [limparTexto(usuario)]);
}

async function atualizarStatusAutomaticoClientes() {
    const agora = agoraSaoPauloISO();

    await executar(
        `UPDATE clientes SET
            status = 'expirado',
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE status IN ('ativo', 'pendente', 'teste')
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND datetime(replace(COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59'), 'T', ' ')) < datetime(replace(?, 'T', ' '))`,
        [agora]
    );

    await executar(
        `UPDATE clientes SET
            status = 'ativo',
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE status = 'expirado'
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND datetime(replace(COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59'), 'T', ' ')) >= datetime(replace(?, 'T', ' '))`,
        [agora]
    );
}

async function listarClientes(filtros = {}) {
    await atualizarStatusAutomaticoClientes();

    const busca = limparTexto(filtros.busca);
    const status = limparTexto(filtros.status);
    const params = [];
    const where = [];

    if (busca) {
        where.push('(nome LIKE ? OR telefone LIKE ? OR usuario LIKE ? OR usuarioApp LIKE ? OR plano LIKE ? OR origem LIKE ? OR tags LIKE ?)');
        const termo = `%${busca}%`;
        params.push(termo, termo, termo, termo, termo, termo, termo);
    }

    if (status) {
        where.push('status = ?');
        params.push(status);
    }

    if (limparTexto(filtros.origem)) {
        where.push('origem LIKE ?');
        params.push(`%${limparTexto(filtros.origem)}%`);
    }

    if (limparTexto(filtros.tag)) {
        where.push('tags LIKE ?');
        params.push(`%${limparTexto(filtros.tag)}%`);
    }

    const limite = Number(filtros.limite || 0);
    const limiteSql = limite > 0 ? 'LIMIT ?' : '';
    if (limite > 0) params.push(limite);

    return buscarTodos(
        `SELECT * FROM clientes
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY nome COLLATE NOCASE ASC
        ${limiteSql}`,
        params
    );
}

async function salvarCliente(dados) {
    const cliente = montarCliente(dados);
    const idCliente = Number.parseInt(dados.id, 10);

    if (Number.isFinite(idCliente) && idCliente > 0) {
        const resultado = await executar(
            `UPDATE clientes SET
                nome = ?,
                telefone = ?,
                usuario = ?,
                senha = ?,
                plano = ?,
                aparelho = ?,
                vencimento = ?,
                nascimento = ?,
                tipoPlanoId = ?,
                diasContrato = ?,
                valorPlano = ?,
                assinaturaApp = ?,
                validadeApp = ?,
                horasTeste = ?,
                dataInicio = ?,
                dataVencimento = ?,
                appsInstalados = ?,
                dispositivosSelecionados = ?,
                paineisSelecionados = ?,
                appInstalado = ?,
                usuarioApp = ?,
                senhaApp = ?,
                enderecoMac = ?,
                idAplicativo = ?,
                acessosApp = ?,
                observacoes = ?,
                origem = ?,
                tags = ?,
                status = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
                cliente.nome,
                cliente.telefone,
                cliente.usuario,
                cliente.senha,
                cliente.plano,
                cliente.aparelho,
                cliente.vencimento,
                cliente.nascimento,
                cliente.tipoPlanoId,
                cliente.diasContrato,
                cliente.valorPlano,
                cliente.assinaturaApp,
                cliente.validadeApp,
                cliente.horasTeste,
                cliente.dataInicio,
                cliente.dataVencimento,
                cliente.appsInstalados,
                cliente.dispositivosSelecionados,
                cliente.paineisSelecionados,
                cliente.appInstalado,
                cliente.usuarioApp,
                cliente.senhaApp,
                cliente.enderecoMac,
                cliente.idAplicativo,
                cliente.acessosApp,
                cliente.observacoes,
                cliente.origem,
                cliente.tags,
                cliente.status,
                idCliente
            ]
        );

        if (!resultado.changes) {
            throw new Error(`Cliente ${idCliente} nao foi encontrado para atualizacao.`);
        }

        return buscarClientePorId(idCliente);
    }

    const credenciais = gerarCredenciais();

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento,
            nascimento, tipoPlanoId, diasContrato, valorPlano, assinaturaApp,
            validadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
            dispositivosSelecionados, paineisSelecionados, appInstalado,
            usuarioApp, senhaApp, enderecoMac, idAplicativo, acessosApp, observacoes, origem, tags, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            cliente.nome,
            cliente.telefone,
            cliente.usuario || credenciais.usuario,
            cliente.senha || credenciais.senha,
            cliente.plano,
            cliente.aparelho,
            cliente.vencimento,
            cliente.nascimento,
            cliente.tipoPlanoId,
            cliente.diasContrato,
            cliente.valorPlano,
            cliente.assinaturaApp,
            cliente.validadeApp,
            cliente.horasTeste,
            cliente.dataInicio,
            cliente.dataVencimento,
            cliente.appsInstalados,
            cliente.dispositivosSelecionados,
            cliente.paineisSelecionados,
            cliente.appInstalado,
            cliente.usuarioApp,
            cliente.senhaApp,
            cliente.enderecoMac,
            cliente.idAplicativo,
            cliente.acessosApp,
            cliente.observacoes,
            cliente.origem,
            cliente.tags,
            cliente.status
        ]
    );

    return buscarClientePorId(resultado.id);
}

function buscarClientePorId(id) {
    return buscarUm('SELECT * FROM clientes WHERE id = ?', [id]);
}

function removerCliente(id) {
    return executar('DELETE FROM clientes WHERE id = ?', [id]);
}

function listarNotasCliente(clienteId) {
    return buscarTodos(
        `SELECT * FROM cliente_notas
        WHERE clienteId = ?
        ORDER BY datetime(criadoEm) DESC, id DESC`,
        [clienteId]
    );
}

async function adicionarNotaCliente(clienteId, texto) {
    const conteudo = limparTexto(texto);
    if (!conteudo) {
        throw new Error('Informe a nota do atendimento.');
    }

    await executar(
        `INSERT INTO cliente_notas (clienteId, texto)
        VALUES (?, ?)`,
        [clienteId, conteudo]
    );

    await executar(
        `UPDATE clientes SET atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [clienteId]
    );
}

function buscarAlertasCadastroCliente(dados = {}) {
    const idAtual = limparTexto(dados.id);
    const nome = limparTexto(dados.nome);
    const telefone = normalizarTelefone(dados.ddiTelefone ? `${dados.ddiTelefone}${dados.telefone}` : dados.telefone);
    const telefoneCurto = telefoneSemDdi(telefone);
    const params = [];
    const condicoes = [];

    if (telefoneCurto) {
        condicoes.push("replace(replace(replace(replace(telefone, '+', ''), '-', ''), ' ', ''), '(', '') LIKE ?");
        params.push(`%${telefoneCurto}`);
    }

    if (nome) {
        condicoes.push('nome LIKE ?');
        params.push(`%${nome}%`);
    }

    if (!condicoes.length) return Promise.resolve([]);

    const filtroId = idAtual ? 'AND id != ?' : '';
    if (idAtual) params.push(idAtual);

    return buscarTodos(
        `SELECT
            clientes.*,
            (
                SELECT texto FROM cliente_notas
                WHERE cliente_notas.clienteId = clientes.id
                ORDER BY datetime(criadoEm) DESC, id DESC
                LIMIT 1
            ) AS ultimaNota
        FROM clientes
        WHERE (${condicoes.join(' OR ')})
            ${filtroId}
            AND (
                tags LIKE '%Problematico%'
                OR tags LIKE '%Problemático%'
                OR status IN ('suspenso', 'cancelado')
            )
        ORDER BY datetime(atualizadoEm) DESC, id DESC
        LIMIT 5`,
        params
    );
}

function listarClientesParaAviso(dataLimite) {
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `SELECT * FROM clientes
        WHERE status IN ('ativo', 'teste', 'pendente', 'expirado')
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND date(vencimento) <= date(?)
            AND (
                ultimoAvisoRenovacao IS NULL
                OR ultimoAvisoRenovacao != vencimento
            )
        ORDER BY vencimento ASC`,
        [dataLimite]
    ));
}

function hojeSaoPauloISO() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function agoraSaoPauloISO() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(new Date());

    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}`;
}

function listarClientesParaAvisosProgramados() {
    const hoje = hojeSaoPauloISO();

    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                CAST(julianday(date(vencimento)) - julianday(date(?)) AS INTEGER) AS diasAntes
            FROM clientes
            WHERE status IN ('ativo', 'teste', 'pendente')
                AND vencimento IS NOT NULL
                AND vencimento != ''
        )
        SELECT * FROM candidatos
        WHERE diasAntes IN (0, 1, 2)
            AND NOT EXISTS (
                SELECT 1 FROM avisos_renovacao
                WHERE avisos_renovacao.clienteId = candidatos.id
                    AND avisos_renovacao.vencimento = candidatos.vencimento
                    AND avisos_renovacao.diasAntes = candidatos.diasAntes
            )
        ORDER BY diasAntes DESC, nome ASC`,
        [hoje]
    ));
}

function listarTestesGratisParaAvisoPorHorario(agoraIso, limiteIso, codigoAviso) {
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59') AS vencimentoEfetivo
            FROM clientes
            WHERE (status = 'teste' OR plano LIKE '%Teste%')
                AND vencimento IS NOT NULL
                AND vencimento != ''
        )
        SELECT * FROM candidatos
        WHERE datetime(replace(vencimentoEfetivo, 'T', ' ')) > datetime(replace(?, 'T', ' '))
            AND datetime(replace(vencimentoEfetivo, 'T', ' ')) <= datetime(replace(?, 'T', ' '))
            AND NOT EXISTS (
                SELECT 1 FROM avisos_renovacao
                WHERE avisos_renovacao.clienteId = candidatos.id
                    AND avisos_renovacao.vencimento = candidatos.vencimentoEfetivo
                    AND avisos_renovacao.diasAntes = ?
            )
        ORDER BY vencimentoEfetivo ASC, nome ASC`,
        [agoraIso, limiteIso, Number(codigoAviso)]
    ));
}

function listarTestesGratisExpiradosParaAviso(agoraIso, codigoAviso) {
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59') AS vencimentoEfetivo
            FROM clientes
            WHERE (status = 'teste' OR plano LIKE '%Teste%')
                AND vencimento IS NOT NULL
                AND vencimento != ''
        )
        SELECT * FROM candidatos
        WHERE datetime(replace(vencimentoEfetivo, 'T', ' ')) <= datetime(replace(?, 'T', ' '))
            AND NOT EXISTS (
                SELECT 1 FROM avisos_renovacao
                WHERE avisos_renovacao.clienteId = candidatos.id
                    AND avisos_renovacao.vencimento = candidatos.vencimentoEfetivo
                    AND avisos_renovacao.diasAntes = ?
            )
        ORDER BY vencimentoEfetivo ASC, nome ASC`,
        [agoraIso, Number(codigoAviso)]
    ));
}

function listarClientesParaAvisoAntigo(dataLimite) {
    return buscarTodos(
        `SELECT * FROM clientes
        WHERE status IN ('ativo', 'teste')
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND date(vencimento) <= date(?)
            AND (
                ultimoAvisoRenovacao IS NULL
                OR ultimoAvisoRenovacao != vencimento
            )
        ORDER BY vencimento ASC`,
        [dataLimite]
    );
}

function listarClientesAniversarioHoje(ano) {
    const hoje = new Date();
    const mesDia = hoje.toISOString().slice(5, 10);

    return buscarTodos(
        `SELECT * FROM clientes
        WHERE nascimento IS NOT NULL
            AND nascimento != ''
            AND substr(nascimento, 6, 5) = ?
            AND status NOT IN ('cancelado', 'suspenso')
            AND (
                ultimoAvisoAniversario IS NULL
                OR ultimoAvisoAniversario != ?
            )
        ORDER BY nome ASC`,
        [mesDia, String(ano)]
    );
}

function registrarAvisoRenovacao(id, vencimento) {
    return executar(
        `UPDATE clientes SET
            ultimoAvisoRenovacao = ?,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [vencimento, id]
    );
}

async function registrarAvisoRenovacaoProgramado(id, vencimento, diasAntes) {
    await executar(
        `INSERT OR IGNORE INTO avisos_renovacao (clienteId, vencimento, diasAntes)
        VALUES (?, ?, ?)`,
        [id, vencimento, Number(diasAntes)]
    );

    return registrarAvisoRenovacao(id, `${vencimento}:${diasAntes}`);
}

function registrarAvisoAniversario(id, ano) {
    return executar(
        `UPDATE clientes SET
            ultimoAvisoAniversario = ?,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [String(ano), id]
    );
}

module.exports = {
    cadastrarOuAtualizarCliente,
    buscarClientePorTelefone,
    buscarClientePorNomeOuTelefone,
    buscarClientePorUsuarioIPTV,
    cadastrarClienteTesteParcial,
    cadastrarTesteLiberadoPorAtendente,
    listarClientes,
    salvarCliente,
    buscarClientePorId,
    removerCliente,
    listarNotasCliente,
    adicionarNotaCliente,
    buscarAlertasCadastroCliente,
    listarClientesParaAviso,
    listarClientesParaAvisosProgramados,
    listarTestesGratisParaAvisoPorHorario,
    listarTestesGratisExpiradosParaAviso,
    listarClientesAniversarioHoje,
    registrarAvisoRenovacao,
    registrarAvisoRenovacaoProgramado,
    registrarAvisoAniversario,
    atualizarStatusAutomaticoClientes,
    normalizarTelefone
};
