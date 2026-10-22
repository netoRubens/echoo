// Uso:
//   node release.js 1.5.0               -> atualiza site, app online e servidor (o programa instalado já mostra a versão nova)
//   node release.js 1.5.0 --programa    -> o mesmo + gera um instalador novo (use só quando mudar a pasta desktop/)
// Em ambos os casos o Render publica o servidor/site/app. Com --programa o GitHub também gera o instalador
// e quem já tem o programa recebe a atualização sozinho.
const fs = require('fs'), cp = require('child_process');
const args = process.argv.slice(2), v = args.find(a => /^\d+\.\d+\.\d+$/.test(a)), prog = args.includes('--programa');
if (!v) { console.log('Uso: node release.js 1.5.0 [--programa]'); process.exit(1); }
const edit = (f, fn) => fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
edit('servidor/version.json', s => { const j = JSON.parse(s); j.version = v; if (prog) j.shell = v; return JSON.stringify(j, null, 2) + '\n'; });
if (prog) edit('desktop/package.json', s => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
const run = c => { console.log('> ' + c); cp.execSync(c, { stdio: 'inherit' }); };
if (cp.execSync('git status --porcelain').toString().trim()) { run('git add -A'); run(`git commit -m "ECHOO v${v}"`); }
if (prog) run(`git tag v${v}`);
run('git push'); if (prog) run(`git push origin v${v}`);
console.log(`\nPronto: v${v} enviada.` + (prog ? ' O instalador novo sai em alguns minutos.' : ''));
