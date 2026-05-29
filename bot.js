//const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
//const { Client, MessageMedia } = require('whatsapp-web.js');
const { Client, RemoteAuth } = require('whatsapp-web.js'); // Mudamos para RemoteAuth ou mantemos LocalAuth temporariamente
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');
// Crie uma variável global para guardar o texto do QR
let qrAtual = '';

//app.get('/', (req, res) => res.send('Bot Ativo!'));
//app.get('/qr', (req, res) => {
  //  if (!qrAtual) {
    //    return res.send('QR Code ainda não gerado ou já escaneado. Aguarde ou reinicie.');
    //}
    // Gera uma imagem de QR Code limpa na tela do navegador
    //res.send(`
      //  <html>
        //    <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          //      <h2>Escaneie o QR Code abaixo:</h2>
            //    <img src="https://qrserver.com{encodeURIComponent(qrAtual)}" />
              //  <p>Atualize a página se o celular não ler de primeira.</p>
            //</body>
        //</html>
    //`);
//})
// Substitua a sua rota app.get('/qr', ...) antiga por esta nova:
app.get('/qr', async (req, res) => {
    if (!qrAtual) {
        return res.send('QR Code ainda não gerado ou já escaneado. Aguarde ou reinicie.');
    }
    try {
        // Isso gera a imagem em texto puro (Base64) direto do servidor do Render
        const qrImage = await QRCode.toDataURL(qrAtual);
        res.send(`
            <html>
                <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background-color:#f0f2f5;">
                    <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,0.1);text-align:center;">
                        <h2 style="color:#128c7e;margin-bottom:10px;">Escaneie o QR Code abaixo:</h2>
                        <img src="${qrImage}" style="width:300px;height:300px;margin:20px 0;" />
                        <p style="color:#666;font-size:14px;">Abra o WhatsApp > Aparelhos conectados > Conectar dispositivo</p>
                    </div>
                </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('Erro ao gerar a imagem interna do QR Code.');
    }
});

app.listen(PORT, () => console.log(`Monitor na porta ${PORT}`));

// Cliente SIMPLES sem LocalAuth
//const client = new Client({puppeteer: {executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',}});
const client = new Client({
    puppeteer: {
        // Aponta para a pasta local criada pelo arquivo de configuração acima
        executablePath: path.join(__dirname, '.cache', 'puppeteer', 'chrome', 'linux-146.0.7680.31', 'chrome-linux64', 'chrome'),
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    qrAtual = qr;
    console.log('Novo QR Code gerado. Acesse a rota /qr para escanear.');
});

// Armazenamento de usuários
const usuarios = new Map();

// Delay de 3 segundos
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Função para enviar mensagem com delay e simulação de digitação
async function enviarMensagem(to, texto) {
    try {
        const chat = await client.getChatById(to);
        await delay(3000); // Delay de 5 segundos
        await chat.sendStateTyping(); // Simula digitação
        await delay(2000); // Aguarda mais 2 segundos enquanto "digita"
        await client.sendMessage(to, texto);
        console.log(`✅ Mensagem enviada`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao enviar: ${error.message}`);
        return false;
    }
}

// Função para enviar QR Code PIX como imagem com delay
async function enviarQRCodePIX(to, pixCode, valor, plano) {
    try {
        const chat = await client.getChatById(to);
        
        // Delay antes de gerar o QR Code
        await delay(3000);
        await chat.sendStateTyping();
        await delay(2000);
        
        // Gerar QR Code como buffer
        const qrCodeBuffer = await QRCode.toBuffer(pixCode, {
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        // Converter buffer para base64
        const base64Image = qrCodeBuffer.toString('base64');
        
        // Criar MessageMedia com a imagem
        const media = new MessageMedia('image/png', base64Image, `pix_${plano}.png`);
        
        // Enviar a imagem com legenda
        await client.sendMessage(to, media, {
            caption: `*💰 PIX PARA ${plano}*\n\n` +
                    `💎 *Valor:* R$ ${valor}\n\n` +
                    `📱 *Como pagar:*\n` +
                    `1️⃣ Abra o app do seu banco\n` +
                    `2️⃣ Escolha a opção PIX\n` +
                    `3️⃣ Selecione "Ler QR Code"\n` +
                    `4️⃣ Escaneie a imagem acima\n` +
                    `5️⃣ Confirme o pagamento\n\n` +
                    `✅ *Após o pagamento, envie o comprovante aqui para ativação imediata*\n\n` +
                    `Digite *0* para voltar ao Menu Principal`
        });
        console.log(`✅ QR Code PIX ${plano} enviado com sucesso`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao gerar QR Code: ${error.message}`);
        await enviarMensagem(to, `❌ Erro ao gerar QR Code. Por favor, tente novamente ou escolha outro plano.\n\nDigite *0* para voltar ao Menu Principal`);
        return false;
    }
}

// Saudação por horário
function getSaudacao() {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

// Verificar palavras-chave
function isPalavraChave(texto) {
    if (!texto) return false;
    const palavras = ['menu', 'Menu', 'dia', 'tarde', 'noite', 'oi', 'olá', 'Olá', 'Ola', 'ola', 'teste'];
    return palavras.some(p => texto.toLowerCase().includes(p.toLowerCase()));
}

// Menu Principal
async function menuPrincipal(to, nome) {
    const saudacao = getSaudacao();
    const msg = `${saudacao} ${nome}! Pipoca na mão?🍿 Seja bem-vindo(a) à JULIAN PLAY TV!\n\n` +
        `*MENU PRINCIPAL*\n\n` +
        `[1] - Solicitar Planos e Preços\n` +
        `[2] - Solicitar Teste Grátis\n` +
        `[3] - Renovar Assinatura\n` +
        `[4] - Ativar Apps\n` +
        `[0] - Encerrar Atendimento\n\n` +
        `Digite o número da opção desejada:`;
    
    await enviarMensagem(to, msg);
}

// Planos
async function menuPlanos(to) {
    const msg = `*📺 PLANOS E PREÇOS JULIAN PLAY TV*\n\n` +
        `💎 Mensal: R$ 35,00\n` +
        `💎 Trimestral: R$ 80,00\n` +
        `💎 Semestral: R$ 150,00\n` +
        `🔥 Anual: R$ 275,00\n\n` +
        `[9] - Solicitar Teste\n` +
        `[10] - Retornar ao Menu Principal`;
    
    await enviarMensagem(to, msg);
}

// Dispositivos
async function menuDispositivos(to) {
    const msg = `*🎯 TESTE GRÁTIS*\n\n` +
        `Você selecionou a opção 2. Teste Grátis.\n\n` +
        `Agora, por favor, digite em qual DISPOSITIVO você gostaria de testar:\n\n` +
        `[1] - TV Box\n` +
        `[2] - iPhone\n` +
        `[3] - Smart TV\n` +
        `[4] - Android TV\n` +
        `[5] - Computador\n` +
        `[6] - Mi Stick TV\n` +
        `[7] - Fire Stick TV\n` +
        `[8] - Smartphone Android\n\n` +
        `[0] - Menu Principal\n\n` +
        `Digite o número do seu dispositivo:`;
    
    await enviarMensagem(to, msg);
}

// Marcas de Smart TV
async function menuMarcasSmartTV(to) {
    const msg = `*📺 SMART TVS*\n\n` +
        `Você selecionou a opção 3. Smart TVs.\n\n` +
        `Agora, por favor, escolha em qual TV você gostaria de testar:\n\n` +
        `[1] - TV LG\n` +
        `[2] - TV PHILCO\n` +
        `[3] - TV PHILIPS\n` +
        `[4] - TV ROKU\n` +
        `[5] - TV SAMSUNG\n` +
        `[6] - ANDROID TV\n` +
        `[7] - TV TCL\n` +
        `[8] - TV PANASONIC\n` +
        `[9] - TV XIAOMI\n\n` +
        `[0] - Menu Principal\n\n` +
        `Digite o número da sua TV:`;
    
    await enviarMensagem(to, msg);
}

// Renovação - Mostrar opções de planos para escolher
async function menuRenovacao(to) {
    const msg = `*🔄 RENOVAÇÃO DE ASSINATURA*\n\n` +
        `Escolha o plano que deseja renovar:\n\n` +
        `[1] - Plano Mensal - R$ 35,00\n` +
        `[2] - Plano Trimestral - R$ 80,00\n` +
        `[3] - Plano Semestral - R$ 150,00\n` +
        `[4] - Plano Anual - R$ 275,00\n\n` +
        `[0] - Menu Principal\n\n` +
        `Digite o número do plano desejado:`;
    
    await enviarMensagem(to, msg);
}

// Ativação
async function menuAtivacao(to) {
    const msg = `*📱 ATIVAÇÃO DE APLICATIVOS*\n\n` +
        `Para ativar nossos aplicativos nos seus dispositivos, um atendente irá te auxiliar em breve.\n\n` +
        `Por favor, aguarde alguns instantes.\n\n` +
        `[0] - Menu Principal`;
    
    await enviarMensagem(to, msg);
}

// Finalizar
async function finalizarAtendimento(to, nome) {
    const msg = `*👋 ATENDIMENTO ENCERRADO*\n\n` +
        `Obrigado pelo contato, ${nome}!\n` +
        `Estaremos sempre à disposição para atendê-lo!\n\n` +
        `A Julian Play TV agradece sua preferência. 🎬\n\n` +
        `Digite "oi" para começar novamente.`;
    
    await enviarMensagem(to, msg);
    usuarios.delete(to);
}

// Opção inválida
async function opcaoInvalida(to) {
    await enviarMensagem(to, '❌ *OPÇÃO INVÁLIDA!*\n\nPor favor, digite um número correspondente às opções do menu.');
}

// Processar respostas
async function processarResposta(from, texto) {
    const usuario = usuarios.get(from);
    if (!usuario) return;
    
    const { estado, nome, dispositivo, marca } = usuario;
    
    console.log(`🔄 Estado: ${estado} | Resposta: ${texto}`);
    
    // Aguardando nome
    if (estado === 'aguardando_nome') {
        if (texto && texto.length >= 2) {
            usuario.nome = texto;
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, texto);
        } else {
            await enviarMensagem(from, 'Por favor, digite seu nome (mínimo 2 letras):');
        }
        return;
    }
    
    // Menu principal
    if (estado === 'menu_principal') {
        switch(texto) {
            case '1':
                usuario.estado = 'planos';
                usuarios.set(from, usuario);
                await menuPlanos(from);
                break;
            case '2':
                usuario.estado = 'dispositivos';
                usuarios.set(from, usuario);
                await menuDispositivos(from);
                break;
            case '3':
                usuario.estado = 'renovacao_planos';
                usuarios.set(from, usuario);
                await menuRenovacao(from);
                break;
            case '4':
                usuario.estado = 'ativacao';
                usuarios.set(from, usuario);
                await menuAtivacao(from);
                break;
            case '0':
                await finalizarAtendimento(from, nome);
                break;
            default:
                await opcaoInvalida(from);
                await menuPrincipal(from, nome);
        }
        return;
    }
    
    // Planos
    if (estado === 'planos') {
        if (texto === '9') {
            usuario.estado = 'dispositivos';
            usuarios.set(from, usuario);
            await menuDispositivos(from);
        } else if (texto === '10') {
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, nome);
        } else {
            await opcaoInvalida(from);
            await menuPlanos(from);
        }
        return;
    }
    
    // Dispositivos
    if (estado === 'dispositivos') {
        if (texto === '0') {
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, nome);
        } else if (texto === '3') {
            usuario.dispositivo = 'Smart TV';
            usuario.estado = 'marcas_smart_tv';
            usuarios.set(from, usuario);
            await menuMarcasSmartTV(from);
        } else if (['1', '2', '4', '5', '6', '7', '8'].includes(texto)) {
            const dispositivosMap = {
                '1': 'TV Box',
                '2': 'iPhone',
                '4': 'Android TV',
                '5': 'Computador',
                '6': 'Mi Stick TV',
                '7': 'Fire Stick TV',
                '8': 'Smartphone Android'
            };
            const dispositivoSelecionado = dispositivosMap[texto];
            
            let msgConfirmacao = `✅ *TESTE GRÁTIS SOLICITADO COM SUCESSO!*\n\n` +
                `*Resumo do pedido:*\n` +
                `📱 Dispositivo: ${dispositivoSelecionado}\n\n` +
                `Um atendente entrará em contato em breve com as instruções para ativação do seu teste gratuito.\n\n` +
                `Enquanto isso, você já pode preparar a pipoca! 🍿\n\n` +
                `Digite *0* para voltar ao Menu Principal`;
            
            await enviarMensagem(from, msgConfirmacao);
            
            usuario.estado = 'menu_principal';
            delete usuario.dispositivo;
            delete usuario.marca;
            usuarios.set(from, usuario);
        } else {
            await opcaoInvalida(from);
            await menuDispositivos(from);
        }
        return;
    }
    
    // Marcas de Smart TV
    if (estado === 'marcas_smart_tv') {
        if (texto === '0') {
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, nome);
        } else if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(texto)) {
            const marcasMap = {
                '1': 'TV LG',
                '2': 'TV PHILCO',
                '3': 'TV PHILIPS',
                '4': 'TV ROKU',
                '5': 'TV SAMSUNG',
                '6': 'ANDROID TV',
                '7': 'TV TCL',
                '8': 'TV PANASONIC',
                '9': 'TV XIAOMI'
            };
            const marcaSelecionada = marcasMap[texto];
            
            let msgConfirmacao = `✅ *TESTE GRÁTIS SOLICITADO COM SUCESSO!*\n\n` +
                `*Resumo do pedido:*\n` +
                `📱 Dispositivo: Smart TV\n` +
                `📺 Marca: ${marcaSelecionada}\n\n` +
                `Um atendente entrará em contato em breve com as instruções para ativação do seu teste gratuito.\n\n` +
                `Enquanto isso, você já pode preparar a pipoca! 🍿\n\n` +
                `Digite *0* para voltar ao Menu Principal`;
            
            await enviarMensagem(from, msgConfirmacao);
            
            usuario.estado = 'menu_principal';
            delete usuario.dispositivo;
            delete usuario.marca;
            usuarios.set(from, usuario);
        } else {
            await opcaoInvalida(from);
            await menuMarcasSmartTV(from);
        }
        return;
    }
    
    // Renovação - Escolha do plano
    if (estado === 'renovacao_planos') {
        if (texto === '0') {
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, nome);
        } else if (texto === '1') {
            // Plano Mensal - R$ 35,00
            await enviarMensagem(from, '💰 *GERANDO QR CODE PIX PARA PLANO MENSAL - R$ 35,00*\n\nAguarde um momento...');
            await enviarQRCodePIX(from, '00020126330014br.gov.bcb.pix011161319147704520400005303986540535.005802BR5924Carlos Henrique Julianel6009Sao Paulo62230519daqr2188072805101086304D6FF', '35,00', 'PLANO MENSAL');
            usuario.estado = 'renovacao_aguardando_comprovante';
            usuarios.set(from, usuario);
        } else if (texto === '2') {
            // Plano Trimestral - R$ 80,00
            await enviarMensagem(from, '💰 *GERANDO QR CODE PIX PARA PLANO TRIMESTRAL - R$ 80,00*\n\nAguarde um momento...');
            await enviarQRCodePIX(from, '00020126330014br.gov.bcb.pix011161319147704520400005303986540580.005802BR5924Carlos Henrique Julianel6009Sao Paulo62230519daqr21880728073011363046BA4', '80,00', 'PLANO TRIMESTRAL');
            usuario.estado = 'renovacao_aguardando_comprovante';
            usuarios.set(from, usuario);
        } else if (texto === '3') {
            // Plano Semestral - R$ 150,00
            await enviarMensagem(from, '💰 *GERANDO QR CODE PIX PARA PLANO SEMESTRAL - R$ 150,00*\n\nAguarde um momento...');
            await enviarQRCodePIX(from, '00020126330014br.gov.bcb.pix0111613191477045204000053039865406150.005802BR5924Carlos Henrique Julianel6009Sao Paulo62230519daqr2188072808042136304F414', '150,00', 'PLANO SEMESTRAL');
            usuario.estado = 'renovacao_aguardando_comprovante';
            usuarios.set(from, usuario);
        } else if (texto === '4') {
            // Plano Anual - R$ 275,00
            await enviarMensagem(from, '💰 *GERANDO QR CODE PIX PARA PLANO ANUAL - R$ 275,00*\n\nAguarde um momento...');
            await enviarQRCodePIX(from, '00020126330014br.gov.bcb.pix0111613191477045204000053039865406275.005802BR5924Carlos Henrique Julianel6009Sao Paulo62230519daqr21880728085532063048B42', '275,00', 'PLANO ANUAL');
            usuario.estado = 'renovacao_aguardando_comprovante';
            usuarios.set(from, usuario);
        } else {
            await opcaoInvalida(from);
            await menuRenovacao(from);
        }
        return;
    }
    
    // Aguardando comprovante após PIX
    if (estado === 'renovacao_aguardando_comprovante') {
        // Qualquer mensagem após o PIX é tratada como comprovante
        await enviarMensagem(from, '✅ *COMPROVANTE RECEBIDO COM SUCESSO!*\n\n' +
            '✅ *Status do pagamento:* Aguardando confirmação\n\n' +
            '⏰ *Prazo de ativação:* Até 30 minutos\n\n' +
            '📞 *Dúvidas?* Entre em contato com nosso suporte\n\n' +
            'Digite *0* para voltar ao Menu Principal');
        usuario.estado = 'menu_principal';
        usuarios.set(from, usuario);
        return;
    }
    
    // Ativação
    if (estado === 'ativacao') {
        if (texto === '0') {
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, nome);
        } else {
            await opcaoInvalida(from);
            await menuAtivacao(from);
        }
        return;
    }
}

// Evento principal
client.on('message', async (message) => {
    const from = message.from;
    const body = message.body;
    
    // Ignorar status e grupos
    if (from.includes('status@broadcast') || from.includes('@g.us')) {
        return;
    }
    
    console.log(`📨 Mensagem de ${from}: "${body}"`);
    
    // Verificar limite de 24h
    const usuario = usuarios.get(from);
    if (usuario && usuario.ultimaResposta && usuario.estado !== 'aguardando_nome') {
        const agora = Date.now();
        const diffHoras = (agora - usuario.ultimaResposta) / (1000 * 60 * 60);
        if (diffHoras < 24) {
            console.log(`⏰ Bloqueado por 24h (última resposta há ${diffHoras.toFixed(1)}h)`);
            return;
        }
    }
    
    // Ativar por palavra-chave
    if (isPalavraChave(body)) {
        console.log('✅ Palavra-chave detectada!');
        
        if (!usuario) {
            usuarios.set(from, {
                nome: null,
                estado: 'aguardando_nome',
                ultimaResposta: null
            });
            await enviarMensagem(from, '👋 Olá! Para começar, digite seu *PRIMEIRO NOME*:');
        } else if (usuario.nome && usuario.estado === 'menu_principal') {
            await menuPrincipal(from, usuario.nome);
        } else if (usuario.nome) {
            usuario.estado = 'menu_principal';
            usuarios.set(from, usuario);
            await menuPrincipal(from, usuario.nome);
        } else {
            usuario.estado = 'aguardando_nome';
            usuarios.set(from, usuario);
            await enviarMensagem(from, '👋 Olá! Para começar, digite seu *PRIMEIRO NOME*:');
        }
        return;
    }
    
    // Processar resposta
    if (usuarios.has(from)) {
        await processarResposta(from, body);
    }
});

// Eventos
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE COM SEU WHATSAPP:');
    qrcode.generate(qr, { small: true });
    console.log('\n⚠️ O QR Code expira rápido, escaneie rapidamente!\n');
});

client.on('ready', () => {
    console.log('\n✅ BOT CONECTADO COM SUCESSO!');
    console.log('📱 Aguardando mensagens...\n');
    console.log('💡 Envie "oi" para começar\n');
    console.log('⏰ O bot tem delay de 5 segundos entre as mensagens para simular digitação\n');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
    console.log('❌ Desconectado:', reason);
});

// Iniciar
console.log('🚀 Iniciando bot JULIAN PLAY TV...\n');
client.initialize();

// Fechamento
process.on('SIGINT', async () => {
    console.log('\n🔴 Desligando bot...');
    await client.destroy();
    process.exit(0);
});