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

function moedaParaNumero(valor) {
    const texto = limparTexto(valor).replace(/[^\d,.-]/g, '');
    if (!texto) return 0;

    const normalizado = texto.includes(',')
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto;
    const numero = Number(normalizado);

    return Number.isFinite(numero) ? numero : 0;
}

function normalizarAcessosApp(dados = {}) {
    const apps = normalizarListaComVazios(dados.acessoAppNome);
    const dispositivos = normalizarListaComVazios(dados.acessoDispositivo);
    const paineis = normalizarListaComVazios(dados.acessoPainel);
    const locais = normalizarListaComVazios(dados.acessoLocalInstalacao);
    const urls = normalizarListaComVazios(dados.acessoUrlAtivarAplicativo);
    const macs = normalizarListaComVazios(dados.acessoEnderecoMac);
    const ids = normalizarListaComVazios(dados.acessoIdAplicativo);
    const usuarios = normalizarListaComVazios(dados.acessoUsuario);
    const senhas = normalizarListaComVazios(dados.acessoSenha);
    const total = Math.max(apps.length, dispositivos.length, paineis.length, locais.length, urls.length, macs.length, ids.length, usuarios.length, senhas.length);
    const acessos = [];

    for (let index = 0; index < total; index += 1) {
        const acesso = {
            app: limparTexto(apps[index]),
            dispositivo: limparTexto(dispositivos[index]),
            painel: limparTexto(paineis[index]),
            usuario: limparTexto(usuarios[index]),
            senha: limparTexto(senhas[index]),
            localInstalacao: limparTexto(locais[index]),
            urlAtivarAplicativo: limparTexto(urls[index]),
            enderecoMac: normalizarMac(macs[index]),
            idAplicativo: limparTexto(ids[index])
        };

        if (acesso.app || acesso.dispositivo || acesso.painel || acesso.usuario || acesso.senha || acesso.localInstalacao || acesso.urlAtivarAplicativo || acesso.enderecoMac || acesso.idAplicativo) {
            acessos.push(acesso);
        }
    }

    if (!acessos.length && (limparTexto(dados.enderecoMac) || limparTexto(dados.idAplicativo))) {
        acessos.push({
            app: normalizarLista(dados.appsInstalados)[0] || '',
            dispositivo: normalizarLista(dados.dispositivosSelecionados)[0] || '',
            painel: normalizarLista(dados.paineisSelecionados)[0] || '',
            usuario: limparTexto(dados.usuario),
            senha: limparTexto(dados.senha),
            localInstalacao: '',
            urlAtivarAplicativo: '',
            enderecoMac: normalizarMac(dados.enderecoMac),
            idAplicativo: limparTexto(dados.idAplicativo)
        });
    }

    return JSON.stringify(acessos);
}

function acessosDoCliente(dados = {}) {
    const acessos = JSON.parse(normalizarAcessosApp(dados));
    return Array.isArray(acessos) ? acessos : [];
}

function listaUnicaComAcessos(lista, acessos, campo) {
    const valores = [
        ...normalizarLista(lista),
        ...acessos.map(acesso => acesso[campo])
    ]
        .map(limparTexto)
        .filter(Boolean);

    return JSON.stringify([...new Set(valores)]);
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

    const acessos = acessosDoCliente(dados);
    const acessosApp = JSON.stringify(acessos);

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
        dataValidadeApp: limparTexto(dados.dataValidadeApp),
        horasTeste: limparTexto(dados.horasTeste),
        dataInicio: limparTexto(dados.dataInicio),
        dataVencimento: limparTexto(dados.dataVencimento),
        appsInstalados: listaUnicaComAcessos(dados.appsInstalados, acessos, 'app'),
        dispositivosSelecionados: listaUnicaComAcessos(dados.dispositivosSelecionados, acessos, 'dispositivo'),
        paineisSelecionados: listaUnicaComAcessos(dados.paineisSelecionados, acessos, 'painel'),
        conexoesPainel: Math.max(0, Number.parseInt(dados.conexoesPainel || 0, 10) || 0),
        appInstalado: dados.appInstalado ? 1 : 0,
        usuarioApp: limparTexto(dados.usuarioApp),
        senhaApp: limparTexto(dados.senhaApp),
        enderecoMac: normalizarMac(dados.enderecoMac),
        idAplicativo: limparTexto(dados.idAplicativo),
        acessosApp,
        observacoes: limparTexto(dados.observacoes),
        origem: limparTexto(dados.origem),
        tags: normalizarTags(dados.tags),
        bonusMeses: Math.max(0, Number.parseInt(dados.bonusMeses || 0, 10) || 0),
        status: limparTexto(dados.status) || 'ativo'
    };
}

function dataBaseBonus(cliente = {}) {
    const valor = cliente.dataVencimento || cliente.vencimento || '';
    const texto = String(valor || '').trim();
    const data = texto
        ? new Date(texto.length <= 10 ? `${texto}T23:59:00` : texto)
        : new Date();

    const agora = new Date();
    if (Number.isNaN(data.getTime()) || data < agora) return agora;
    return data;
}

function adicionarMesesData(dataBase, meses) {
    const data = new Date(dataBase.getTime());
    const diaOriginal = data.getDate();

    data.setMonth(data.getMonth() + Number(meses || 0));

    if (data.getDate() !== diaOriginal) {
        data.setDate(0);
    }

    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');

    return {
        vencimento: `${ano}-${mes}-${dia}`,
        dataVencimento: `${ano}-${mes}-${dia}T${hora}:${minuto}`
    };
}

function dataParaCampos(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');

    return {
        vencimento: `${ano}-${mes}-${dia}`,
        dataVencimento: `${ano}-${mes}-${dia}T${hora}:${minuto}`
    };
}

function adicionarDiasData(dataBase, dias) {
    const data = new Date(dataBase.getTime());
    data.setDate(data.getDate() + Number(dias || 0));
    return dataParaCampos(data);
}

function mesesPorDiasContrato(dias) {
    const mapa = {
        30: 1,
        90: 3,
        180: 6,
        365: 12
    };

    return mapa[Number(dias || 0)] || 0;
}

function adicionarPeriodoContrato(dataBase, dias) {
    const meses = mesesPorDiasContrato(dias);

    if (meses) {
        return adicionarMesesData(dataBase, meses);
    }

    return adicionarDiasData(dataBase, dias);
}

function dataBaseRenovacao(cliente = {}) {
    const valor = cliente.dataVencimento || cliente.vencimento || '';
    const data = valor
        ? new Date(String(valor).length <= 10 ? `${valor}T23:59:00` : valor)
        : new Date();
    const agora = new Date();

    if (Number.isNaN(data.getTime()) || data < agora) return agora;
    return data;
}

function agoraLocalInput() {
    const data = new Date();
    data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
    return data.toISOString().slice(0, 16);
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

    const clienteExistente = await buscarClienteTestePorTelefone(telefoneNormalizado);

    if (clienteExistente?.id) {
        await executar(
            `UPDATE clientes SET
                nome = ?,
                telefone = ?,
                plano = ?,
                aparelho = ?,
                dispositivosSelecionados = ?,
                status = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
                nomeCliente,
                telefoneNormalizado,
                'Teste grátis',
                dispositivo,
                dispositivosSelecionados,
                'teste',
                clienteExistente.id
            ]
        );

        return buscarClientePorId(clienteExistente.id);
    }

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
                conexoesPainel = ?,
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
                0,
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

    if (status === 'inadimplente') {
        where.push("status = 'expirado' AND (plano IS NULL OR plano NOT LIKE ?)");
        params.push('%Teste%');
    } else if (status) {
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
                dataValidadeApp = ?,
                horasTeste = ?,
                dataInicio = ?,
                dataVencimento = ?,
                appsInstalados = ?,
                dispositivosSelecionados = ?,
                paineisSelecionados = ?,
                conexoesPainel = ?,
                appInstalado = ?,
                usuarioApp = ?,
                senhaApp = ?,
                enderecoMac = ?,
                idAplicativo = ?,
                acessosApp = ?,
                observacoes = ?,
                origem = ?,
                tags = ?,
                bonusMeses = ?,
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
                cliente.dataValidadeApp,
                cliente.horasTeste,
                cliente.dataInicio,
                cliente.dataVencimento,
                cliente.appsInstalados,
                cliente.dispositivosSelecionados,
                cliente.paineisSelecionados,
                cliente.conexoesPainel,
                cliente.appInstalado,
                cliente.usuarioApp,
                cliente.senhaApp,
                cliente.enderecoMac,
                cliente.idAplicativo,
                cliente.acessosApp,
                cliente.observacoes,
                cliente.origem,
                cliente.tags,
                cliente.bonusMeses,
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
            validadeApp, dataValidadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
            dispositivosSelecionados, paineisSelecionados, conexoesPainel, appInstalado,
            usuarioApp, senhaApp, enderecoMac, idAplicativo, acessosApp, observacoes, origem, tags, bonusMeses, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            cliente.dataValidadeApp,
            cliente.horasTeste,
            cliente.dataInicio,
            cliente.dataVencimento,
            cliente.appsInstalados,
            cliente.dispositivosSelecionados,
            cliente.paineisSelecionados,
            cliente.conexoesPainel,
            cliente.appInstalado,
            cliente.usuarioApp,
            cliente.senhaApp,
            cliente.enderecoMac,
            cliente.idAplicativo,
            cliente.acessosApp,
            cliente.observacoes,
            cliente.origem,
            cliente.tags,
            cliente.bonusMeses,
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

async function aplicarBonusCliente(id, quantidade = 1) {
    const meses = Number.parseInt(quantidade, 10);
    if (!Number.isFinite(meses) || meses <= 0) {
        throw new Error('Informe a quantidade de bonus a aplicar.');
    }

    const cliente = await buscarClientePorId(id);
    if (!cliente) {
        throw new Error('Cliente nao encontrado.');
    }

    const saldo = Number.parseInt(cliente.bonusMeses || 0, 10) || 0;
    if (saldo < meses) {
        throw new Error(`Saldo de bonus insuficiente. Disponivel: ${saldo}.`);
    }

    const vencimentoAtualizado = adicionarMesesData(dataBaseBonus(cliente), meses);
    const saldoRestante = saldo - meses;

    await executar(
        `UPDATE clientes SET
            bonusMeses = ?,
            vencimento = ?,
            dataVencimento = ?,
            status = CASE WHEN status = 'expirado' THEN 'ativo' ELSE status END,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [saldoRestante, vencimentoAtualizado.vencimento, vencimentoAtualizado.dataVencimento, id]
    );

    await adicionarNotaCliente(
        id,
        `Bonus aplicado: ${meses} mes(es). Novo vencimento: ${vencimentoAtualizado.dataVencimento}. Saldo restante: ${saldoRestante}.`
    );

    return {
        cliente: await buscarClientePorId(id),
        meses,
        saldoAnterior: saldo,
        saldoRestante,
        ...vencimentoAtualizado
    };
}

async function registrarBonusAniversario(id, ano) {
    await executar(
        `UPDATE clientes SET
            bonusMeses = COALESCE(bonusMeses, 0) + 1,
            ultimoAvisoAniversario = ?,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [String(ano), id]
    );

    await adicionarNotaCliente(id, `Bonus de aniversario adicionado automaticamente: 1 mes (${ano}).`);
    return buscarClientePorId(id);
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

function listarPagamentosCliente(clienteId) {
    return buscarTodos(
        `SELECT * FROM cliente_pagamentos
        WHERE clienteId = ?
            AND (excluidoEm IS NULL OR excluidoEm = '')
        ORDER BY datetime(criadoEm) DESC, id DESC`,
        [clienteId]
    );
}

function buscarPagamentoCliente(clienteId, pagamentoId) {
    return buscarUm(
        `SELECT * FROM cliente_pagamentos
        WHERE id = ?
            AND clienteId = ?
            AND (excluidoEm IS NULL OR excluidoEm = '')`,
        [pagamentoId, clienteId]
    );
}

function listarReceitaMensalFinanceira() {
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `SELECT
            clientes.*,
            (
                SELECT COUNT(*)
                FROM cliente_pagamentos pagamentosTotal
                WHERE pagamentosTotal.clienteId = clientes.id
            ) AS totalPagamentos,
            pagamento.plano AS pagamentoPlano,
            pagamento.diasContrato AS pagamentoDiasContrato,
            pagamento.valorPlano AS pagamentoValorPlano,
            pagamento.assinaturaApp AS pagamentoAssinaturaApp
        FROM clientes
        LEFT JOIN cliente_pagamentos pagamento
            ON pagamento.id = (
                SELECT pagamentoAtual.id
                FROM cliente_pagamentos pagamentoAtual
                WHERE pagamentoAtual.clienteId = clientes.id
                    AND (pagamentoAtual.excluidoEm IS NULL OR pagamentoAtual.excluidoEm = '')
                ORDER BY datetime(COALESCE(NULLIF(pagamentoAtual.dataPagamento, ''), pagamentoAtual.criadoEm)) DESC, pagamentoAtual.id DESC
                LIMIT 1
            )
        WHERE clientes.status = 'ativo'
            AND clientes.plano NOT LIKE '%Teste%'
        ORDER BY clientes.nome COLLATE NOCASE ASC`
    ));
}

function listarPagamentosFinanceiro(filtros = {}) {
    const status = limparTexto(filtros.status || 'validos');
    const mes = limparTexto(filtros.mes);
    const dataInicio = limparTexto(filtros.dataInicio);
    const dataFim = limparTexto(filtros.dataFim);
    const busca = limparTexto(filtros.busca);
    const params = [];
    const where = [];
    const campoData = "COALESCE(NULLIF(pagamento.dataPagamento, ''), pagamento.criadoEm)";

    if (status === 'removidos') {
        where.push("pagamento.excluidoEm IS NOT NULL AND pagamento.excluidoEm != ''");
    } else if (status === 'todos') {
        // Sem filtro de status.
    } else {
        where.push("(pagamento.excluidoEm IS NULL OR pagamento.excluidoEm = '')");
    }

    if (dataInicio) {
        where.push(`date(${campoData}) >= date(?)`);
        params.push(dataInicio.slice(0, 10));
    }

    if (dataFim) {
        where.push(`date(${campoData}) <= date(?)`);
        params.push(dataFim.slice(0, 10));
    }

    if (!dataInicio && !dataFim && mes) {
        where.push(`substr(${campoData}, 1, 7) = ?`);
        params.push(mes.slice(0, 7));
    }

    if (busca) {
        where.push('(clientes.nome LIKE ? OR clientes.telefone LIKE ? OR pagamento.plano LIKE ? OR pagamento.formaPagamento LIKE ?)');
        const termo = `%${busca}%`;
        params.push(termo, termo, termo, termo);
    }

    return buscarTodos(
        `SELECT
            pagamento.*,
            clientes.nome AS clienteNome,
            clientes.telefone AS clienteTelefone,
            clientes.status AS clienteStatus
        FROM cliente_pagamentos pagamento
        INNER JOIN clientes ON clientes.id = pagamento.clienteId
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY datetime(COALESCE(NULLIF(pagamento.dataPagamento, ''), pagamento.criadoEm)) DESC, pagamento.id DESC`,
        params
    );
}

async function renovarCliente(dados = {}) {
    const clienteId = Number.parseInt(dados.clienteId || dados.id, 10);
    if (!clienteId) {
        throw new Error('Cliente invalido para renovacao.');
    }

    const cliente = await buscarClientePorId(clienteId);
    if (!cliente) {
        throw new Error('Cliente nao encontrado.');
    }

    const plano = limparTexto(dados.plano);
    const tipoPlanoId = limparTexto(dados.tipoPlanoId);
    const diasContrato = Number.parseInt(dados.diasContrato || 0, 10);
    const valorPlano = normalizarMoeda(dados.valorPlano);
    const assinaturaApp = normalizarMoeda(dados.assinaturaApp);
    const formaPagamento = limparTexto(dados.formaPagamento);
    const dataPagamento = limparTexto(dados.dataPagamento) || agoraLocalInput();

    if (!plano) {
        throw new Error('Escolha o plano da renovacao.');
    }

    if (!diasContrato || diasContrato <= 0) {
        throw new Error('O plano escolhido precisa ter dias de contrato.');
    }

    if (!formaPagamento) {
        throw new Error('Informe a forma de pagamento.');
    }

    const base = dataBaseRenovacao(cliente);
    const inicioRenovacao = dataParaCampos(base).dataVencimento;
    const vencimentoAnterior = cliente.dataVencimento || cliente.vencimento || '';
    const vencimentoNovo = adicionarPeriodoContrato(base, diasContrato);
    const total = moedaParaNumero(valorPlano) + moedaParaNumero(assinaturaApp);
    const valorTotal = normalizarMoeda(total.toFixed(2));

    await executar(
        `UPDATE clientes SET
            plano = ?,
            tipoPlanoId = ?,
            diasContrato = ?,
            valorPlano = ?,
            assinaturaApp = ?,
            dataInicio = ?,
            vencimento = ?,
            dataVencimento = ?,
            status = 'ativo',
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
            plano,
            tipoPlanoId,
            diasContrato,
            valorPlano,
            assinaturaApp,
            inicioRenovacao,
            vencimentoNovo.vencimento,
            vencimentoNovo.dataVencimento,
            clienteId
        ]
    );

    const pagamento = await executar(
        `INSERT INTO cliente_pagamentos (
            clienteId, tipoPlanoId, plano, diasContrato, valorPlano, assinaturaApp,
            valorTotal, formaPagamento, dataPagamento, vencimentoAnterior,
            vencimentoNovo, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            clienteId,
            tipoPlanoId,
            plano,
            diasContrato,
            valorPlano,
            assinaturaApp,
            valorTotal,
            formaPagamento,
            dataPagamento,
            vencimentoAnterior,
            vencimentoNovo.dataVencimento,
            limparTexto(dados.observacoes)
        ]
    );

    await adicionarNotaCliente(
        clienteId,
        `Renovacao registrada: ${plano}, ${diasContrato} dias, R$ ${valorTotal}, pagamento ${formaPagamento}. Novo vencimento: ${vencimentoNovo.dataVencimento}.`
    );

    return {
        cliente: await buscarClientePorId(clienteId),
        pagamentoId: pagamento.id,
        plano,
        diasContrato,
        valorPlano,
        assinaturaApp,
        valorTotal,
        formaPagamento,
        dataPagamento,
        vencimentoAnterior,
        vencimentoNovo: vencimentoNovo.dataVencimento
    };
}

function marcarPagamentoMensagem(pagamentoId, enviado, erro = '') {
    return executar(
        `UPDATE cliente_pagamentos SET
            mensagemEnviada = ?,
            erroMensagem = ?
        WHERE id = ?`,
        [enviado ? 1 : 0, limparTexto(erro), pagamentoId]
    );
}

async function removerPagamentoCliente(clienteId, pagamentoId) {
    const pagamento = await buscarUm(
        'SELECT * FROM cliente_pagamentos WHERE id = ? AND clienteId = ?',
        [pagamentoId, clienteId]
    );

    if (!pagamento) {
        throw new Error('Pagamento nao encontrado no historico deste cliente.');
    }

    await executar(
        `UPDATE cliente_pagamentos SET
            excluidoEm = CURRENT_TIMESTAMP
        WHERE id = ? AND clienteId = ?`,
        [pagamentoId, clienteId]
    );

    await adicionarNotaCliente(
        clienteId,
        `Pagamento removido do historico: ${pagamento.plano}, R$ ${pagamento.valorTotal || '0,00'}, registrado em ${pagamento.dataPagamento || pagamento.criadoEm}.`
    );

    return pagamento;
}

async function atualizarPagamentoCliente(clienteId, pagamentoId, dados = {}) {
    const pagamento = await buscarPagamentoCliente(clienteId, pagamentoId);

    if (!pagamento) {
        throw new Error('Pagamento nao encontrado no historico deste cliente.');
    }

    const plano = limparTexto(dados.plano) || pagamento.plano;
    const diasContrato = Number.parseInt(dados.diasContrato || pagamento.diasContrato || 0, 10) || 0;
    const valorPlano = normalizarMoeda(dados.valorPlano);
    const assinaturaApp = normalizarMoeda(dados.assinaturaApp);
    const valorTotal = normalizarMoeda((moedaParaNumero(valorPlano) + moedaParaNumero(assinaturaApp)).toFixed(2));
    const formaPagamento = limparTexto(dados.formaPagamento) || pagamento.formaPagamento;
    const dataPagamento = limparTexto(dados.dataPagamento) || pagamento.dataPagamento;
    const vencimentoNovo = limparTexto(dados.vencimentoNovo) || pagamento.vencimentoNovo;
    const observacoes = limparTexto(dados.observacoes);

    await executar(
        `UPDATE cliente_pagamentos SET
            plano = ?,
            diasContrato = ?,
            valorPlano = ?,
            assinaturaApp = ?,
            valorTotal = ?,
            formaPagamento = ?,
            dataPagamento = ?,
            vencimentoNovo = ?,
            observacoes = ?
        WHERE id = ? AND clienteId = ?`,
        [
            plano,
            diasContrato,
            valorPlano,
            assinaturaApp,
            valorTotal,
            formaPagamento,
            dataPagamento,
            vencimentoNovo,
            observacoes,
            pagamentoId,
            clienteId
        ]
    );

    await adicionarNotaCliente(
        clienteId,
        `Pagamento editado no historico: ${plano}, R$ ${valorTotal}, pagamento ${formaPagamento}.`
    );

    return buscarPagamentoCliente(clienteId, pagamentoId);
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

function listarClientesVencidosParaCobranca(codigoAviso) {
    const agoraIso = agoraSaoPauloISO();

    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59') AS vencimentoEfetivo
            FROM clientes
            WHERE status IN ('ativo', 'pendente', 'expirado')
                AND plano NOT LIKE '%Teste%'
                AND vencimento IS NOT NULL
                AND vencimento != ''
        )
        SELECT * FROM candidatos
        WHERE datetime(replace(vencimentoEfetivo, 'T', ' ')) < datetime(replace(?, 'T', ' '))
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

function listarClientesParaAvisoUmaHora(agoraIso, limiteIso, codigoAviso) {
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59') AS vencimentoEfetivo
            FROM clientes
            WHERE status IN ('ativo', 'pendente')
                AND (plano IS NULL OR plano NOT LIKE '%Teste%')
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

function listarClientesVencidosPorDiasParaAviso(agoraIso, diasVencidos, codigoAviso) {
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                COALESCE(NULLIF(dataVencimento, ''), vencimento || 'T23:59:59') AS vencimentoEfetivo
            FROM clientes
            WHERE status IN ('ativo', 'pendente', 'expirado')
                AND (plano IS NULL OR plano NOT LIKE '%Teste%')
                AND vencimento IS NOT NULL
                AND vencimento != ''
        )
        SELECT * FROM candidatos
        WHERE CAST(julianday(date(?)) - julianday(date(vencimentoEfetivo)) AS INTEGER) = ?
            AND datetime(replace(vencimentoEfetivo, 'T', ' ')) < datetime(replace(?, 'T', ' '))
            AND NOT EXISTS (
                SELECT 1 FROM avisos_renovacao
                WHERE avisos_renovacao.clienteId = candidatos.id
                    AND avisos_renovacao.vencimento = candidatos.vencimentoEfetivo
                    AND avisos_renovacao.diasAntes = ?
            )
        ORDER BY vencimentoEfetivo ASC, nome ASC`,
        [agoraIso, Number(diasVencidos), agoraIso, Number(codigoAviso)]
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

async function avisoRenovacaoProgramadoExiste(id, vencimento, diasAntes) {
    const aviso = await buscarUm(
        `SELECT id
        FROM avisos_renovacao
        WHERE clienteId = ? AND vencimento = ? AND diasAntes = ?
        LIMIT 1`,
        [id, vencimento, Number(diasAntes)]
    );

    return Boolean(aviso);
}

function registrarAvisoAniversario(id, ano) {
    return registrarBonusAniversario(id, ano);
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
    aplicarBonusCliente,
    listarPagamentosCliente,
    buscarPagamentoCliente,
    listarReceitaMensalFinanceira,
    listarPagamentosFinanceiro,
    renovarCliente,
    marcarPagamentoMensagem,
    atualizarPagamentoCliente,
    removerPagamentoCliente,
    removerCliente,
    listarNotasCliente,
    adicionarNotaCliente,
    buscarAlertasCadastroCliente,
    listarClientesParaAviso,
    listarClientesParaAvisosProgramados,
    listarClientesVencidosParaCobranca,
    listarClientesParaAvisoUmaHora,
    listarClientesVencidosPorDiasParaAviso,
    listarTestesGratisParaAvisoPorHorario,
    listarTestesGratisExpiradosParaAviso,
    listarClientesAniversarioHoje,
    registrarAvisoRenovacao,
    registrarAvisoRenovacaoProgramado,
    avisoRenovacaoProgramadoExiste,
    registrarAvisoAniversario,
    registrarBonusAniversario,
    atualizarStatusAutomaticoClientes,
    normalizarTelefone
};
