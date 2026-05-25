const fs = require('fs/promises');
const { progressPath } = require('../src/progressStore');

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Para apagar o progresso, rode: npm run progress:reset -- --yes');
    process.exitCode = 1;
    return;
  }

  try {
    await fs.unlink(progressPath);
    console.log(`Progresso apagado: ${progressPath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Nenhum progresso para apagar: ${progressPath}`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('[progress:reset] Erro inesperado:', error);
  process.exitCode = 1;
});
