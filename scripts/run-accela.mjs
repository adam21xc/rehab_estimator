// Load gitignored local credentials without printing them; hosted runs use env secrets.
import { loadEnv } from 'vite';
import { spawnSync } from 'node:child_process';
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const result = spawnSync('python3', ['scripts/accela/import_cases.py', ...process.argv.slice(2)], {
	env,
	stdio: 'inherit'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
