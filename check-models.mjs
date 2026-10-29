// Prints the model ids your Token Factory key can actually see, so the values
// in .env are copied from reality instead of guessed.

const base = (process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/+$/, '');
const key = process.env.NEBIUS_API_KEY;

if (!key) {
  console.error('NEBIUS_API_KEY is not set. Add it to .env, then run: npm run models');
  process.exit(1);
}

const res = await fetch(`${base}/models`, {
  headers: { Authorization: `Bearer ${key}` },
});

if (!res.ok) {
  console.error(`Token Factory returned ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}

const { data = [] } = await res.json();
console.log(`\n${data.length} models available to this key:\n`);
for (const model of data.sort((a, b) => (a.id || '').localeCompare(b.id || ''))) {
  console.log(`  ${model.id}`);
}
console.log('\nCopy the three ids you want into NEBIUS_MODEL_FAST / MAIN / DEEP in .env\n');
