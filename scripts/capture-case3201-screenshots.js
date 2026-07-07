const { execSync } = require('child_process');
const path = require('path');

const scripts = [
  'capture-eula-screenshots.js',
  'capture-brand-screenshots.js',
];

(async () => {
  for (const script of scripts) {
    console.log('\n=== Running', script, '===\n');
    execSync(`node "${path.join(__dirname, script)}"`, { stdio: 'inherit' });
  }
  console.log('\nCase 00003201 brand/EULA screenshots captured.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
