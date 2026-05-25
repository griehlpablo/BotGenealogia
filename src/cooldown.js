const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

const cooldownPath = path.join(config.outputDir, 'search-cooldown.json');

async function readCooldowns() {
  try {
    const raw = await fs.readFile(cooldownPath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    console.warn(`[cooldown] Falha ao ler cooldown: ${error.message}`);
    return {};
  }
}

async function writeCooldowns(cooldowns) {
  await fs.mkdir(config.outputDir, { recursive: true });
  await fs.writeFile(cooldownPath, JSON.stringify(cooldowns, null, 2), 'utf8');
}

async function clearExpiredCooldowns() {
  const cooldowns = await readCooldowns();
  const now = Date.now();
  let changed = false;

  for (const [provider, entry] of Object.entries(cooldowns)) {
    const until = Date.parse(entry.until);
    if (!Number.isFinite(until) || until <= now) {
      delete cooldowns[provider];
      changed = true;
    }
  }

  if (changed) await writeCooldowns(cooldowns);
  return cooldowns;
}

async function isProviderCoolingDown(provider) {
  const cooldowns = await clearExpiredCooldowns();
  const entry = cooldowns[provider];
  if (!entry) return null;
  return entry;
}

async function setProviderCooldown(provider, reason) {
  const cooldowns = await readCooldowns();
  const minutes = config.webSearch.cooldownAfterCaptchaMinutes || 60;
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  cooldowns[provider] = { provider, until, reason };
  await writeCooldowns(cooldowns);
  console.warn(`[cooldown] Provedor ${provider} em cooldown ate ${until}: ${reason}`);
  return cooldowns[provider];
}

module.exports = {
  isProviderCoolingDown,
  setProviderCooldown,
  clearExpiredCooldowns
};
