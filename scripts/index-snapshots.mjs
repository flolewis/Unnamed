import {readdir,readFile,writeFile} from 'node:fs/promises';
const base=new URL('../data/',import.meta.url);
const files=(await readdir(base)).filter(x=>/^team-\d+\.json$/.test(x));
const teams=Object.fromEntries(await Promise.all(files.map(async f=>{const t=JSON.parse(await readFile(new URL(f,base),'utf8'));return [t.id,t]})));
await writeFile(new URL('teams.json',base),JSON.stringify(teams));
console.log(`Indexed ${Object.keys(teams).length} team snapshots`);
