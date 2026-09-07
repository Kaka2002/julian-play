const db = require('../database/sqlite');
const { normalizarTelefone } = require('./clientes');

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function normalizarMac(valor) {
    const limpo = String(valor || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    return limpo.length === 12 ? limpo : '';
}

function macsCliente(cliente) {
    const macs = new Set();
    const adicionar = valor => {
        const mac = normalizarMac(valor);
        if (mac) macs.add(mac);
    };
    adicionar(cliente.enderecoMac);
    try {
        const acessos = JSON.parse(cliente.acessosApp || '[]');
        if (Array.isArray(acessos)) acessos.forEach(acesso => adicionar(acesso?.enderecoMac));
    } catch (_) {
        // Cadastro antigo inválido não deve interromper o diagnóstico.
    }
    return [...macs];
}

function telefoneCliente(cliente) {
    const original = String(cliente.telefone || '').replace(/\D/g, '');
    if (original.length < 10) return '';
    return normalizarTelefone(cliente.telefone);
}

async function listarGruposClientesDuplicados() {
    const clientes = await buscarTodos(`SELECT id,nome,telefone,enderecoMac,acessosApp,status,dataCadastro,atualizadoEm
        FROM clientes WHERE anonimizadoEm IS NULL OR anonimizadoEm='' ORDER BY id`);
    const pai = new Map(clientes.map(cliente => [cliente.id, cliente.id]));
    const achar = id => {
        let raiz = id;
        while (pai.get(raiz) !== raiz) raiz = pai.get(raiz);
        while (pai.get(id) !== id) {
            const proximo = pai.get(id);
            pai.set(id, raiz);
            id = proximo;
        }
        return raiz;
    };
    const unir = (a, b) => {
        const raizA = achar(a);
        const raizB = achar(b);
        if (raizA !== raizB) pai.set(raizB, raizA);
    };
    const identificadores = new Map();
    const registrar = (tipo, valor, clienteId) => {
        if (!valor) return;
        const chave = `${tipo}:${valor}`;
        if (!identificadores.has(chave)) identificadores.set(chave, []);
        identificadores.get(chave).push(clienteId);
    };
    clientes.forEach(cliente => {
        registrar('telefone', telefoneCliente(cliente), cliente.id);
        macsCliente(cliente).forEach(mac => registrar('mac', mac, cliente.id));
    });
    identificadores.forEach(ids => {
        if (ids.length > 1) ids.slice(1).forEach(id => unir(ids[0], id));
    });
    const componentes = new Map();
    clientes.forEach(cliente => {
        const raiz = achar(cliente.id);
        if (!componentes.has(raiz)) componentes.set(raiz, []);
        componentes.get(raiz).push(cliente);
    });
    const grupos = [];
    componentes.forEach(itens => {
        if (itens.length < 2) return;
        const ids = new Set(itens.map(item => item.id));
        const coincidencias = [];
        identificadores.forEach((clientesDoIdentificador, chave) => {
            const presentes = [...new Set(clientesDoIdentificador.filter(id => ids.has(id)))];
            if (presentes.length < 2) return;
            const [tipo, valor] = chave.split(':');
            coincidencias.push({ tipo, valor, clientesIds: presentes });
        });
        if (!coincidencias.length) return;
        const ativos = itens.filter(item => ['ativo', 'teste', 'pendente'].includes(item.status)).length;
        grupos.push({
            chave: itens.map(item => item.id).sort((a, b) => a - b).join('-'),
            prioridade: ativos > 1 ? 'alta' : 'media',
            clientes: itens,
            coincidencias
        });
    });
    return grupos.sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === 'alta' ? -1 : 1)
        || a.clientes[0].nome.localeCompare(b.clientes[0].nome, 'pt-BR'));
}

module.exports = { listarGruposClientesDuplicados, normalizarMac, macsCliente };
