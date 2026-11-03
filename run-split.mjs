import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const total = 130;
const half = Math.ceil(total / 2);
const base = {
  ...process.env,
  HEADLESS: 'true',
  ACCOUNT_DELAY_SECONDS: '0',
  SITE_NAME: 'linebet',
};

function run(label, start, end) {
  return new Promise((resolve) => {
    console.log(`[${label}] Starting accounts ${start}-${end}`);
    const child = spawn('npx', ['playwright', 'test', '--reporter=line'], {
      cwd: __dirname,
      env: { ...base, START_INDEX: String(start), END_INDEX: String(end) },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
    child.on('close', (code) => {
      console.log(`[${label}] Finished (exit ${code}).`);
      resolve(code);
    });
  });
}

console.log(`Split run: ${total} accounts (${half} per shard)\n`);

const [codeA, codeB] = await Promise.all([
  run('A', 1, half),
  run('B', half + 1, total),
]);

const shots = readdirSync(path.join(__dirname, 'screenshots'))
  .filter((n) => /\.(jpg|jpeg|png)$/i.test(n) && n.startsWith('01'));
console.log(`\nScreenshots: ${shots.length}`);
console.log(`Shard A exit: ${codeA} | Shard B exit: ${codeB}`);
console.log('\nSending to Telegram...');

const notify = spawn('node', ['scripts/notify.js'], {
  cwd: __dirname,
  env: base,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
notify.stdout.on('data', (d) => process.stdout.write(d));
notify.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((r) => notify.on('close', r));
console.log('All done.');
