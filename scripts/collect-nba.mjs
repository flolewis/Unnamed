import { loadLeague,loadTeam,pool } from '../lib/nba-provider.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
const dir=new URL('../data/',import.meta.url);await mkdir(dir,{recursive:true});
const league=await loadLeague();await writeFile(new URL('league.json',dir),JSON.stringify({...league,mode:'snapshot'}));
console.log(`Saved ${league.teams.length} teams for ${league.baselineSeason}`);
await pool(league.teams,2,async t=>{try{const data=await loadTeam(t.id);await writeFile(new URL(`team-${t.id}.json`,dir),JSON.stringify({...data,mode:'snapshot'}));console.log(`${t.abbreviation}: ${data.players.length} players; ${data.players.filter(p=>p.history.some(h=>h.year===2026)).length} with 2025–26 stats`);}catch(e){console.log(`${t.abbreviation}: ${e.message}`)}});
