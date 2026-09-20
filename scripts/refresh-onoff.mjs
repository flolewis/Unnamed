import fs from 'node:fs/promises';
const path='data/context.json',c=JSON.parse(await fs.readFile(path,'utf8')),snapshots=JSON.parse(await fs.readFile('data/teams.json','utf8'));
const normalize=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
let success=0;
for(const t of c.teams)for(const o of t.onoff??[]){
 if(o.rows.length||!o.source)continue;
 for(let attempt=0;attempt<3;attempt++){
  await new Promise(r=>setTimeout(r,1500+attempt*5000));
  try{const response=await fetch(o.source,{signal:AbortSignal.timeout(15000)});if(!response.ok)continue;const j=await response.json();o.rows=(j.results?.Usage??[]).map(r=>{const matches=snapshots[t.id].players.filter(p=>normalize(p.name)===normalize(r.Name));return {id:matches.length===1?matches[0].id:null,name:r.Name,on:Number(r.On),off:Number(r.Off),minutesOn:r.MinutesOn,minutesOff:r.MinutesOff}}).filter(r=>r.id);delete o.error;success++;break;}catch{}
 }
 await fs.writeFile(path,JSON.stringify(c));
}
console.log({recovered:success,available:c.teams.flatMap(t=>t.onoff??[]).filter(o=>o.rows.length).length});
