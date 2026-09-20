import fs from 'node:fs/promises';
import {fetchJson,pool} from '../lib/nba-provider.mjs';
const base='https://api.pbpstats.com',params='Season=2025-26&SeasonType=Regular+Season';
const [pace,totals,players]=await Promise.all([fetchJson(`${base}/get-pace-efficiency-summary/nba?${params}&Type=Team`),fetchJson(`${base}/get-totals/nba?${params}&Type=Team`),fetchJson(`${base}/get-totals/nba?${params}&Type=Player`)]);
const league=JSON.parse(await fs.readFile('data/league.json','utf8')),snapshots=JSON.parse(await fs.readFile('data/teams.json','utf8'));
const alias={GS:'GSW',NY:'NYK',NO:'NOP',SA:'SAS',UTAH:'UTA',WSH:'WAS'};
const normalize=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
const teams=await pool(league.teams,3,async t=>{
 const pbp=pace.results.find(p=>p.team_name===(alias[t.abbreviation]??t.abbreviation));if(!pbp)return {id:t.id,error:'Team mapping unavailable'};
 const total=totals.multi_row_table_data.find(p=>String(p.EntityId)===pbp.team_id);
 const roster=snapshots[t.id].players;
 const stars=roster.filter(p=>p.history.find(h=>h.year===2026)?.teamIds.includes(t.id)).sort((a,b)=>b.history.at(-1).pts-a.history.at(-1).pts).slice(0,2);
 const onoff=await pool(stars,2,async star=>{
  const matches=players.multi_row_table_data.filter(p=>normalize(p.Name)===normalize(star.name));
  const id=matches[0]?.EntityId;if(!id)return {playerId:star.id,name:star.name,rows:[],error:'Player identifier not matched'};
  const source=`${base}/get-on-off/nba/player?${params}&TeamId=${pbp.team_id}&PlayerId=${id}`;
  try{const j=await fetchJson(source);const rows=(j.results.Usage??[]).map(r=>{const match=roster.filter(p=>normalize(p.name)===normalize(r.Name));return {id:match.length===1?match[0].id:null,name:r.Name,on:Number(r.On),off:Number(r.Off),minutesOn:r.MinutesOn,minutesOff:r.MinutesOff}}).filter(r=>r.id);return {playerId:star.id,name:star.name,rows,source};}
  catch{return {playerId:star.id,name:star.name,rows:[],source,error:'On/off unavailable'}}
 });
 return {id:t.id,pbpId:pbp.team_id,secondsPerPossession:pbp.spp,pointsPerPossession:pbp.ppp,pace:total?.SecondsPlayed?((total.OffPoss+total.DefPoss)/2)/(total.SecondsPlayed/60)*48:null,onoff};
});
await fs.writeFile('data/context.json',JSON.stringify({season:'2025–26',fetchedAt:new Date().toISOString(),source:`${base}/get-totals/nba?${params}&Type=Team`,teams}));
console.log({teams:teams.length,mapped:teams.filter(t=>t.pbpId).length,onoff:teams.flatMap(t=>t.onoff??[]).filter(o=>o.rows.length).length});
