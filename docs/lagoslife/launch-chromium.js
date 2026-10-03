const { chromium } = require('playwright');
const { execSync } = require('child_process');
// Trust only the sandbox proxy's interception CA (by SPKI pin); all other cert checks stay on.
function proxySpki() {
  return execSync(`python3 -c "
import re,subprocess,base64
pem=open('/root/.ccr/ca-bundle.crt').read()
for c in re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',pem,re.S):
  s=subprocess.run(['openssl','x509','-noout','-subject'],input=c,capture_output=True,text=True).stdout
  if 'agent-proxy' in s:
    pub=subprocess.run(['openssl','x509','-pubkey','-noout'],input=c,capture_output=True,text=True).stdout
    der=subprocess.run(['openssl','pkey','-pubin','-outform','der'],input=pub.encode(),capture_output=True).stdout
    print(base64.b64encode(subprocess.run(['openssl','dgst','-sha256','-binary'],input=der,capture_output=True).stdout).decode())
"`).toString().trim().split('\n').join(',');
}
async function launch() {
  const args = [];
  if (process.env.HTTPS_PROXY && require('fs').existsSync('/root/.ccr/ca-bundle.crt'))
    args.push(`--ignore-certificate-errors-spki-list=${proxySpki()}`);
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args });
}
module.exports = { launch };
