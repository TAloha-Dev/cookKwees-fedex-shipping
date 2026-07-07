const { execSync } = require('child_process');
const path = require('path');

const scripts = [
  'capture-sweden-screenshot.js',
  'capture-rate-screenshot.js',
];

(async () => {
  for (const script of scripts) {
    console.log('\n=== Running', script, '===\n');
    execSync(`node "${path.join(__dirname, script)}"`, { stdio: 'inherit' });
  }
  console.log('\nAll validation screenshots captured.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
