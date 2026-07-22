import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "D:/julian-play";
const OUT = `${ROOT}/outputs`;
const W = 1280;
const H = 720;

const colors = {
  navy: "#071B4D",
  blue: "#1E5BFF",
  cyan: "#17C9D4",
  orange: "#F28A19",
  green: "#10B981",
  ink: "#0F172A",
  muted: "#667085",
  line: "#DFE7F3",
  soft: "#F6FAFF",
  white: "#FFFFFF",
};

const imagePaths = {
  logo: `${ROOT}/assets/Logo.png`,
  panelBg: `${ROOT}/assets/julian-play-fundo-painel.png`,
  amizade: `${ROOT}/assets/amizade-presente.png`,
  roboMenu: `${ROOT}/assets/Logo 1_7.png`,
  welcome: `D:/Doc xls IPTV/IPTV imagens/Imagens Robo/ChatGPT Image 30 de jun. de 2026, 15_39_09.png`,
};

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readPng(file) {
  return await fs.readFile(file);
}

async function addImage(slide, file, position, opts = {}) {
  if (!(await exists(file))) return;
  slide.images.add({
    blob: await readPng(file),
    contentType: "image/png",
    alt: opts.alt || path.basename(file),
    fit: opts.fit || "cover",
    position,
    geometry: opts.geometry || "rect",
    borderRadius: opts.borderRadius,
    crop: opts.crop,
  });
}

function addText(slide, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontSize: style.fontSize || 22,
    bold: !!style.bold,
    color: style.color || colors.ink,
    alignment: style.alignment || "left",
  };
  return shape;
}

function addBox(slide, position, fill = colors.white, line = colors.line, radius = "rounded-xl") {
  return slide.shapes.add({
    geometry: "roundRect",
    position,
    fill,
    line: { style: "solid", fill: line, width: 1 },
    borderRadius: radius,
    shadow: "shadow-sm",
  });
}

function addPill(slide, text, left, top, width, fill, color = colors.white) {
  addBox(slide, { left, top, width, height: 36 }, fill, fill, "rounded-full");
  addText(slide, text, { left: left + 16, top: top + 8, width: width - 32, height: 20 }, {
    fontSize: 13,
    bold: true,
    color,
    alignment: "center",
  });
}

async function addHeader(slide, title, section = "JULIAN PLAY") {
  slide.background.fill = colors.soft;
  slide.shapes.add({
    geometry: "rect",
    position: { left: 0, top: 0, width: W, height: 78 },
    fill: colors.navy,
    line: { style: "solid", fill: colors.navy, width: 0 },
  });
  slide.shapes.add({
    geometry: "rect",
    position: { left: 760, top: 0, width: 520, height: 78 },
    fill: colors.cyan,
    line: { style: "solid", fill: colors.cyan, width: 0 },
  });
  await addImage(slide, imagePaths.logo, { left: 54, top: 18, width: 42, height: 42 }, { fit: "contain" });
  addText(slide, section, { left: 108, top: 24, width: 220, height: 22 }, {
    fontSize: 13,
    bold: true,
    color: colors.white,
  });
  addText(slide, title, { left: 72, top: 112, width: 820, height: 44 }, {
    fontSize: 34,
    bold: true,
    color: colors.ink,
  });
}

function addMetric(slide, label, value, note, left, top, accent = colors.blue) {
  addBox(slide, { left, top, width: 235, height: 125 });
  slide.shapes.add({
    geometry: "rect",
    position: { left, top, width: 5, height: 125 },
    fill: accent,
    line: { style: "solid", fill: accent, width: 0 },
  });
  addText(slide, label, { left: left + 20, top: top + 20, width: 150, height: 22 }, {
    fontSize: 14,
    bold: true,
    color: colors.muted,
  });
  addText(slide, value, { left: left + 20, top: top + 48, width: 160, height: 40 }, {
    fontSize: 32,
    bold: true,
    color: colors.ink,
  });
  addText(slide, note, { left: left + 20, top: top + 91, width: 180, height: 22 }, {
    fontSize: 13,
    bold: true,
    color: colors.muted,
  });
}

function addFeatureCard(slide, title, body, left, top, width = 330, accent = colors.blue) {
  addBox(slide, { left, top, width, height: 142 });
  addText(slide, title, { left: left + 24, top: top + 20, width: width - 48, height: 28 }, {
    fontSize: 20,
    bold: true,
    color: colors.ink,
  });
  slide.shapes.add({
    geometry: "rect",
    position: { left: left + 24, top: top + 60, width: 54, height: 4 },
    fill: accent,
    line: { style: "solid", fill: accent, width: 0 },
  });
  addText(slide, body, { left: left + 24, top: top + 78, width: width - 48, height: 48 }, {
    fontSize: 16,
    color: colors.muted,
  });
}

function addTimeline(slide, items) {
  const left = 112;
  const top = 300;
  const gap = 204;
  for (let i = 0; i < items.length; i++) {
    const x = left + i * gap;
    slide.shapes.add({
      geometry: "ellipse",
      position: { left: x, top, width: 54, height: 54 },
      fill: items[i].color,
      line: { style: "solid", fill: items[i].color, width: 0 },
    });
    addText(slide, String(i + 1), { left: x, top: top + 14, width: 54, height: 24 }, {
      fontSize: 20,
      bold: true,
      color: colors.white,
      alignment: "center",
    });
    if (i < items.length - 1) {
      slide.shapes.add({
        geometry: "rect",
        position: { left: x + 62, top: top + 26, width: gap - 74, height: 3 },
        fill: colors.line,
        line: { style: "solid", fill: colors.line, width: 0 },
      });
    }
    addText(slide, items[i].title, { left: x - 42, top: top + 74, width: 140, height: 34 }, {
      fontSize: 18,
      bold: true,
      color: colors.ink,
      alignment: "center",
    });
    addText(slide, items[i].body, { left: x - 56, top: top + 116, width: 168, height: 64 }, {
      fontSize: 13,
      color: colors.muted,
      alignment: "center",
    });
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  // Slide 1
  {
    const slide = presentation.slides.add();
    slide.background.fill = colors.navy;
    await addImage(slide, (await exists(imagePaths.welcome)) ? imagePaths.welcome : imagePaths.panelBg, { left: 0, top: 0, width: W, height: H }, { fit: "cover" });
    slide.shapes.add({
      geometry: "rect",
      position: { left: 0, top: 0, width: W, height: H },
      fill: { color: colors.navy, transparency: 18 },
      line: { style: "solid", fill: colors.navy, width: 0 },
    });
    await addImage(slide, imagePaths.logo, { left: 82, top: 70, width: 84, height: 84 }, { fit: "contain" });
    addPill(slide, "SISTEMA COMERCIAL PARA IPTV E P2P", 82, 180, 330, colors.cyan);
    addText(slide, "Julian Play", { left: 82, top: 236, width: 520, height: 70 }, {
      fontSize: 58,
      bold: true,
      color: colors.white,
    });
    addText(slide, "Controle de clientes, robô WhatsApp, financeiro, campanhas e licenças em uma única operação.", { left: 84, top: 322, width: 640, height: 92 }, {
      fontSize: 25,
      color: colors.white,
    });
    addFeatureCard(slide, "Do cadastro à renovação", "Menos retrabalho e mais controle para vender, atender e cobrar.", 82, 500, 360, colors.orange);
    addFeatureCard(slide, "Servidor ou instalação local", "Você controla a licença e o cliente usa o painel onde preferir.", 470, 500, 380, colors.cyan);
    slide.speakerNotes.textFrame.setText("Abertura: apresente o Julian Play como uma solução completa para quem vende IPTV e P2P. Reforce que o objetivo é reduzir trabalho manual e organizar a operação.");
  }

  // Slide 2
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "O problema que o sistema resolve");
    addText(slide, "Antes do Julian Play, a operação costuma ficar espalhada entre planilhas, WhatsApp, painéis de apps, anotações e cobranças manuais.", { left: 72, top: 172, width: 760, height: 70 }, { fontSize: 22, color: colors.muted });
    addFeatureCard(slide, "Cliente vence e ninguém vê", "Avisos dependem da memória e podem atrasar a renovação.", 72, 286, 342, colors.orange);
    addFeatureCard(slide, "Histórico fica perdido", "Conversas, pagamentos e alterações ficam fora do cadastro.", 460, 286, 342, colors.blue);
    addFeatureCard(slide, "Entrega sem padrão", "Cada instalação pode sair de um jeito, dificultando suporte.", 848, 286, 342, colors.cyan);
    addBox(slide, { left: 72, top: 500, width: 1118, height: 104 }, "#ECFEFF", "#A5F3FC");
    addText(slide, "A proposta é simples: transformar a rotina comercial em um fluxo padronizado, visível e fácil de acompanhar.", { left: 112, top: 528, width: 980, height: 44 }, { fontSize: 24, bold: true, color: colors.navy });
    slide.speakerNotes.textFrame.setText("Mostre a dor do cliente: trabalho manual, perda de controle e falta de rastreabilidade. Em seguida, posicione o sistema como centralizador.");
  }

  // Slide 3
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Painel de controle para decidir rápido");
    addText(slide, "A tela inicial mostra o que exige atenção: clientes ativos, vencimentos próximos, receita recorrente, campanhas e status do atendimento.", { left: 72, top: 170, width: 870, height: 62 }, { fontSize: 21, color: colors.muted });
    addMetric(slide, "Clientes ativos", "9", "base atual", 72, 278, colors.green);
    addMetric(slide, "Vencem em 7 dias", "1", "precisam atenção", 332, 278, colors.orange);
    addMetric(slide, "Receita mensal", "R$ 283", "recorrente", 592, 278, colors.blue);
    addMetric(slide, "Atendimentos", "0", "urgentes", 852, 278, colors.cyan);
    addBox(slide, { left: 72, top: 462, width: 1118, height: 116 });
    addText(slide, "Resultado comercial", { left: 108, top: 492, width: 280, height: 26 }, { fontSize: 21, bold: true });
    addText(slide, "Você sabe quem precisa renovar, quem está ativo, quanto está entrando e qual ação deve ser feita primeiro.", { left: 108, top: 530, width: 940, height: 38 }, { fontSize: 21, color: colors.muted });
    slide.speakerNotes.textFrame.setText("Explique que o painel tira o dono da operação do modo 'procurar problema' e coloca no modo 'agir no que importa'.");
  }

  // Slide 4
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Cadastro completo do cliente");
    addText(slide, "Cada cliente concentra dados pessoais, plano, vencimento, apps, dispositivos, painel, acesso IPTV, tags e histórico.", { left: 72, top: 170, width: 820, height: 58 }, { fontSize: 21, color: colors.muted });
    addFeatureCard(slide, "Plano e vencimento", "Controle dias, valor, status, início e renovação.", 72, 278, 320, colors.blue);
    addFeatureCard(slide, "Apps e dispositivos", "Registre onde o cliente usa e quais apps estão instalados.", 422, 278, 320, colors.green);
    addFeatureCard(slide, "Tags e origem", "Separe VIP, bom pagador, indicação, teste e outros grupos.", 772, 278, 320, colors.orange);
    addFeatureCard(slide, "WhatsApp internacional", "DDI por país para atender Brasil, EUA, Canadá e outros.", 72, 456, 320, colors.cyan);
    addFeatureCard(slide, "Ações rápidas", "Enviar PIX, cobrança, abrir WhatsApp, renovar e ver histórico.", 422, 456, 320, colors.blue);
    addFeatureCard(slide, "Histórico único", "Financeiro, robô, atendimentos e notas em uma linha do tempo.", 772, 456, 320, colors.green);
    slide.speakerNotes.textFrame.setText("Mostre que o cadastro é o coração do sistema: ele evita voltar em vários lugares para saber quem é o cliente e o que foi combinado.");
  }

  // Slide 5
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Robô WhatsApp para atendimento e cobrança");
    addText(slide, "O robô responde clientes, envia vencimentos, PIX, orientações de instalação, campanhas e mensagens configuradas no painel.", { left: 72, top: 170, width: 840, height: 58 }, { fontSize: 21, color: colors.muted });
    addTimeline(slide, [
      { title: "Cliente chama", body: "O robô identifica a intenção: PIX, renovação, teste ou suporte.", color: colors.blue },
      { title: "Sistema consulta", body: "Busca plano, vencimento, cliente e configurações.", color: colors.cyan },
      { title: "Resposta sai", body: "Mensagem com texto, imagem ou QR Code conforme o fluxo.", color: colors.green },
      { title: "Histórico grava", body: "Tudo fica registrado no cliente e no painel.", color: colors.orange },
      { title: "Humano assume", body: "Quando necessário, o robô pausa o atendimento automático.", color: colors.navy },
    ]);
    slide.speakerNotes.textFrame.setText("Explique que o robô não substitui o dono do negócio; ele filtra o repetitivo e dá escala com registro.");
  }

  // Slide 6
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "PIX confirmado e renovação automática");
    addText(slide, "Com Mercado Pago, o sistema gera a cobrança, identifica a aprovação, renova o cliente e envia a confirmação pelo WhatsApp.", { left: 72, top: 170, width: 920, height: 58 }, { fontSize: 21, color: colors.muted });
    addBox(slide, { left: 72, top: 270, width: 520, height: 255 });
    addText(slide, "Fluxo automático do PIX", { left: 108, top: 302, width: 350, height: 32 }, { fontSize: 25, bold: true });
    addText(slide, "1. Gere o QR Code do plano\n2. O cliente realiza o PIX\n3. Mercado Pago confirma\n4. O vencimento é renovado\n5. O WhatsApp avisa o cliente", { left: 108, top: 354, width: 420, height: 150 }, { fontSize: 22, color: colors.ink });
    addBox(slide, { left: 640, top: 270, width: 480, height: 255 }, "#F0FDF4", "#BBF7D0");
    addText(slide, "Benefício", { left: 676, top: 302, width: 300, height: 32 }, { fontSize: 25, bold: true, color: colors.green });
    addText(slide, "Menos conferência manual, renovação sem atraso e confirmação automática para o cliente.", { left: 676, top: 350, width: 390, height: 112 }, { fontSize: 25, bold: true, color: colors.ink });
    addPill(slide, "Servidor: webhook  |  Local: consulta segura", 670, 480, 420, colors.green);
    slide.speakerNotes.textFrame.setText("Mostre o novo fluxo do PIX: o QR Code é gerado pelo sistema, o Mercado Pago confirma a aprovação, o cadastro é renovado e o cliente recebe a mensagem no WhatsApp. Explique que funciona no servidor e na instalação local.");
  }

  // Slide 7
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Campanhas e CRM para vender mais");
    addText(slide, "O sistema permite campanhas com imagem, envio de teste individual, disparo em lote controlado e CRM para acompanhar interessados.", { left: 72, top: 170, width: 850, height: 58 }, { fontSize: 21, color: colors.muted });
    await addImage(slide, imagePaths.amizade, { left: 72, top: 260, width: 360, height: 360 }, { fit: "contain", geometry: "roundRect", borderRadius: "rounded-xl" });
    addFeatureCard(slide, "Disparo protegido", "Envio em lotes para reduzir risco de travar o WhatsApp.", 500, 260, 330, colors.orange);
    addFeatureCard(slide, "Modelo editável", "Texto configurado em modelos e imagem definida em manutenção.", 860, 260, 330, colors.blue);
    addFeatureCard(slide, "CRM de vendas", "Registre leads, retorno, status e motivo de perda.", 500, 438, 330, colors.green);
    addFeatureCard(slide, "Teste antes de enviar", "Envie para um cliente e valide a campanha antes do lote.", 860, 438, 330, colors.cyan);
    slide.speakerNotes.textFrame.setText("Conte que campanha grande exige cuidado. O sistema já prepara envio em lote e teste individual, mas campanhas oficiais via API podem ser o próximo nível.");
  }

  // Slide 8
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Instalação local ou hospedada no servidor");
    addText(slide, "Você pode manter clientes no seu servidor ou entregar uma instalação local licenciada no computador do cliente.", { left: 72, top: 170, width: 850, height: 58 }, { fontSize: 21, color: colors.muted });
    addBox(slide, { left: 72, top: 270, width: 500, height: 260 }, "#EFF6FF", "#BFDBFE");
    addText(slide, "Servidor", { left: 112, top: 310, width: 250, height: 38 }, { fontSize: 30, bold: true, color: colors.blue });
    addText(slide, "Ideal para centralizar várias instalações, acompanhar clientes e operar com domínio próprio.", { left: 112, top: 372, width: 380, height: 88 }, { fontSize: 22, color: colors.ink });
    addBox(slide, { left: 640, top: 270, width: 500, height: 260 }, "#FFF7ED", "#FED7AA");
    addText(slide, "Local", { left: 680, top: 310, width: 250, height: 38 }, { fontSize: 30, bold: true, color: colors.orange });
    addText(slide, "Ideal para cliente usar no próprio computador, com licença controlada por você.", { left: 680, top: 372, width: 380, height: 88 }, { fontSize: 22, color: colors.ink });
    addPill(slide, "Licença por ID de instalação e chave da máquina", 388, 584, 500, colors.navy);
    slide.speakerNotes.textFrame.setText("Explique que isso aumenta a oferta comercial: você pode vender o serviço hospedado ou liberar instalação local controlada.");
  }

  // Slide 9
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Painel Mestre para controlar instalações");
    addText(slide, "O Painel Mestre acompanha instalações comerciais, licenças locais, validade, status, saúde do robô e necessidades de atenção.", { left: 72, top: 170, width: 900, height: 58 }, { fontSize: 21, color: colors.muted });
    addMetric(slide, "Licenças locais", "Ativas", "controle por máquina", 72, 278, colors.green);
    addMetric(slide, "Instalações", "Servidor", "clientes isolados", 332, 278, colors.blue);
    addMetric(slide, "Renovações", "Código", "envio ao cliente", 592, 278, colors.orange);
    addMetric(slide, "Atenção", "Prioridades", "o que revisar", 852, 278, colors.cyan);
    addBox(slide, { left: 72, top: 468, width: 1118, height: 92 }, "#F8FAFC", colors.line);
    addText(slide, "Você decide quando liberar, renovar, suspender, transferir ou acompanhar uma instalação.", { left: 112, top: 498, width: 960, height: 35 }, { fontSize: 24, bold: true, color: colors.ink });
    slide.speakerNotes.textFrame.setText("Aqui o foco é mostrar controle do fornecedor: o cliente local não fica solto; a licença continua sob administração.");
  }

  // Slide 10
  {
    const slide = presentation.slides.add();
    await addHeader(slide, "Manutenção, backup e diagnóstico");
    addText(slide, "O sistema inclui saúde do robô, logs, diagnóstico, backup dos dados, troca de imagens do robô, configuração de mensagens e webhook.", { left: 72, top: 170, width: 900, height: 58 }, { fontSize: 21, color: colors.muted });
    addFeatureCard(slide, "Saúde do robô", "Mostra conexão, risco, fila, última resposta e eventos ignorados.", 72, 278, 330, colors.green);
    addFeatureCard(slide, "Backup e restauração", "Gere cópias antes de manutenção, atualização ou importação.", 432, 278, 330, colors.blue);
    addFeatureCard(slide, "Diagnóstico", "Banco, PIX, licença, WhatsApp, webhook e acesso administrativo.", 792, 278, 330, colors.orange);
    addFeatureCard(slide, "Webhook", "Integrações futuras com dados do cliente, financeiro e eventos do robô.", 252, 456, 330, colors.cyan);
    addFeatureCard(slide, "Suporte mais simples", "Botões de recuperação evitam depender de comandos no PowerShell.", 612, 456, 330, colors.navy);
    slide.speakerNotes.textFrame.setText("Apresente manutenção como diferencial profissional: menos suporte manual, mais autonomia para diagnosticar e recuperar.");
  }

  // Slide 11
  {
    const slide = presentation.slides.add();
    slide.background.fill = colors.navy;
    slide.shapes.add({
      geometry: "rect",
      position: { left: 0, top: 0, width: W, height: H },
      fill: colors.navy,
      line: { style: "solid", fill: colors.navy, width: 0 },
    });
    await addImage(slide, imagePaths.logo, { left: 84, top: 74, width: 82, height: 82 }, { fit: "contain" });
    addText(slide, "Julian Play", { left: 84, top: 186, width: 520, height: 70 }, {
      fontSize: 58,
      bold: true,
      color: colors.white,
    });
    addText(slide, "Um painel para vender, atender, cobrar e controlar sua operação com padrão profissional.", { left: 86, top: 282, width: 700, height: 90 }, {
      fontSize: 28,
      color: colors.white,
    });
    addPill(slide, "Demonstração comercial pronta", 86, 430, 310, colors.cyan);
    addPill(slide, "Instalação local controlada", 420, 430, 310, colors.orange);
    addPill(slide, "Robô WhatsApp integrado", 754, 430, 300, colors.green);
    addBox(slide, { left: 86, top: 560, width: 690, height: 72 }, "#FFFFFF", "#FFFFFF");
    addText(slide, "Próximo passo: marcar uma demonstração e mostrar o fluxo completo ao vivo.", { left: 118, top: 584, width: 620, height: 30 }, { fontSize: 22, bold: true, color: colors.navy });
    slide.speakerNotes.textFrame.setText("Fechamento: convide para demonstração. Se for vídeo, terminar com chamada direta para contato.");
  }

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(`${OUT}/apresentacao-julian-play-comercial.pptx`);

  const roteiro = `ROTEIRO DE VIDEO - JULIAN PLAY

Duração sugerida: 2 a 3 minutos
Formato: demonstração narrada com imagens do painel e cortes rápidos entre telas

1. Abertura
Texto/narração:
"Se você vende IPTV ou P2P e ainda controla clientes por WhatsApp, planilha e anotações, o Julian Play foi criado para organizar sua operação em um painel completo."
Imagem sugerida: tela do painel inicial com a marca Julian Play.

2. Dor do cliente
Texto/narração:
"Com muitos clientes, fica fácil esquecer vencimentos, perder históricos, cobrar valor errado ou repetir atendimento manual."
Imagem sugerida: lista de clientes e painel de vencimentos.

3. Painel de controle
Texto/narração:
"Na tela inicial você acompanha clientes ativos, vencimentos próximos, receita recorrente, campanhas e pontos de atenção."
Imagem sugerida: dashboard com cartões.

4. Cadastro completo
Texto/narração:
"Cada cliente tem plano, vencimento, apps, dispositivos, tags, origem, financeiro e histórico em um só lugar."
Imagem sugerida: tela editar cliente e ações rápidas.

5. Robô WhatsApp
Texto/narração:
"O robô envia avisos, PIX, mensagens de renovação, orientações e campanhas. Quando o atendimento humano entra, ele pode pausar automaticamente."
Imagem sugerida: tela de saúde do robô e histórico unificado.

6. Financeiro e PIX
Texto/narração:
"Com a confirmação automática do PIX pelo Mercado Pago, o sistema identifica o pagamento, renova o vencimento, registra o financeiro e avisa o cliente pelo WhatsApp. O recurso funciona tanto no servidor quanto na instalação local."
Imagem sugerida: configuração do Mercado Pago, QR Code PIX e mensagem de pagamento confirmado.

7. Campanhas e CRM
Texto/narração:
"Também é possível trabalhar campanhas com imagem, teste individual e envio em lote controlado, além de acompanhar interessados no CRM."
Imagem sugerida: campanha de indicação e CRM.

8. Instalação local e painel mestre
Texto/narração:
"Você pode operar no servidor ou liberar instalação local para o cliente, mantendo o controle da licença pelo Painel Mestre."
Imagem sugerida: licença local e Painel Mestre.

9. Manutenção e segurança
Texto/narração:
"O sistema tem diagnóstico, backup, saúde do WhatsApp, logs, webhook e recuperação para reduzir suporte manual."
Imagem sugerida: manutenção e diagnóstico.

10. Fechamento
Texto/narração:
"Julian Play: um sistema para vender, atender, cobrar e controlar sua operação com mais profissionalismo. Solicite uma demonstração."
Imagem sugerida: tela final com logo Julian Play.
`;

  await fs.writeFile(`${OUT}/roteiro-video-julian-play.txt`, roteiro, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
