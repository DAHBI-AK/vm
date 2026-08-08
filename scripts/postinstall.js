const { execSync } = require('child_process');

const isCloud = !!(
  process.env.RENDER
  || process.env.RAILWAY_ENVIRONMENT
  || process.env.FLY_APP_NAME
  || process.env.VM_CLOUD
  || process.env.CI
  || process.platform !== 'win32'
);

const cmd = isCloud
  ? 'node scripts/ensure-ytdlp.js'
  : 'node scripts/setup.js && node scripts/brand-setup.js';

try {
  execSync(cmd, { stdio: 'inherit' });
} catch (err) {
  if (isCloud) {
    console.warn('[postinstall]', err.message || err);
    process.exit(0);
  }
  process.exit(err.status || 1);
}
