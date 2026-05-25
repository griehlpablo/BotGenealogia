const { readProgress } = require('../src/progressStore');

async function main() {
  const progress = await readProgress();
  const people = Object.values(progress.people || {})
    .sort((a, b) => String(b.lastRunAt || '').localeCompare(String(a.lastRunAt || '')));

  console.log(`Total de pessoas no progresso: ${people.length}`);
  console.log(`cursorBySource: ${JSON.stringify(progress.cursorBySource || {}, null, 2)}`);
  console.log('\nUltimos 20 registros:');

  for (const entry of people.slice(0, 20)) {
    console.log(`- ${entry.key}`);
    console.log(`  status: ${entry.status}`);
    console.log(`  pageState: ${entry.pageState || ''}`);
    console.log(`  retryAfter: ${entry.retryAfter || ''}`);
    console.log(`  lastRunAt: ${entry.lastRunAt || ''}`);
    if (entry.reason) console.log(`  reason: ${entry.reason}`);
  }
}

main().catch((error) => {
  console.error('[progress:show] Erro inesperado:', error);
  process.exitCode = 1;
});
