// Falha se o pacote de produção contiver o catálogo do design system (rota apenas de desenvolvimento).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
