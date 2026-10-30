import { writeFileSync } from 'node:fs';
import { calm } from './content/calm.mjs';
import { jokes } from './content/jokes.mjs';
import { kidQuotes } from './content/kid-quotes.mjs';
import { parentQuotes } from './content/parent-quotes.mjs';
import { tips } from './content/tips.mjs';

const lists = {
  kid_quotes: kidQuotes,
  jokes,
  parent_quotes: parentQuotes,
  calm,
  tips,
};

for (const [name, rows] of Object.entries(lists)) {
  if (rows.length < 120) throw new Error(`${name} has ${rows.length}, need 120`);
  const texts = rows.map((row) => (typeof row === 'string' ? row : row.text));
  if (new Set(texts).size !== texts.length) throw new Error(`${name} has duplicate text`);
  if (name.endsWith('quotes')) {
    for (const row of rows) {
      if (!row.attribution || row.attribution.length < 3) throw new Error(`Missing attribution in ${name}`);
    }
  }
}

const bank = {
  version: 1,
  timezone: 'America/Los_Angeles',
  epoch: '2026-01-01',
  note: 'Bundled bank. Import into daily_content later with scripts/export-boost-sql.mjs. The app prefers that table when it has rows.',
  lists: {
    kid_quotes: kidQuotes,
    jokes: jokes.map((text) => ({ text })),
    parent_quotes: parentQuotes,
    calm: calm.map((text) => ({ text })),
    tips: tips.map((text) => ({ text })),
  },
};

writeFileSync('site/data/boost.json', `${JSON.stringify(bank, null, 2)}\n`);
console.log(Object.fromEntries(Object.entries(bank.lists).map(([key, rows]) => [key, rows.length])));
