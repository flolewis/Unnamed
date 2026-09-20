import fs from 'node:fs/promises';
import {keys,fit,predict,roleFeatures,gamesFeatures,rateFeatures,teamFeatures,metrics,bound} from '../lib/learning.mjs';
const players=JSON.parse(await fs.readFile('data/research/players.json','utf8'));
const seasons=JSON.parse(await fs.readFile('data/research/seasons.json','utf8'));
const teamRows=[];
for(const s of seasons.filter(s=>s.year>=2016))for(const actual of s.teams){const last=seasons.find(y=>y.year===s.year-1)?.teams.find(t=>t.id===actual.id),prior=seasons.find(y=>y.year===s.year-2)?.teams.find(t=>t.id===actual.id);if(last)teamRows.push({year:s.year,x:teamFeatures(last,prior),y:82*actual.wins/(actual.wins+actual.losses),base:82*last.wins/(last.wins+last.losses)});}
const playerRows=[];
const normalize=h=>{if(!h)return h;const counts=seasons.find(s=>s.year===h.year)?.teams.filter(t=>h.teamIds.includes(t.id)).map(t=>t.wins+t.losses)??[];const length=counts.length?Math.max(...counts):82;return {...h,gp:bound(h.gp*82/length,0,82)}};
for(const p of players)for(let year=2017;year<=2026;year++){
 const last=normalize(p.history.find(h=>h.year===year-1)),prior=normalize(p.history.find(h=>h.year===year-2)),actual=normalize(p.history.find(h=>h.year===year));
 if(!last)continue;playerRows.push({year,last,prior,actual,age:(p.age??27)-(2027-year)});
}
const split=rows=>({train:rows.filter(r=>r.year<=2022),validation:rows.filter(r=>r.year===2023),test:rows.filter(r=>r.year>=2024)});
const select=(rows,features,target,base)=>{
 const mapped=rows.map(r=>({...r,x:features(r),y:target(r)}));const s=split(mapped);let best;
 for(const penalty of [0.1,1,10,50]){const model=fit(s.train,penalty),score=metrics(s.validation,r=>predict(model,r.x),base).mae;if(!best||score<best.score)best={model,penalty,score};}
 const report=metrics(s.test,r=>predict(best.model,r.x),base);
 const calibration=metrics(s.validation,r=>predict(best.model,r.x),base);
 report.coverage80=s.test.filter(r=>Math.abs(predict(best.model,r.x)-r.y)<=calibration.radius80).length/s.test.length;
 return {evaluationModel:best.model,model:fit(mapped,best.penalty),penalty:best.penalty,report,calibration,trainingRows:s.train.length,validationRows:s.validation.length};
};
const team=select(teamRows,r=>r.x,r=>r.y,r=>r.base);
const active=playerRows.filter(r=>r.actual);
const minutes=select(active,r=>roleFeatures(r.last,r.prior,r.age),r=>r.actual.min,r=>r.last.min);
const games=select(playerRows,r=>gamesFeatures(r.last,r.prior,r.age),r=>r.actual?.gp??0,r=>r.last.gp);
const rates={};
for(const key of keys){
 const rows=active.filter(r=>r.actual[key]!=null&&r.last[key]!=null);
 const training=rows.filter(r=>r.year<=2022);
 const mean=training.reduce((s,r)=>s+r.last[key]*r.last.gp,0)/training.reduce((s,r)=>s+r.last.min*r.last.gp,0);
 let best;
 for(const shrink of [0,250,750]){const result=select(rows,r=>rateFeatures(r.last,r.prior,r.age,key,mean,shrink),r=>r.actual[key]/r.actual.min,r=>r.last[key]/r.last.min);if(!best||result.calibration.mae<best.calibration.mae)best={...result,shrink,mean};}
 rates[key]=best;
}
const fantasy=h=>h.pts+1.2*h.reb+1.5*h.ast+3*(h.stl+h.blk)-h.tov;
const fantasyRows=active.filter(r=>r.year>=2024).map(r=>({...r,y:fantasy(r.actual)}));
const fantasyReport=metrics(fantasyRows,r=>{const min=bound(predict(minutes.evaluationModel,roleFeatures(r.last,r.prior,r.age)),0,48);const values=Object.fromEntries(keys.map(key=>{const m=rates[key];return [key,Math.max(0,predict(m.evaluationModel,rateFeatures(r.last,r.prior,r.age,key,m.mean,m.shrink)))*min]}));return fantasy(values)},r=>fantasy(r.last));
const artifact={version:2,trainedAt:new Date().toISOString(),train:'2016–2022 outcomes',validation:'2023 outcomes (parameter selection)',test:'2024–2026 outcomes (held out)',production:'Refitted through 2026 after the held-out evaluation',cohort:'Current 2026 roster cohort with historical statistics. Survivorship bias: retired players are absent. Player rates and minutes are evaluated conditional on playing; games include zero when no target-year NBA season is returned. Not a full historical preseason roster backtest.',fantasyReport,players:players.length,priorTeams:seasons.find(s=>s.year===2025).teams,team,minutes,games,rates};
await fs.writeFile('data/model-v2.json',JSON.stringify(artifact));
console.log(JSON.stringify({team:team.report,minutes:minutes.report,games:games.report,rates:Object.fromEntries(keys.map(k=>[k,rates[k].report]))},null,2));
