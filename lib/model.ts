export type Stats={year:number;season:string;gp:number;min:number;pts:number;reb:number;ast:number;stl:number;blk:number;tov:number;three:number|null;threeA:number|null;fg:number|null;ft:number|null;fgm:number|null;fga:number|null;ftm:number|null;fta:number|null;teamIds:string[];teamMinutes:Record<string,number>};
export type Player={id:string;name:string;position:string;age:number|null;jersey:string|null;history:Stats[];status:string|null;statusDate:string|null;url:string|null;source:string;error:string|null};
export type Team={id:string;name:string;shortName:string;abbreviation:string;conference:string;wins:number;losses:number;pf:number;pa:number;margin:number;logo:string|null;url:string};
export type TeamData={id:string;players:Player[];rosterSeason:string;rosterTimestamp:string|null;fetchedAt:string;source:string;mode:string;warnings:string[]};
export type LeagueData={teams:Team[];baselineSeason:string;targetSeason:string;fetchedAt:string;source:string;mode:string;warning?:string};
export type Scenario={availability:number;development:number;fit:number};
export const baseline:Scenario={availability:0,development:0,fit:0};
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const fantasy=(s:{pts:number;reb:number;ast:number;stl:number;blk:number;tov:number})=>s.pts+1.2*s.reb+1.5*s.ast+3*(s.stl+s.blk)-s.tov;
export const lastStats=(p:Player)=>p.history.find(h=>h.year===2026);
export function projectPlayers(data:TeamData,scenario:Scenario){
 const eligible=data.players.filter(p=>lastStats(p));
 // Per-game roles are conditional on playing. Budget season minutes using GP/82,
 // rather than incorrectly assuming every roster player appears in every game.
 const games=(p:Player)=>Math.round(clamp(.6*Math.min(82,lastStats(p)!.gp)+.4*70+scenario.availability,0,82));
 const minutesSum=eligible.reduce((s,p)=>s+lastStats(p)!.min*games(p)/82,0);
 const scale=Math.min(1,240/(minutesSum||240));
 return data.players.map(p=>{
  const last=lastStats(p);if(!last)return {...p,last:null,projection:null};
  const prior=p.history.find(h=>h.year===2025);
  const min=clamp(last.min*scale,0,38);
  const ageFactor=p.age==null?1:p.age<25?1.02:p.age>30?.98:1;
  const factor=ageFactor*(1+scenario.development/100);
  const blend=(key:'pts'|'reb'|'ast'|'stl'|'blk'|'tov')=>(prior?(last[key]/last.min*.7+prior[key]/prior.min*.3):last[key]/last.min)*min*(key==='tov'?1:factor);
  const gp=games(p);
  const three=last.three==null?null:(prior?.three!=null?last.three/last.min*.7+prior.three/prior.min*.3:last.three/last.min)*min*factor;
  const projected={gp,min,pts:blend('pts'),reb:blend('reb'),ast:blend('ast'),stl:blend('stl'),blk:blend('blk'),tov:blend('tov'),three,fg:last.fg,ft:last.ft};
  const fp=fantasy(projected),baseFp=fantasy(last);
  return {...p,last,projection:{...projected,fp,total:fp*gp,change:baseFp?((fp-baseFp)/baseFp)*100:0,ageFactor,minuteScale:scale}};
 }).sort((a,b)=>(b.projection?.fp??-1)-(a.projection?.fp??-1));
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
 const pyth=82/(1+Math.pow(team.pa/team.pf,13.91));
 const record=team.wins/(team.wins+team.losses)*82;
 const blended=.55*record+.45*pyth;
 const baseMean=.8*blended+.2*41;
 const d=data?teamDynamics(team,data):null;
 const health=scenario.availability*.25;
 const growth=scenario.development*.5;
 const mean=clamp(baseMean+health+growth+scenario.fit,0,82);
 const sd=8+(d?(1-d.continuity/100)*4:4);
 const weights=Array.from({length:83},(_,wins)=>Math.exp(-.5*Math.pow((wins-mean)/sd,2)));
 const total=weights.reduce((a,b)=>a+b,0);
 const dist=weights.map((w,wins)=>({wins,p:w/total}));
 const expected=dist.reduce((s,x)=>s+x.wins*x.p,0);
 const quantile=(q:number)=>{let sum=0;return dist.find(x=>(sum+=x.p)>=q)?.wins??82;};
 const good=dist.filter(x=>x.wins>=goodTarget).reduce((s,x)=>s+x.p,0)*100;
 const bad=dist.filter(x=>x.wins<=35).reduce((s,x)=>s+x.p,0)*100;
 return {expected,mean,baseMean,pyth,record,sd,low:quantile(.1),high:quantile(.9),good,bad,middle:100-good-bad,dist,dynamics:d,health,growth,fit:scenario.fit};
}
