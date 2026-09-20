import fs from 'node:fs/promises';
import {fetchJson,pool,parseHistory} from '../lib/nba-provider.mjs';
await fs.mkdir('data/research',{recursive:true});
const snapshots=JSON.parse(await fs.readFile('data/teams.json','utf8'));
const players=[...new Map(Object.values(snapshots).flatMap(t=>t.players).map(p=>[p.id,p])).values()];
const history=await pool(players,6,async p=>{try{return {...p,history:parseHistory(await fetchJson(p.source),2015)}}catch{return {...p,history:[],error:'History unavailable'}}});
await fs.writeFile('data/research/players.json',JSON.stringify(history));
const seasons=await pool(Array.from({length:12},(_,i)=>2015+i),4,async year=>{
 const source=`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${year}&seasontype=2`;
 const j=await fetchJson(source);if(j.children.some(c=>c.standings.season!==year))throw Error('Season mismatch');
 return {year,source,teams:j.children.flatMap(c=>c.standings.entries.map(e=>{const s=Object.fromEntries(e.stats.map(s=>[s.name,s.value]));return {id:e.team.id,wins:s.wins,losses:s.losses,pf:s.avgPointsFor,pa:s.avgPointsAgainst,margin:s.avgPointsFor-s.avgPointsAgainst}}))};
});
await fs.writeFile('data/research/seasons.json',JSON.stringify(seasons));
const events=(await pool(Object.keys(snapshots),4,async id=>{
 const j=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${id}/schedule?season=2027&seasontype=2`);
 return (j.events??[]).filter(e=>e.season.year===2027&&e.seasonType.type===2).map(e=>({id:e.id,date:e.date,home:e.competitions[0].competitors.find(c=>c.homeAway==='home').id,away:e.competitions[0].competitors.find(c=>c.homeAway==='away').id}));
})).flat();
const games=[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>a.date.localeCompare(b.date));
await fs.writeFile('data/schedule.json',JSON.stringify({fetchedAt:new Date().toISOString(),season:2027,source:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/25/schedule?season=2027&seasontype=2',games}));
console.log(JSON.stringify({players:history.length,histories:history.filter(p=>p.history.length).length,seasons:seasons.length,games:games.length}));
