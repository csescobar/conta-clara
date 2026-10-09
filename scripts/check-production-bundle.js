// Verifica o pacote de produção: falha se contiver o catálogo do design system (rota apenas de desenvolvimento) ou
// se o JavaScript carregado na primeira visita (chunk de entrada, em gzip) passar do orçamento.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const outputDir = process.argv[2] ?? 'dist/client';
const forbidden = ['Catálogo do design system', 'design-catalog'];

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const offenders = files(outputDir).filter((path) => {
  if (/design-catalog/.test(path)) return true;
  if (!/\.(js|css|html|map)$/.test(path)) return false;
  const content = readFileSync(path, 'utf8');
  return forbidden.some((marker) => content.includes(marker));
});

if (offenders.length) {
  console.error(
    `O catálogo do design system não pode estar no pacote de produção. Encontrado em:\n${offenders.map((path) => `- ${path}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`Pacote de produção sem o catálogo do design system (${outputDir}).`);

// Orçamento do chunk de entrada: react-dom + react-router sozinhos pesam cerca de 84 kB gzip (piso medido em
// 2026-10-09); o restante é layout, autenticação, armazenamento offline e painel. Medido em 114 kB (gzip -9); o limite deixa
// folga curta para que novas dependências no pacote inicial apareçam no build. Telas, gráficos, importação e
// diálogos carregam sob demanda e ficam fora deste número.
const entryBudgetKb = 120;
const html = readFileSync(join(outputDir, 'index.html'), 'utf8');
const entry = /<script[^>]+type="module"[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
if (!entry) {
  console.error('Não foi possível localizar o chunk de entrada em index.html.');
  process.exit(1);
}
const entryGzipKb = gzipSync(readFileSync(join(outputDir, entry.replace(/^\//, ''))), { level: 9 }).length / 1024;
if (entryGzipKb > entryBudgetKb) {
  console.error(`O chunk de entrada (${entry}) tem ${entryGzipKb.toFixed(1)} kB gzip e passa do orçamento de ${entryBudgetKb} kB.`);
  console.error('Carregue a novidade sob demanda (lazy) ou justifique e atualize o orçamento em scripts/check-production-bundle.js.');
  process.exit(1);
}
console.log(`Chunk de entrada: ${entryGzipKb.toFixed(1)} kB gzip (orçamento ${entryBudgetKb} kB).`);
