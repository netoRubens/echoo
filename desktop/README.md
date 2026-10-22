# ECHOO

Chat e comunidades: contas, amigos, mensagens guardadas, servidores com cargos e canais, call e compartilhamento de tela.

## Como as peças se ligam
```
 GitHub (este repositório)
   │  git push                         │  git push de uma tag (v1.5.0, só com --programa)
   ▼                                   ▼
 Render (servidor + site + app)      GitHub Actions (Windows)
   │                                   │  electron-builder -> pasta do app -> Inno Setup -> ECHOO-Setup.exe
   ▼                                   ▼
 https://seu-servidor/               github.com/netoRubens/echoo/releases/latest/download/ECHOO-Setup.exe
   ├─ /          site (Baixar e Entrar online)           (+ ECHOO-Setup.exe.sha256, conferido na atualização)
   ├─ /app/      app online (o mesmo código do programa)
   ├─ /brand/    ícones (favicon, logo, manifesto)
   └─ /ws        servidor de conversa (contas, mensagens, voz)
```
- **Site e app online** são entregues pelo próprio servidor e mudam juntos a cada deploy.
- **Programa de computador** é uma "casca" que abre o app do servidor (como o Discord). Quando o servidor atualiza, o programa já mostra a versão nova (ou o botão "Atualizar agora").
- **A casca** (janela e instalador) raramente muda. Quando muda, o programa baixa o instalador novo da Release oficial, confere o SHA-256 e atualiza em modo silencioso.
- O botão **Baixar** do site usa um link fixo e a **versão** vem do servidor (`/api/version`). Você nunca edita isso à mão.

## Pastas
- `servidor/`  servidor (Node.js) + `public/` (site) + `public/app/` (o app) + `public/brand/` (ícones).
- `desktop/`   programa de computador (Electron): só a casca. `installer/ECHOO.iss` é o script do **Inno Setup**.
- `release.js` lança versões em um comando.
- `.github/workflows/build.yml`  gera o instalador na nuvem (com assinatura, se houver certificado).
- `render.yaml`  receita do Render.

## Configuração (uma vez só)
1. **GitHub** — crie um repositório **público** chamado `echoo` e, nesta pasta, rode:
   ```
   git init
   git add .
   git commit -m "ECHOO"
   git branch -M main
   git remote add origin https://github.com/netoRubens/echoo.git
   git push -u origin main
   ```
   Se o usuário ou o nome do repositório forem outros, troque em `desktop/config.json` (`github`) e em `servidor/version.json` (`download`).
2. **Banco (Neon)** — em neon.tech crie um projeto e copie a *connection string* (`postgresql://...`).
3. **Servidor (Render)** — em render.com: *New > Blueprint*, escolha o repositório. Cole a string do Neon em `DATABASE_URL`. Você ganha um endereço como `https://echoo-servidor.onrender.com`. Teste `/health`, `/` e `/app/`.
4. **Programa** — coloque o endereço em `desktop/config.json`:
   ```
   { "server": "https://echoo-servidor.onrender.com", "github": "netoRubens/echoo" }
   ```
5. **Primeira versão do programa** — `node release.js 1.4.0 --programa`. Em 5 a 10 minutos o GitHub gera o `ECHOO-Setup.exe` (aba *Actions* / *Releases*).
6. Pronto: o site já mostra a versão e o botão Baixar funciona.

## Lançar versões
| Mudou... | Comando | O que acontece |
|---|---|---|
| site, app, servidor | `node release.js 1.5.0` | Render publica; programa instalado mostra a versão nova |
| a pasta `desktop/` (janela, ícone, atualizador) | `node release.js 1.5.0 --programa` | o mesmo + instalador novo; quem tem o programa recebe sozinho |

Use `--programa` só quando precisar: cada instalador novo é um arquivo novo para os antivírus.

## Atualizar quem já instalou (sem reinstalar)
| O que mudou | O que seus amigos precisam fazer |
|---|---|
| site, app, servidor | **Nada.** Atualiza sozinho (o app mostra "Atualizar agora" se estiver aberto). |
| janela, ícone, instalador (`--programa`) | **Nada.** O programa baixa o instalador novo da Release, confere o SHA-256 e atualiza sozinho. |
| quem instalou a **versão antiga** (instalador NSIS, sem atualizador próprio) | **Uma vez só:** o app mostra "Há um novo instalador do ECHOO", é só clicar em *Baixar instalador* e executar. O instalador novo remove a versão antiga sozinho. Depois disso nunca mais. |

Os dados ficam no servidor, então trocar de instalador não perde conta, amigos nem mensagens.
Os ícones (janela, barra de tarefas, atalho, instalador) só mudam depois que a casca nova é instalada. Se o Windows
continuar mostrando o ícone antigo, desafixe e fixe de novo na barra de tarefas (o Windows guarda ícones em cache).
Na tela *Configurações > Sobre*, o número grande é a versão do site/app/servidor; o menor é a da janela/instalador.
Eles podem ser diferentes de propósito: só o primeiro muda no dia a dia.

## Instalador com Inno Setup
- **Na nuvem:** o workflow instala o Inno Setup e compila `desktop/installer/ECHOO.iss` sozinho.
- **No seu PC:** instale o Inno Setup 6 (jrsoftware.org/isdl.php) e dê dois cliques em `desktop/GERAR-INSTALADOR.bat`. Ele gera o app e compila o instalador em `desktop/dist-installer/ECHOO-Setup.exe`.
  Se o `electron-builder` reclamar de "symbolic link", ative o Modo de Desenvolvedor do Windows (Configurações > Privacidade > Para desenvolvedores).
- O instalador é por usuário (não pede administrador), cria atalhos e desinstalador e fecha/reabre o programa ao atualizar.
- Você pode abrir o `ECHOO.iss` no Inno Setup Compiler para mudar textos, pasta de instalação, idiomas etc.

## Ícone
O ícone vem do `ICON.png` que você enviou e já está em: janela e `.exe` do programa, instalador, atalhos, favicon do site e do app online, menu lateral do app, tela de login e tela de carregamento. Para trocar de novo, substitua os arquivos de `servidor/public/brand/` e `desktop/build/` (o `.ico` precisa ter vários tamanhos).

## Antivírus e SmartScreen (leia isto)
**Por que sinaliza:** o programa não tem assinatura digital e cada instalador novo é um arquivo "desconhecido". Os antivírus (principalmente o Defender, por heurística) desconfiam de programas Electron sem assinatura. Isso é **falso positivo**.

**O que já foi feito:** instalador Inno Setup, ícone e informações (nome, versão, empresa) embutidos no `.exe` (antes estavam desligados), instalação por usuário, programa reconstruído só quando necessário e atualização verificada por hash.

**O que de fato resolve:** assinatura de código e tempo de reputação. O Inno Setup sozinho **não** elimina o aviso. Opções:
1. **Certificado de assinatura de código** (OV/EV), comprado de uma autoridade (cerca de US$ 100 a 400 por ano). A reputação no SmartScreen ainda leva um tempo.
2. **SignPath Foundation**: assinatura gratuita para projetos de código aberto (exige repositório público, licença de código aberto e aprovação).
3. **Azure Trusted Signing**: assinatura por assinatura mensal baixa; confira se aceita seu país e tipo de conta.
4. **Microsoft Store**: conta de desenvolvedor paga uma única vez (cerca de US$ 19 para pessoa física); a Microsoft assina e distribui. Exige empacotar em MSIX, que não está incluído aqui.

**Ligar um certificado ao workflow (se comprar um):** exporte o `.pfx`, converta para texto com `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard` no PowerShell e crie dois *Secrets* no GitHub (*Settings > Secrets and variables > Actions*): `WINDOWS_CERT_BASE64` (o texto) e `WINDOWS_CERT_PASSWORD` (a senha). O workflow passa a assinar o `ECHOO.exe` e o instalador automaticamente.

**Enquanto isso:**
- Envie o instalador para análise da Microsoft como falso positivo: microsoft.com/wdsi/filesubmission (escolha "Software developer"). Costuma resolver em dias, mas se repete em cada arquivo novo.
- Veja quais antivírus sinalizam em virustotal.com.
- Quem instalar: na tela azul do SmartScreen, *Mais informações > Executar assim mesmo*. Se o Defender bloquear: *Segurança do Windows > Proteção contra vírus > Histórico de proteção > Permitir no dispositivo*.

## Login
Nome de usuário e senha, "Esqueceu a senha?" e "Registre-se". Sem e-mail: ao criar a conta aparece um **código de recuperação**, mostrado uma única vez. Em Configurações > Minha conta dá para trocar a senha e gerar outro código.

## Avisos
- No plano grátis do Render o servidor "dorme" após uns 15 min sem uso; o primeiro acesso demora de 30 a 60 s. O programa mostra uma tela de carregamento.
- No Render use sempre o Neon (`DATABASE_URL`); sem ele os dados ficam em arquivo, que o plano grátis apaga ao reiniciar.
- As mensagens não têm criptografia de ponta a ponta.
- A Vercel não roda este servidor (não mantém conexões abertas); o Render já entrega site e app.
