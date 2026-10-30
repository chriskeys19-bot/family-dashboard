import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync('site/data/boost.json', 'utf8'));
const lines = ['begin;', 'delete from daily_content;'];
for (const [listKey, rows] of Object.entries(bank.lists)) {
  rows.forEach((row, index) => {
    const body = String(row.text).replaceAll("'", "''");
    const attribution = row.attribution ? `'${String(row.attribution).replaceAll("'", "''")}'` : 'null';
    lines.push(
      `insert into daily_content (list_key, sort_order, body, attribution) values ('${listKey}', ${index}, '${body}', ${attribution});`,
    );
  });
}
lines.push('commit;');
process.stdout.write(`${lines.join('\n')}\n`);
