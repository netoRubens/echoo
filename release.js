// Uso:  node release.js 1.5.0
// Atualiza a versão do programa e do servidor, faz commit, cria a tag e envia ao GitHub.
// Resultado: o Render publica o servidor/site/app novos e o GitHub gera o instalador novo
// (quem já tem o programa instalado recebe a atualização sozinho).
const fs = require('fs'), cp = require('child_process');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.log('Uso: node release.js 1.5.0'); process.exit(1); }
const edit = (f, fn) => fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
edit('desktop/package.json', s => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
edit('servidor/version.json', s => JSON.stringify({ ...JSON.parse(s), version: v }, null, 2) + '\n');
const run = c => { console.log('> ' + c); cp.execSync(c, { stdio: 'inherit' }); };
if (cp.execSync('git status --porcelain').toString().trim()) { run('git add -A'); run(`git commit -m "ECHOO v${v}"`); }
run(`git tag v${v}`); run('git push'); run(`git push origin v${v}`);
console.log(`\nPronto: v${v} enviada. Em alguns minutos o site/app e o instalador estarão atualizados.`);
