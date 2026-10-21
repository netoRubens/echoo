ECHOO - SERVIDOR CENTRAL
========================

O que ele faz
- Contas (usuario + senha, guardada com scrypt), login que lembra o dispositivo.
- Busca de pessoas por nome de usuario ou nome (so existe quem tem conta).
- Pedidos de amizade guardados no servidor: a pessoa pode aceitar depois, mesmo que voce esteja offline.
- Mensagens guardadas (DMs e canais). Ultimas 2000 por conversa; o app carrega as 100 mais recentes.
- Servidores com foto, descricao, cargos, canais de texto/voz, convites e permissoes (tudo validado no servidor).
- Quem esta online, status, quem esta em cada call e ligacao com aceite.
- Sinalizacao da voz e da transmissao de tela (o audio/video continua indo direto entre os amigos).
- Serve tambem o site (public/index.html) e o app online (public/app/index.html).

1) TESTAR NO SEU PC
   Precisa do Node.js 18+ (https://nodejs.org).
     npm install
     npm start
   Abra http://localhost:3000 (site) e http://localhost:3000/app/ (app online).
   Os dados ficam em data/echoo.json (copie esse arquivo para fazer backup).

2) AMIGOS TESTAREM DE FORA, SEM HOSPEDAR (so enquanto seu PC estiver ligado)
   Instale o cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) e rode:
     cloudflared tunnel --url http://localhost:3000
   Ele mostra um endereco https://algo.trycloudflare.com . Seus amigos abrem esse endereco no navegador,
   ou digitam ele no campo "Servidor" do app de computador.

3) HOSPEDAR DE VERDADE (sempre no ar)
   Precisa de um servico com DISCO PERSISTENTE, senao as contas somem quando o servidor reinicia:
   - Fly.io ou Railway: crie o app a partir desta pasta (tem Dockerfile) e anexe um volume em /data.
   - Um VPS qualquer (Oracle Cloud tem plano gratis): instale Node, copie esta pasta, rode com
     pm2 ou systemd, e coloque Nginx/Caddy na frente para ter HTTPS.
   - Render: o plano gratis NAO guarda arquivos entre reinicios. So serve para teste.
   Variaveis opcionais:
     PORT       porta (padrao 3000)
     DATA_DIR   pasta dos dados (padrao ./data; com Docker e /data)
     DATABASE_URL   Postgres (Neon, Supabase...). Se definido, os dados ficam la e sobrevivem a reinicios.
     TURN_URL, TURN_USER, TURN_PASS   servidor TURN (ajuda a voz e a tela funcionarem em redes dificeis)
   HTTPS e obrigatorio para microfone e compartilhamento de tela no navegador. Os servicos acima ja dao HTTPS.

4) PROGRAMA DE COMPUTADOR
   Ele abre o app que esta neste servidor (https://seu-endereco/app/). Coloque o endereco em desktop/config.json:
     { "server": "https://seu-endereco" }
   Assim o programa, o app online e o site sempre sao a mesma versao.

5) SITE E VERSAO
   O site le a versao e o link de download em /api/version, que vem de servidor/version.json.
   Para lancar versoes use `node release.js 1.5.0` (ou com --programa); veja o README.md.

Seguranca e limites
- Senhas nunca sao guardadas em texto; ha limite de tentativas de login e de criacao de contas por IP.
- As mensagens ficam no servidor sem criptografia de ponta a ponta. Quem administra o servidor pode ler.
- Nao ha recuperacao de senha por e-mail nesta versao.
- Um unico processo guarda tudo em memoria + arquivo JSON: otimo para centenas de amigos,
  nao para milhares de usuarios. Para crescer, o proximo passo e trocar o arquivo por banco de dados.
