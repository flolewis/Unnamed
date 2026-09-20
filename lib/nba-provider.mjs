export const BASE_YEAR = 2026;
export const TARGET_SEASON = '2026–27';
const BASE = 'https://site.api.espn.com/apis';
const PLAYER = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes';
export async function fetchJson(url) {
 const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(14000) });
 if (!r.ok) throw new Error(`NBA source returned ${r.status}`);
 return r.json();
}
export async function pool(items, n, fn) {
 const results = new Array(items.length); let i=0;
 await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const index=i++; results[index]=await fn(items[index],index);}}));
 return results;
}
export async function loadLeague() {
 const source=`${BASE}/v2/sports/basketball/nba/standings?season=${BASE_YEAR}&seasontype=2`;
 const j=await fetchJson(source);
 const teams=(j.children??[]).flatMap(c=>{
  if(c.standings?.season!==BASE_YEAR) throw new Error('Unexpected standings season');
  return (c.standings?.entries??[]).map(e=>{
   const s=Object.fromEntries(e.stats.map(x=>[x.name,x.value]));
   if(!Number.isFinite(s.wins)||!Number.isFinite(s.avgPointsFor)||!Number.isFinite(s.avgPointsAgainst)) throw new Error('Incomplete standings');
   return {id:e.team.id,name:e.team.displayName,shortName:e.team.name,abbreviation:e.team.abbreviation,conference:c.abbreviation,wins:s.wins,losses:s.losses,pf:s.avgPointsFor,pa:s.avgPointsAgainst,margin:s.avgPointsFor-s.avgPointsAgainst,logo:e.team.logos?.[0]?.href??null,url:e.team.links?.find(l=>l.rel.includes('clubhouse'))?.href??'https://www.espn.com/nba/standings'};
  });
 });
 if(teams.length!==30) throw new Error('Expected 30 NBA teams');
 return {teams:teams.sort((a,b)=>b.wins-a.wins),baselineSeason:'2025–26',targetSeason:TARGET_SEASON,fetchedAt:new Date().toISOString(),source,mode:'live'};
}
function n(value){const num=Number(value);return value!=null&&value!==''&&Number.isFinite(num)?num:null;}
export function parseHistory(json) {
 const c=json.categories?.find(c=>c.name==='averages'); if(!c?.names) return [];
 const mapped=(c.statistics??[]).filter(s=>s.season?.year<=BASE_YEAR&&s.season?.year>=BASE_YEAR-2).map(s=>{
  const v=Object.fromEntries(c.names.map((key,i)=>[key,s.stats[i]]));
  const split=(key)=>String(v[key]??'').split('-').map(n);
  const [fgm,fga]=split('avgFieldGoalsMade-avgFieldGoalsAttempted');
  const [three,threeA]=split('avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted');
  const [ftm,fta]=split('avgFreeThrowsMade-avgFreeThrowsAttempted');
  return {year:s.season.year,season:s.season.displayName,teamId:String(s.teamId??''),gp:n(v.gamesPlayed),min:n(v.avgMinutes),pts:n(v.avgPoints),reb:n(v.avgRebounds),ast:n(v.avgAssists),stl:n(v.avgSteals),blk:n(v.avgBlocks),tov:n(v.avgTurnovers),fg:n(v.fieldGoalPct),ft:n(v.freeThrowPct),three,threeA,fgm,fga,ftm,fta};
 }).filter(s=>s.gp>0&&s.min>0&&s.pts!==null);
 return [...new Set(mapped.map(s=>s.year))].sort().map(year=>{
  const rows=mapped.filter(s=>s.year===year);
  const total=rows.find(s=>s.teamId===''||s.teamId==='0'||s.teamId==='-1');
  const parts=rows.filter(s=>s!==total);
  const gp=parts.reduce((a,s)=>a+s.gp,0);
  const result=total?{...total}:{...parts[0],gp};
  if(!total) for(const key of ['min','pts','reb','ast','stl','blk','tov','fg','ft','three','threeA','fgm','fga','ftm','fta']){
   const valid=parts.filter(s=>s[key]!==null); const count=valid.reduce((a,s)=>a+s.gp,0);
   result[key]=count?valid.reduce((a,s)=>a+s[key]*s.gp,0)/count:null;
  }
  if(!total&&parts.length>1){
   if(result.fga>0)result.fg=result.fgm/result.fga*100;
   if(result.fta>0)result.ft=result.ftm/result.fta*100;
  }
  result.teamMinutes=Object.fromEntries(parts.map(s=>[s.teamId,s.gp*s.min]));
  result.teamIds=parts.map(s=>s.teamId);
  return result;
 });
}
export async function loadTeam(id) {
 if(!/^\d{1,2}$/.test(id))throw new Error('Invalid team');
 const source=`${BASE}/site/v2/sports/basketball/nba/teams/${id}/roster`;
 const roster=await fetchJson(source);
 const athletes=roster.athletes??[];
 if(athletes.length<5)throw new Error('Incomplete roster');
 const players=await pool(athletes,4,async a=>{
  let history=[],error=null;
  try{history=parseHistory(await fetchJson(`${PLAYER}/${a.id}/stats?seasontype=2`));}catch{error='Player statistics unavailable';}
  return {id:a.id,name:a.displayName,position:a.position?.abbreviation??'—',age:a.age??null,jersey:a.jersey??null,history,status:a.injuries?.[0]?.status??null,statusDate:a.injuries?.[0]?.date??null,source:`${PLAYER}/${a.id}/stats?seasontype=2`,url:a.links?.find(l=>l.rel.includes('stats')&&l.rel.includes('desktop'))?.href??null,error};
 });
 return {id,players,rosterSeason:roster.season?.displayName??'Not supplied',rosterTimestamp:roster.timestamp??null,fetchedAt:new Date().toISOString(),source,mode:'live',warnings:players.some(p=>p.error)?['Some player statistics could not be refreshed. Missing values are not projected.']:[]};
}
