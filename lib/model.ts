import trained from '../data/model-v2.json' with {type:'json'};
import leagueSnapshot from '../data/league.json' with {type:'json'};
import schedule from '../data/schedule.json' with {type:'json'};
import {predict,roleFeatures,gamesFeatures,rateFeatures,teamFeatures} from './learning.mjs';
export type Stats={year:number;season:string;gp:number;min:number;pts:number;reb:number;ast:number;stl:number;blk:number;tov:number;three:number|null;threeA:number|null;fg:number|null;ft:number|null;fgm:number|null;fga:number|null;ftm:number|null;fta:number|null;teamIds:string[];teamMinutes:Record<string,number>};
export type Player={id:string;name:string;position:string;age:number|null;jersey:string|null;history:Stats[];status:string|null;statusDate:string|null;url:string|null;source:string;error:string|null};
export type Team={id:string;name:string;shortName:string;abbreviation:string;conference:string;wins:number;losses:number;pf:number;pa:number;margin:number;logo:string|null;url:string};
export type TeamData={id:string;players:Player[];rosterSeason:string;rosterTimestamp:string|null;fetchedAt:string;source:string;mode:string;warnings:string[]};
export type LeagueData={teams:Team[];baselineSeason:string;targetSeason:string;fetchedAt:string;source:string;mode:string;warning?:string};
export type RotationEdit={min?:number;gp?:number;usage?:number;role?:string};
export type Scenario={availability:number;development:number;fit:number;pace?:number;rotation?:Record<string,RotationEdit>};
export const baseline:Scenario={availability:0,development:0,fit:0};
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const fantasy=(s:{pts:number;reb:number;ast:number;stl:number;blk:number;tov:number})=>s.pts+1.2*s.reb+1.5*s.ast+3*(s.stl+s.blk)-s.tov;
export const lastStats=(p:Player)=>p.history.find(h=>h.year===2026);
export function projectPlayers(data:TeamData,scenario:Scenario){
 const eligible=data.players.filter(p=>lastStats(p));
 const allocation=(p:Player)=>{const last=lastStats(p)!,prior=p.history.find(h=>h.year===2025),age=p.age??27,edit=scenario.rotation?.[p.id];return {gp:Math.round(clamp(edit?.gp??(predict(trained.games.model,gamesFeatures(last,prior,age))+scenario.availability),0,82)),min:clamp(edit?.min??predict(trained.minutes.model,roleFeatures(last,prior,age)),0,48)};};
 const minutesSum=eligible.reduce((sum,p)=>{const v=allocation(p);return sum+v.min*v.gp/82},0);
 // Keep minutes conditional on playing; conserve the seasonal 240-minute budget.
 const scale=Math.min(1,240/(minutesSum||240));
 return data.players.map(p=>{
  const last=lastStats(p);if(!last)return {...p,last:null,projection:null};
  const prior=p.history.find(h=>h.year===2025),age=p.age??27,edit=scenario.rotation?.[p.id];
  const {gp,min:requestedMin}=allocation(p),min=requestedMin*scale;
  const context=(1+(scenario.pace??0)/100)*(1+scenario.development/100);
  const rate=(key:keyof typeof trained.rates)=>{const m=trained.rates[key];return Math.max(0,predict(m.model,rateFeatures(last,prior,age,key,m.mean,m.shrink)))};
  const usage=1+(edit?.usage??0)/100;
  const stats={pts:rate('pts')*min*context*usage,reb:rate('reb')*min*context,ast:rate('ast')*min*context*usage,stl:rate('stl')*min*context,blk:rate('blk')*min*context,tov:rate('tov')*min*(1+(scenario.pace??0)/100)*usage,three:rate('three')*min*context*usage};
  const projected={gp,min,...stats,fg:last.fg,ft:last.ft};
  const fp=fantasy(projected),baseFp=fantasy(last);
  const uncertain=(last.gp<20?1.5:1)*(prior?1:1.25)*(last.teamIds.includes(data.id)?1:1.15);
  const gpRadius=trained.games.report.radius80*uncertain,minRadius=trained.minutes.report.radius80*uncertain;
  const rateRadius=(trained.rates.pts.report.radius80+1.2*trained.rates.reb.report.radius80+1.5*trained.rates.ast.report.radius80+3*trained.rates.stl.report.radius80+3*trained.rates.blk.report.radius80+trained.rates.tov.report.radius80)*min;
  const fpRadius=Math.hypot(rateRadius,fp*minRadius/Math.max(min,1))*uncertain;
  return {...p,last,projection:{...projected,fp,total:fp*gp,change:baseFp?((fp-baseFp)/baseFp)*100:0,ageFactor:1,minuteScale:scale,requestedMin,gpLow:Math.round(clamp(gp-gpRadius,0,82)),gpHigh:Math.round(clamp(gp+gpRadius,0,82)),fpLow:Math.max(0,fp-fpRadius),fpHigh:fp+fpRadius,role:edit?.role??(min>=28?'Starter':min>=15?'Rotation':'Bench'),usage:edit?.usage??0}};
 }).sort((a,b)=>(b.projection?.fp??-1)-(a.projection?.fp??-1));
}
export function rotationSummary(data:TeamData,scenario:Scenario){
 const projected=projectPlayers(data,scenario);const used=projected.reduce((s,p)=>s+(p.projection?p.projection.min*p.projection.gp/82:0),0);
 const shots=projected.reduce((s,p)=>s+(p.projection&&p.last?(p.last.fga??0)/p.last.min*p.projection.min*p.projection.gp/82*(1+p.projection.usage/100):0),0);
 return {used,unassigned:240-used,shots,positions:['G','F','C'].map(position=>({position,minutes:projected.filter(p=>p.position.includes(position)).reduce((s,p)=>s+(p.projection?p.projection.min*p.projection.gp/82:0),0)}))};
}
export function teamDynamics(team:Team,data:TeamData){
 const valid=data.players.filter(p=>lastStats(p));
 const totalMinutes=valid.reduce((s,p)=>s+lastStats(p)!.min,0);
 const withAge=valid.filter(p=>p.age!=null);
 const ageMinutes=withAge.reduce((s,p)=>s+lastStats(p)!.min,0);
 const age=ageMinutes?withAge.reduce((s,p)=>s+p.age!*lastStats(p)!.min,0)/ageMinutes:null;
 const retained=valid.reduce((s,p)=>s+(lastStats(p)!.teamMinutes?.[team.id]??0),0);
 const continuity=clamp(retained/((team.wins+team.losses)*240)*100,0,100);
 const topScorers=[...valid].sort((a,b)=>lastStats(b)!.pts-lastStats(a)!.pts);
 const scoring=valid.reduce((s,p)=>s+lastStats(p)!.pts,0);
 const concentration=scoring?topScorers.slice(0,3).reduce((s,p)=>s+lastStats(p)!.pts,0)/scoring*100:0;
 const durability=totalMinutes?valid.reduce((s,p)=>s+Math.min(82,lastStats(p)!.gp)*lastStats(p)!.min,0)/totalMinutes:0;
 const newcomers=valid.filter(p=>!lastStats(p)!.teamIds.includes(team.id));
 const unmodeled=data.players.length-valid.length;
 return {age,continuity,concentration,durability,newcomers,unmodeled,modeled:valid.length,total:data.players.length,totalMinutes};
}
export function teamOutlook(team:Team,data:TeamData|undefined,scenario:Scenario=baseline,goodTarget=45){
 const d=data?teamDynamics(team,data):null;
 const baselineWins=(t:Team)=>clamp(predict(trained.team.model,teamFeatures(t,trained.priorTeams.find(p=>p.id===t.id))),5,77);
 const baseMean=baselineWins(team);
 // Rotation/availability/usage effects are exploratory: compare production under
 // the edited rotation against the same roster at its fitted baseline.
 const production=(s:Scenario)=>data?projectPlayers(data,s).reduce((n,p)=>n+(p.projection?p.projection.pts*p.projection.gp/82:0),0):0;
 const before=production(baseline),after=production(scenario);
 const scoringChange=before?clamp(after/before-1,-.2,.2):0;
 const marginChange=team.pf*(scoringChange+scenario.fit/100);
 const growth=trained.team.model.coefficients[2]*marginChange/10;
 const mean=clamp(baseMean+growth,3,79);
 const teams=leagueSnapshot.teams as Team[],ids=teams.map(t=>t.id),index=new Map(ids.map((id,i)=>[id,i]));
 const games=schedule.games.map(g=>({home:index.get(g.home)!,away:index.get(g.away)!}));
 const counts=Array(30).fill(0);for(const g of games){counts[g.home]++;counts[g.away]++;}
 // Complete only unannounced games with balanced within-conference placeholders.
 // Every simulated game has exactly one winner and one loser.
 const pending=counts.map(c=>Math.max(0,82-c));
 const placeholders:{home:number;away:number}[]=[];
 while(pending.some(n=>n>0)){
  const a=pending.indexOf(Math.max(...pending));let candidates=ids.map((_,i)=>i).filter(i=>i!==a&&pending[i]>0);
  const same=candidates.filter(i=>teams[i].conference===teams[a].conference);if(same.length)candidates=same;
  candidates.sort((x,y)=>pending[y]-pending[x]||x-y);const b=candidates[0];if(b==null)throw Error('Unbalanced schedule');
  placeholders.push({home:a,away:b});pending[a]--;pending[b]--;
 }
 const allGames=[...games,...placeholders],selected=index.get(team.id)!;
 const expected=teams.map(t=>t.id===team.id?mean:baselineWins(t));
 const logit=(w:number)=>Math.log(w/(82-w));
 const strengths=expected.map(logit);
 // Season-level uncertainty plus Bernoulli game outcomes; historical error scale.
 const sd=trained.team.report.rmse;
 let seed=202627;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return (seed+.5)/4294967296};
 const normal=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
 const histogram=Array(83).fill(0),leagueTotals=Array(30).fill(0),runs=2000;
 for(let r=0;r<runs;r++){
  const latent=strengths.map((s,i)=>s+normal()*Math.sqrt(Math.max(1,sd*sd-16))/20*(i===selected&&d?1+(1-d.continuity/100)*.25:1));
  const wins=Array(30).fill(0);
  for(const g of allGames){const probability=1/(1+Math.exp(-(latent[g.home]-latent[g.away])));wins[random()<probability?g.home:g.away]++;}
  histogram[wins[selected]]++;for(let i=0;i<30;i++)leagueTotals[i]+=wins[i];
 }
 const dist=histogram.map((count,wins)=>({wins,p:count/runs}));
 const average=dist.reduce((sum,x)=>sum+x.wins*x.p,0);
 const quantile=(q:number)=>{let sum=0;return dist.find(x=>(sum+=x.p)>=q)?.wins??82;};
 const good=dist.filter(x=>x.wins>=goodTarget).reduce((s,x)=>s+x.p,0)*100,bad=dist.filter(x=>x.wins<=35).reduce((s,x)=>s+x.p,0)*100;
 return {expected:average,mean,baseMean,pyth:baseMean,record:team.wins,sd,low:quantile(.1),high:quantile(.9),good,bad,middle:Math.max(0,100-good-bad),dist,dynamics:d,health:0,growth,fit:scenario.fit,runs,scheduledGames:counts[selected],placeholderGames:82-counts[selected],leagueWins:leagueTotals.map((w,i)=>({id:ids[i],wins:w/runs})),marginChange};
}
