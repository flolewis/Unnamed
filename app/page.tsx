"use client";
import {useState,useEffect,useMemo,useRef,useCallback} from 'react';
import {flushSync} from 'react-dom';
import {ArrowUpRight,RefreshCw,Search,SlidersHorizontal,ChevronRight,ArrowDown,ArrowUp,Info,ExternalLink,Activity,Users,ChartNoAxesCombined,Database} from 'lucide-react';
import {RotationLab,BacktestReport} from './analysis-panels';
import leagueSnapshot from '@/data/league.json';
import initialTeam from '@/data/team-25.json';
import {loadTeam as loadPublicTeam,loadLeague as loadPublicLeague} from '@/lib/nba-provider.mjs';
import {baseline,teamOutlook,projectPlayers,teamDynamics,lastStats,fantasy,type LeagueData,type TeamData,type Scenario,type Team,type Player} from '@/lib/model';

const f=(n:number|null|undefined,d=1)=>n==null?'—':n.toFixed(d);
const signed=(n:number,d=1)=>`${n>0?'+':''}${n.toFixed(d)}`;
const date=(s:string)=>new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const stamp=(s:string)=>new Date(s).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC';
type View='outlook'|'players'|'rotation'|'model';
type Projection=ReturnType<typeof projectPlayers>[number];

export default function Home(){
 const [league,setLeague]=useState<LeagueData>(leagueSnapshot as LeagueData);
 const [teamId,setTeamId]=useState('25');
 const [cache,setCache]=useState<Record<string,TeamData>>({'25':initialTeam as unknown as TeamData});
 const [view,setView]=useState<View>('outlook');
 const [search,setSearch]=useState('');const [conference,setConference]=useState('All');
 const [scenario,setScenario]=useState<Scenario>({...baseline});const [target,setTarget]=useState(45);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [selectedPlayer,setSelectedPlayer]=useState<string|null>(null);
 const [sort,setSort]=useState('fp');const [direction,setDirection]=useState(-1);
 const [playerSearch,setPlayerSearch]=useState('');const [statView,setStatView]=useState('projection');
 const activeId=useRef(teamId);activeId.current=teamId;
 const refreshes=useRef(new Set<string>());
 const team=league.teams.find(t=>t.id===teamId)!;
 const data=cache[teamId];
 const forecast=useMemo(()=>teamOutlook(team,data,scenario,target),[team,data,scenario,target]);
 const players=useMemo(()=>data?projectPlayers(data,scenario):[],[data,scenario]);
 const visibleTeams=league.teams.filter(t=>(conference==='All'||t.conference===conference)&&t.name.toLowerCase().includes(search.toLowerCase()));

 const load=useCallback(async(id:string,refresh=false)=>{
  if(refresh){try{const live=await loadPublicTeam(id) as unknown as TeamData;setCache(c=>({...c,[id]:live}));return live;}catch{/* Use the server cache or its dated snapshot when browser access fails. */}}
  const r=await fetch(`/api/team?id=${id}${refresh?'&refresh=1':''}`);
  if(!r.ok)throw new Error('The team data could not be loaded. Please try again.');
  const result=await r.json() as TeamData;
  setCache(c=>({...c,[id]:result}));return result;
 },[]);
 useEffect(()=>{let current=true;setError('');setSelectedPlayer(null);
  async function run(){
   setBusy(true);
   try{await load(teamId);if(!refreshes.current.has(teamId)){refreshes.current.add(teamId);await load(teamId,true);}}
   catch(e){if(current)setError(e instanceof Error?e.message:'Data unavailable');}
   finally{if(current)setBusy(false);}
  }void run();return()=>{current=false};
 },[teamId,load]);
 const loadLeagueData=useCallback(async()=>{try{return await loadPublicLeague() as LeagueData;}catch{const r=await fetch('/api/league?refresh=1');if(!r.ok)throw new Error('Standings unavailable');return r.json() as Promise<LeagueData>;}},[]);
 useEffect(()=>{void loadLeagueData().then(setLeague).catch(()=>{});},[loadLeagueData]);
 async function refresh(){const id=teamId;setBusy(true);setError('');try{const [l]=await Promise.all([loadLeagueData(),load(id,true)]);setLeague(l);}catch{setError('Refresh unavailable. The last successful data remains visible.');}finally{if(activeId.current===id)setBusy(false);}}
 function chooseTeam(id:string){setTeamId(id);setScenario({...baseline});setPlayerSearch('');}
 const toolAction=useRef<(input:unknown)=>Promise<unknown>>(async()=>({}));
 toolAction.current=async(input:unknown)=>{
  const p=input as {teamId?:string;availability?:number;development?:number;fit?:number;goodTarget?:number};
  if(!p||typeof p!=='object'||!league.teams.some(t=>t.id===p.teamId))throw new Error('Use a valid ESPN NBA teamId from the team explorer.');
  for(const [key,low,high] of [['availability',-15,15],['development',-5,5],['fit',-6,6]] as const){if(p[key]!=null&&(!Number.isFinite(p[key])||p[key]!<low||p[key]!>high))throw new Error(`${key} is outside its allowed range.`);}
  if(p.goodTarget!=null&&![45,50,55].includes(p.goodTarget))throw new Error('goodTarget must be 45, 50, or 55.');
  const id=p.teamId!,d=cache[id]??await load(id),s={availability:p.availability??0,development:p.development??0,fit:p.fit??0},goal=p.goodTarget??45;
  flushSync(()=>{setTeamId(id);setScenario(s);setTarget(goal);setView('outlook');});
  const o=teamOutlook(league.teams.find(t=>t.id===id)!,d,s,goal);
  return {team:league.teams.find(t=>t.id===id)!.name,expectedWins:Number(o.expected.toFixed(1)),goodSeasonPercent:Number(o.good.toFixed(1)),badSeasonPercent:Number(o.bad.toFixed(1)),goodSeasonAtLeastWins:goal,badSeasonAtMostWins:35,model:'Uncalibrated scenario model',sourceDate:d.fetchedAt};
 };
 useEffect(()=>{
  type Registry={registerTool:(tool:Record<string,unknown>,options:{signal:AbortSignal})=>void|Promise<void>};
  const context=(document as Document&{modelContext?:Registry}).modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  try{void Promise.resolve(context.registerTool({name:'configure_nba_outlook',title:'Configure NBA season outlook',description:'Select a team and scenario in the visible dashboard. Returns illustrative 2026–27 team outcomes, not calibrated betting probabilities.',inputSchema:{type:'object',properties:{teamId:{type:'string'},availability:{type:'number',minimum:-15,maximum:15},development:{type:'number',minimum:-5,maximum:5},fit:{type:'number',minimum:-6,maximum:6},goodTarget:{type:'number',enum:[45,50,55]}},required:['teamId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:(input:unknown)=>toolAction.current(input)},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
 },[]);
 const sorted=players.filter(p=>p.name.toLowerCase().includes(playerSearch.toLowerCase())).sort((a,b)=>{
  const value=(p:Projection)=>{if(sort==='name')return p.name;const row=statView==='projection'?p.projection:p.last;if(sort==='fp')return row?('fp'in row?row.fp:fantasy(row)):-Infinity;return row?(row as unknown as Record<string,number>)[sort]??-Infinity:-Infinity;};
  const av=value(a),bv=value(b);if(av===-Infinity)return 1;if(bv===-Infinity)return -1;return (typeof av==='string'&&typeof bv==='string'?av.localeCompare(bv):Number(av)-Number(bv))*direction;
 });
 const pick=players.find(p=>p.id===selectedPlayer);
 const d=forecast.dynamics;
 const changed=scenario.availability!==0||scenario.development!==0||scenario.fit!==0||Boolean(scenario.pace)||Boolean(Object.keys(scenario.rotation??{}).length);

 return <main className="shell">
  <header className="topbar"><a href="/" className="brand"><span className="brandmark">C/</span> COURTSIDE<span className="brand-sub">SEASON LAB</span></a><div className="topright"><span className="season">2026—27 OUTLOOK</span><span className="beta">SAMPLE MODEL</span></div></header>
  <section className="heading"><div><p className="eyebrow">NBA INTELLIGENCE / PRESEASON</p><h1>See the season ahead.</h1><p className="subtext">The numbers. The roster. The range of possibilities.</p></div><button className="button refresh" onClick={refresh} disabled={busy}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Checking sources…':'Refresh data'}</button></section>
  <div className="workspace">
   <aside className="sidebar"><div className="side-title"><p className="eyebrow">TEAM EXPLORER</p><span>30</span></div><label className="searchbox"><Search size={16}/><input aria-label="Search teams" placeholder="Find a team" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="conference" role="group" aria-label="Conference">{['All','East','West'].map(c=><button className={conference===c?'active':''} key={c} onClick={()=>setConference(c)}>{c}</button>)}</div><div className="list-label"><span>TEAM</span><span>25–26 W–L</span></div><div className="team-list">{visibleTeams.map(t=><button key={t.id} className={`team-row ${t.id===teamId?'active':''}`} aria-pressed={t.id===teamId} onClick={()=>chooseTeam(t.id)}><b>{t.abbreviation}</b><span>{t.shortName}</span><span className="record">{t.wins}–{t.losses}</span></button>)}{!visibleTeams.length&&<p className="aside-note">No matching teams.</p>}</div><div className="side-footer"><Database size={15}/><div>Free NBA data<br/><small>ESPN public feeds · no API key</small></div></div></aside>
   <div className="mainarea">
    <div className="team-heading"><div className="team-badge">{team.abbreviation}</div><div><p className="eyebrow">{team.conference.toUpperCase()}ERN CONFERENCE <span className="divider">/</span> TEAM OUTLOOK</p><h2>{team.name}</h2><p className="team-meta">{team.wins}–{team.losses} last season <span>·</span> {f(team.pf)} PPG <span>·</span> {signed(team.margin)} scoring margin</p></div><a className="source-link" href={team.url} target="_blank" rel="noreferrer" aria-label={`View ${team.name} on ESPN`}><ArrowUpRight size={21}/></a></div>
    <nav className="tabs" aria-label="Analysis view">{([{id:'outlook',label:'Team outlook',Icon:Activity},{id:'players',label:'Player projections',Icon:Users},{id:'rotation',label:'Rotation lab',Icon:SlidersHorizontal},{id:'model',label:'Backtest & sources',Icon:Database}] as const).map(({id,label,Icon})=><button key={id} aria-current={view===id?'page':undefined} className={view===id?'active':''} onClick={()=>setView(id)}><Icon size={16}/>{label}</button>)}</nav>
    <div className="data-status" aria-live="polite"><span>{data?`${data.mode==='live'?'Source refreshed':'Saved snapshot'} · ${stamp(data.fetchedAt)}`:'Loading team data…'}</span><span>Forecasts: fitted model v2 · experimental probabilities</span></div>
    {error&&<div className="notice" role="alert">{error}<button onClick={refresh}>Retry</button></div>}
    {data?.warnings.map(w=><div className="notice" key={w}>{w}</div>)}
    {league.warning&&<div className="notice">{league.warning}</div>}
    {view==='outlook'&&<>
     <div className="metrics"><div className="featured"><span>PROJECTED WINS</span><strong>{f(forecast.expected,0)}<span> / 82</span></strong><small>{forecast.low}–{forecast.high} wins · middle 80% of model</small></div><div><span>GOOD SEASON · {target}+ WINS</span><strong className="positive">{forecast.good<1?"<1":forecast.good>99?">99":f(forecast.good,0)}<span>%</span></strong><small>Illustrative chance under this scenario</small></div><div><span>BAD SEASON · ≤35 WINS</span><strong className="negative">{forecast.bad<1?"<1":forecast.bad>99?">99":f(forecast.bad,0)}<span>%</span></strong><small>{f(forecast.middle,0)}% between these thresholds</small></div></div>
     <div className="outlook-grid"><section className="panel distribution"><div className="panel-title"><div><p className="eyebrow">82 GAMES. MANY POSSIBILITIES.</p><h3>Where could they finish?</h3></div><span className="chip">{changed?'CUSTOM SCENARIO':'BASELINE'}</span></div><Distribution dist={forecast.dist} mean={forecast.expected} target={target}/><div className="chart-legend"><span><i className="key red"/>Bad season ≤35</span><span><i className="key blue"/>Middle</span><span><i className="key green"/>Good season ≥{target}</span></div><div className="forecast-note"><Info size={16}/><p>2,000 joint league simulations using 80 published games per team and 2 unannounced-game placeholders. Component backtests are available; final probabilities remain experimental.</p></div></section>
      <section className="panel scenario"><div className="panel-title"><h3><SlidersHorizontal size={17}/> Shape the scenario</h3><button className="text-button" onClick={()=>setScenario({...baseline})}>Reset</button></div><div className="presets">{[{name:'Downside',s:{availability:-10,development:-3,fit:-3}},{name:'Baseline',s:baseline},{name:'Upside',s:{availability:10,development:3,fit:3}}].map(p=><button key={p.name} className={JSON.stringify(p.s)===JSON.stringify(scenario)?'active':''} onClick={()=>setScenario({...p.s})}>{p.name}</button>)}</div><Slider label="Availability change" value={scenario.availability} min={-15} max={15} unit="games / player" onChange={v=>setScenario(s=>({...s,availability:v}))} help="Versus the model’s baseline games played"/><Slider label="Player development" value={scenario.development} min={-5} max={5} unit="% production" onChange={v=>setScenario(s=>({...s,development:v}))} help="Change to per-minute counting stats"/><Slider label="Roster scoring fit" value={scenario.fit} min={-6} max={6} unit="% scoring" onChange={v=>setScenario(s=>({...s,fit:v}))} help="Exploratory scoring change; mapped through the fitted margin model"/><label className="target-select">A good season means<select value={target} onChange={e=>setTarget(Number(e.target.value))}>{[45,50,55].map(n=><option value={n} key={n}>{n}+ wins</option>)}</select></label></section></div>
     {d&&data&&<><div className="section-heading"><div><p className="eyebrow">BEYOND THE BOX SCORE</p><h3>The team dynamics</h3></div><span className="muted">Current roster × 2025–26 production</span></div><div className="dynamics-grid"><Dynamic label="Returning minutes" value={`${f(d.continuity,0)}%`} percent={d.continuity} note="Share of last season’s team minutes represented by this roster. Overtime excluded from denominator."/><Dynamic label="Rotation age" value={d.age==null?'—':`${f(d.age)} yrs`} percent={d.age==null?0:(d.age-18)/22*100} note="Weighted by last season’s minutes per game. Describes the roster; no team age bonus applied."/><Dynamic label="Top-three scoring share" value={`${f(d.concentration,0)}%`} percent={d.concentration} note="Top three scorers’ share of this roster’s summed historical PPG. A concentration indicator."/><Dynamic label="Past availability" value={`${f(d.durability,0)} / 82`} percent={d.durability/82*100} note="Last season’s games played, weighted by minutes. This is not a medical forecast."/></div><div className="insight-grid"><section className="insight"><span className="insight-icon positive"><ArrowUp size={17}/></span><div><h4>What supports a good season</h4><p>{team.margin>0?`A ${signed(team.margin)} scoring margin supports a competitive baseline.`:`The model gives some weight to a rebound toward the league average after a ${team.wins}-win season.`} {d.continuity>=65?`${f(d.continuity,0)}% of prior team minutes return, reducing continuity uncertainty.`:'Improved availability and integration of new players could lift the outlook.'}</p></div></section><section className="insight"><span className="insight-icon negative"><ArrowDown size={17}/></span><div><h4>What could pull them back</h4><p>{d.continuity<65?`Only ${f(d.continuity,0)}% of prior team minutes are represented, leaving more uncertainty around the rotation.`:`The top three scorers account for ${f(d.concentration,0)}% of this roster’s historical scoring; availability matters.`} {d.unmodeled} roster players lack a 2025–26 NBA baseline and are excluded from player projections.</p></div></section></div><div className="panel roster-preview"><div className="panel-title"><div><p className="eyebrow">FANTASY WATCH</p><h3>Projected leaders</h3></div><button className="text-button" onClick={()=>setView('players')}>Explore all {data.players.length} players <ArrowUpRight size={15}/></button></div><div className="leaders">{players.filter(p=>p.projection).slice(0,3).map((p,i)=><button className="leader" key={p.id} onClick={()=>{setSelectedPlayer(p.id);setView('players')}}><span className="leader-rank">0{i+1}</span><div><b>{p.name}</b><small>{p.position} · {f(p.projection!.min)} min · {p.projection!.gp} games</small></div><strong>{f(p.projection!.fp)}<small>FP / GAME</small></strong><ChevronRight size={15}/></button>)}</div><p className="footnote">Sample scoring: PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TO. Not your league’s custom scoring.</p></div></>}
    </>}
    {view==='players'&&<section className="panel player-panel"><div className="panel-title"><div><p className="eyebrow">THE ROTATION / {data?.rosterSeason??'CURRENT ROSTER'}</p><h3>Player production</h3></div><span className="chip">{statView==='projection'?'2026–27 ESTIMATES':'2025–26 ACTUALS'}</span></div><p className="subtext">Per-game stats with a team minute budget weighted by projected appearances. Select a player to inspect their history and projection.</p><div className="player-controls"><div className="presets"><button className={statView==='projection'?'active':''} onClick={()=>setStatView('projection')}>Projections</button><button className={statView==='actual'?'active':''} onClick={()=>setStatView('actual')}>Last season</button></div><label className="searchbox"><Search size={16}/><input aria-label="Search players" placeholder="Find a player" value={playerSearch} onChange={e=>setPlayerSearch(e.target.value)}/></label></div>
     {changed&&<div className="notice subtle">Custom scenario: availability {signed(scenario.availability,0)} games; development {signed(scenario.development,0)}%. Rotation edits take priority over team-wide games assumptions.</div>}
     {!data?<p className="empty">Loading roster and player statistics…</p>:<><div className="table-scroll"><table><thead><tr>{[['name','PLAYER'],['gp','GP'],['min','MIN'],['pts','PTS'],['reb','REB'],['ast','AST'],['stl','STL'],['blk','BLK'],['three','3PM'],['tov','TO'],['fg','FG%'],['ft','FT%'],['fp','FP/G']].map(([key,label])=><th key={key} aria-sort={sort===key?(direction<0?'descending':'ascending'):'none'}><button onClick={()=>{setDirection(sort===key?-direction:-1);setSort(key)}}>{label}{sort===key&&(direction<0?' ↓':' ↑')}</button></th>)}</tr></thead><tbody>{sorted.map(p=>{const s=statView==='projection'?p.projection:p.last;return <tr key={p.id} className={selectedPlayer===p.id?'chosen':''}><td><button className="player-name" onClick={()=>setSelectedPlayer(selectedPlayer===p.id?null:p.id)}>{p.name}<small>{p.position} · {p.age??'—'} yrs{!p.last?' · No baseline':p.last.teamIds.includes(teamId)?'':' · New to team'}</small></button></td><td>{s?.gp??'—'}</td><td>{f(s?.min)}</td><td>{f(s?.pts)}</td><td>{f(s?.reb)}</td><td>{f(s?.ast)}</td><td>{f(s?.stl)}</td><td>{f(s?.blk)}</td><td>{f(s?.three)}</td><td>{f(s?.tov)}</td><td>{f(s?.fg)}</td><td>{f(s?.ft)}</td><td className="fp">{s?f('fp'in s?s.fp:fantasy(s)):'—'}</td></tr>})}</tbody></table></div>{!sorted.length&&<p className="empty">No matching players.</p>}<p className="footnote">GP = projected games; MIN = minutes per game; FP/G = sample fantasy points per game. Missing baseline ≠ zero production. Percentages carry forward from last season.</p></>}
     {pick&&<PlayerDetail player={pick}/>}
    </section>}
    {view==='rotation'&&data&&<RotationLab key={teamId} data={data} scenario={scenario} onChange={setScenario}/>}
    {view==='model'&&<BacktestReport/>}
    <footer className="page-footer"><span>COURTSIDE / SEASON LAB</span><button onClick={()=>setView('model')}>Real stats. Explicit assumptions. <ArrowUpRight size={14}/></button></footer>
   </div>
  </div>
 </main>;
}

function Slider({label,value,min,max,unit,help,onChange}:{label:string;value:number;min:number;max:number;unit:string;help:string;onChange:(n:number)=>void}){return <label className="slider"><span><b>{label}</b><output>{signed(value,0)} <small>{unit}</small></output></span><input type="range" min={min} max={max} step="1" value={value} onChange={e=>onChange(Number(e.target.value))}/><small>{help}</small></label>}
function Dynamic({label,value,percent,note}:{label:string;value:string;percent:number;note:string}){return <section className="dynamic"><p>{label}</p><strong>{value}</strong><div className="meter"><span style={{width:`${Math.max(0,Math.min(100,percent))}%`}}/></div><small>{note}</small></section>}
function Distribution({dist,mean,target}:{dist:{wins:number;p:number}[];mean:number;target:number}){
 const max=Math.max(...dist.map(x=>x.p)),width=660,left=25,right=645,plot=right-left,scale=plot/83;
 return <div className="probability-chart"><svg viewBox={`0 0 ${width} 215`} role="img" aria-label={`Illustrative win distribution centered at ${mean.toFixed(1)} wins. Green bars indicate ${target} or more wins.`}><line x1={left} x2={right} y1="174" y2="174" stroke="#344050"/>{[.25,.5,.75,1].map(v=><line key={v} x1={left} x2={right} y1={174-v*135} y2={174-v*135} stroke="#25303d" strokeDasharray="3 6"/>)}{dist.map(x=><rect key={x.wins} x={left+x.wins*scale} y={174-x.p/max*130} width={scale-2} height={x.p/max*130} rx="1.2" fill={x.wins<=35?'#e28b80':x.wins>=target?'#c5f36a':'#6f99c1'} opacity={x.p/max>.015?1:.3}><title>{`${x.wins} wins: ${(x.p*100).toFixed(2)}%`}</title></rect>)}<line x1={left+mean*scale} x2={left+mean*scale} y1="22" y2="180" stroke="#eff4eb" strokeDasharray="3 4"/><text x={Math.max(70,Math.min(590,left+mean*scale))} y="15" textAnchor="middle" fill="#eaf0e3" fontSize="12">{mean.toFixed(1)} EXPECTED</text>{[0,10,20,30,40,50,60,70,80].map(n=><text key={n} x={left+n*scale} y="199" textAnchor="middle" fill="#91a0b2" fontSize="12">{n}</text>)}</svg><span className="axis-label">REGULAR-SEASON WINS</span></div>;
}
function PlayerDetail({player:p}:{player:Projection}){return <div className="player-detail"><div className="panel-title"><div><p className="eyebrow">PLAYER PROFILE</p><h3>{p.name}</h3></div>{p.url&&<a href={p.url} target="_blank" rel="noreferrer">Source stats <ExternalLink size={14}/></a>}</div>{p.projection&&p.last?<><div className="player-callouts"><div><small>PROJECTED FP / GAME</small><strong>{f(p.projection.fp)}</strong></div><div><small>VS LAST SEASON</small><strong className={p.projection.change>=0?'positive':'negative'}>{signed(p.projection.change)}%</strong></div><div><small>PROJECTED SEASON FP</small><strong>{Math.round(p.projection.total).toLocaleString()}</strong></div></div><p className="method-text">The model assigns {f(p.projection.min)} minutes per game and {p.projection.gp} games. {p.history.some(h=>h.year===2025)?'Production uses learned two-season weights and age effects.':'Only one recent baseline is available; rates shrink toward the training-cohort average.'} {p.last.gp<20?'Fewer than 20 baseline games: treat this projection as especially uncertain.':''} Availability range: {p.projection.gpLow}–{p.projection.gpHigh} games. FP/game sensitivity range: {f(p.projection.fpLow)}–{f(p.projection.fpHigh)}. These are uncalibrated ranges, not injury predictions.</p><div className="history-grid">{p.history.map(h=><div key={h.year}><b>{h.season}</b><strong>{f(fantasy(h))}<small> FP/G</small></strong><span>{h.gp} GP · {f(h.min)} MIN</span><span>{f(h.pts)} PTS · {f(h.reb)} REB · {f(h.ast)} AST</span></div>)}</div></>:<p className="method-text">No 2025–26 NBA baseline was returned. This player is visible on the roster but excluded from numerical projections.</p>}{p.status&&<p className="notice">Provider status: {p.status}{p.statusDate?` · reported ${date(p.statusDate)}`:''}. This label may be stale and is not a forecast of availability.</p>}{p.error&&<p className="notice">{p.error}</p>}</div>}
