import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHistory} from '../lib/nba-provider.mjs';
import {teamOutlook,projectPlayers,baseline} from '../lib/model.ts';
const league=JSON.parse(await readFile(new URL('../data/league.json',import.meta.url),'utf8'));
const teams=JSON.parse(await readFile(new URL('../data/teams.json',import.meta.url),'utf8'));
assert.equal(league.teams.length,30);assert.equal(Object.keys(teams).length,30);
let players=0,modeled=0;
for(const t of league.teams){
 const d=teams[t.id];assert.ok(d);assert.equal(t.wins+t.losses,82);
 for(const p of d.players){players++;for(const h of p.history){assert.ok(h.gp<=90,`${p.name} implausible games ${h.gp}`);assert.ok(h.min>0&&h.min<49);}}
 for(const s of [baseline,{availability:-15,development:-5,fit:-6},{availability:15,development:5,fit:6}]){
  const o=teamOutlook(t,d,s,45);assert.ok(Math.abs(o.dist.reduce((a,b)=>a+b.p,0)-1)<1e-10);
  assert.ok(Math.abs(o.good+o.bad+o.middle-100)<1e-8);
  assert.ok(o.low<=o.expected&&o.expected<=o.high);
  const ps=projectPlayers(d,s);const has=ps.filter(p=>p.projection);
  assert.ok(has.reduce((a,p)=>a+p.projection.min*p.projection.gp/82,0)<=240.00001);
  for(const p of has){assert.ok(p.projection.gp>=0&&p.projection.gp<=82);assert.ok(Number.isFinite(p.projection.fp));}
  for(const p of ps.filter(p=>!p.last))assert.equal(p.projection,null);
 }
 const low=teamOutlook(t,d,{availability:-10,development:-3,fit:-3});
 const high=teamOutlook(t,d,{availability:10,development:3,fit:3});
 assert.ok(high.expected>low.expected);assert.ok(high.good>low.good);assert.ok(high.bad<low.bad);
 modeled+=d.players.filter(p=>p.history.some(h=>h.year===2026)).length;
}
const fixture={categories:[{name:'averages',names:['gamesPlayed','avgMinutes','avgPoints'],statistics:[{teamId:'1',season:{year:2026},stats:['30','20','10']},{teamId:'2',season:{year:2026},stats:['40','25','15']},{season:{year:2026},stats:['70','22.9','12.9']}]}]};
const h=parseHistory(fixture)[0];assert.equal(h.gp,70);assert.equal(h.pts,12.9);assert.deepEqual(h.teamIds,['1','2']);assert.equal(h.teamMinutes['1'],600);
console.log(`PASS: 30 teams, ${players} roster entries, ${modeled} modeled players; bounded probabilities, minute budgets, scenario direction, missing data, and traded-player deduplication.`);
