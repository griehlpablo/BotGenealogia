const fs = require('fs/promises');
const path = require('path');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function cookiePath(sessionsDir, site) {
  return path.join(sessionsDir, `${site}-cookies.json`);
}

async function loadCookies(page, sessionsDir, site) {
  const file = cookiePath(sessionsDir, site);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const cookies = JSON.parse(raw);
    if (Array.isArray(cookies) && cookies.length > 0) {
      await page.setCookie(...cookies);
      return cookies.length;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[sessao] Nao foi possivel carregar cookies de ${file}: ${error.message}`);
    }
  }
  return 0;
}

async function saveCookies(page, sessionsDir, site) {
  await ensureDir(sessionsDir);
  const cookies = await page.cookies();
  const file = cookiePath(sessionsDir, site);
  await fs.writeFile(file, JSON.stringify(cookies, null, 2), 'utf8');
  return file;
}

module.exports = {
  loadCookies,
  saveCookies
};
