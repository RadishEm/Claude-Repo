// Launches headless Chromium for Lagos Life.
// In Claude Code cloud sessions HTTPS goes through an intercepting proxy whose CA
// Chromium does not read from the system store. We pin trust to that one CA by its
// SPKI hash; every other certificate check stays on.
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright');

const PROXY_CA_BUNDLE = '/root/.ccr/ca-bundle.crt';

function proxyCaSpkiHashes() {
  if (!fs.existsSync(PROXY_CA_BUNDLE)) return [];
  const pems = fs.readFileSync(PROXY_CA_BUNDLE, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return pems
    .map((pem) => new crypto.X509Certificate(pem))
    .filter((cert) => /agent-proxy/i.test(cert.subject))
    .map((cert) => crypto.createHash('sha256').update(cert.publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
}

function chromiumPath() {
  for (const p of [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium']) if (p && fs.existsSync(p)) return p;
  return undefined; // fall back to Playwright's own download
}

async function launch() {
  const args = [];
  const spki = proxyCaSpkiHashes();
  if (spki.length) args.push(`--ignore-certificate-errors-spki-list=${spki.join(',')}`);
  return chromium.launch({ executablePath: chromiumPath(), args });
}

module.exports = { launch };
