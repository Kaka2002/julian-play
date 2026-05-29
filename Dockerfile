FROM ghcr.io/puppeteer/puppeteer:21.6.0

USER root

# Define o diretório de trabalho do bot
WORKDIR /usr/src/app

# Copia as dependências do projeto
COPY package*.json ./

# Instala os pacotes Node de forma limpa
RUN npm ci

# Copia o restante dos arquivos do robô
COPY . .

# Expõe a porta de monitoramento do Render
EXPOSE 10000

# Comando para iniciar o robô de forma otimizada
CMD [ "node", "bot.js" ]
