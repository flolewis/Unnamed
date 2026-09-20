import snapshots from '@/data/teams.json';
import {loadTeam} from '@/lib/nba-provider.mjs';
import type {TeamData} from '@/lib/model';
const data=snapshots as unknown as Record<string,TeamData>;
const cache=new Map<string,{time:number;data:unknown}>();
const pending=new Map<string,Promise<unknown>>();
export async function GET(request:Request){
 const u=new URL(request.url),id=u.searchParams.get('id')??'';
 if(!Object.hasOwn(data,id))return Response.json({error:'Team not found'},{status:404});
 if(u.searchParams.get('refresh')!=='1')return Response.json(data[id]);
 const existing=cache.get(id);
 if(existing&&Date.now()-existing.time<3_600_000)return Response.json(existing.data);
 try{
  if(!pending.has(id))pending.set(id,loadTeam(id));
  const result=await pending.get(id);cache.set(id,{time:Date.now(),data:result});
  return Response.json(result,{headers:{'Cache-Control':'private, max-age=300'}});
 }catch(e){console.warn('Roster refresh failed',String(e));return Response.json({...data[id],mode:'snapshot',warnings:[...data[id].warnings,'Live roster or statistics unavailable. Showing the dated saved snapshot.']});}
 finally{pending.delete(id);}
}
