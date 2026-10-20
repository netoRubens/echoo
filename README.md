# ECHOO

Chat e comunidades: contas, amigos, mensagens guardadas, servidores com cargos e canais, call e compartilhamento de tela.

## Como as peças se ligam
```
 GitHub (este repositório)
   │  git push                         │  git push de uma tag (v1.5.0)
   ▼                                   ▼
 Render (servidor + site + app)      GitHub Actions
   │                                   │  gera o instalador e publica na Release
   ▼                                   ▼
 https://seu-servidor/               https://github.com/netoRubens/echoo/releases/latest/download/ECHOO-Setup.exe
   ├─ /          site (botões Baixar e Entrar online)
   ├─ /app/      app online (o mesmo código do programa)
   └─ /ws        servidor de conversa (contas, mensagens, voz)
```
- **Site e app online** são entregues pelo próprio servidor, então mudam juntos a cada deploy.
- **Programa de computador** é uma "casca" que abre o app do servidor (como o Discord). Quando você atualiza o servidor, o programa já mostra a versão nova na próxima vez que abrir, ou na hora, pelo botão "Atualizar agora".
- **A casca em si** (janela, instalador) só muda raramente, e se atualiza sozinha pelo GitHub (`electron-updater`).
- O botão **Baixar** do site usa um link fixo (`.../releases/latest/download/ECHOO-Setup.exe`) e a **versão** mostrada vem do servidor. Você nunca edita isso a mão.

## Pastas
- `servidor/`  servidor (Node.js) + `public/` (site) + `public/app/` (o app).
- `desktop/`   programa de computador (Electron): só a casca, sem cópia do app.
- `release.js` lança uma versão nova em um comando.
- `.github/workflows/build.yml`  gera o instalador na nuvem.
- `render.yaml`  receita do Render.

## Configuração (uma vez só)
1. **GitHub** — crie um repositório **público** chamado `echoo` (as atualizações automáticas leem as Releases, que precisam ser públicas) e, nesta pasta, rode:
   ```
   git init
   git add .
   git commit -m "ECHOO"
   git branch -M main
   git remote add origin https://github.com/netoRubens/echoo.git
   git push -u origin main
   ```
   Se seu usuário ou o nome do repositório forem outros, troque em `desktop/package.json` (`build.publish.owner` e `repo`) e em `servidor/version.json` (link `download`).
2. **Banco (Neon)** — em neon.tech crie um projeto e copie a *connection string* (`postgresql://...`).
3. **Servidor (Render)** — em render.com: *New > Blueprint*, escolha o repositório. Quando pedir `DATABASE_URL`, cole a string do Neon. Você ganha um endereço como `https://echoo-servidor.onrender.com`. Teste `/health`, depois `/` e `/app/`.
4. **Programa** — coloque o endereço em `desktop/config.json`:
   ```
   { "server": "https://echoo-servidor.onrender.com" }
   ```
5. **Primeira versão** — `node release.js 1.4.0` (precisa do Node e do git no seu PC). O GitHub gera o instalador e cria a Release em alguns minutos.
6. Pronto: o site (no endereço do Render) já mostra a versão e o botão Baixar funciona.

## Lançar uma versão nova (sempre assim)
1. Mexa no que quiser (app em `servidor/public/app/index.html`, servidor, site...).
2. Rode na raiz: `node release.js 1.5.0`
3. Isso atualiza a versão, faz commit e envia ao GitHub. Em poucos minutos:
   - o Render publica servidor, site e app novos (quem está com o app aberto vê "Atualizar agora");
   - o GitHub gera o instalador novo, e quem já tem o programa recebe a atualização sozinho.

## Login
Tela no estilo do Discord, simplificada: nome de usuário e senha, "Esqueceu a senha?" e "Registre-se".
Sem e-mail: ao criar a conta aparece um **código de recuperação** (mostrado uma única vez). Com ele a pessoa redefine a senha.
Em Configurações > Minha conta dá para trocar a senha e gerar um novo código.

## Avisos
- A primeira instalação mostra o aviso azul do Windows (SmartScreen), porque o programa não é assinado. As atualizações seguintes funcionam normalmente.
- No plano grátis do Render o servidor "dorme" após uns 15 min sem uso; o primeiro acesso demora de 30 a 60 s. O programa mostra uma tela de carregamento e reconecta sozinho.
- No Render use sempre o Neon (`DATABASE_URL`); sem ele os dados ficam em arquivo, que o plano grátis apaga ao reiniciar.
- As mensagens não têm criptografia de ponta a ponta.
- A Vercel não roda este servidor (não mantém conexões abertas). Como o Render já entrega site e app, você não precisa dela.
