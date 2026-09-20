import snapshot from '@/data/league.json';
import {loadLeague} from '@/lib/nba-provider.mjs';
let cached:unknown=null;let timestamp=0;let pending:Promise<unknown>|null=null;
export async function GET(request:Request){
 if(new URL(request.url).searchParams.get('refresh')!=='1')return Response.json(snapshot);
 if(cached&&Date.now()-timestamp<900_000)return Response.json(cached);
 try{
  pending??=loadLeague();cached=await pending;timestamp=Date.now();
  return Response.json(cached,{headers:{'Cache-Control':'private, max-age=300'}});
 }catch(e){console.warn('Standings refresh failed',String(e));return Response.json({...snapshot,mode:'snapshot',warning:'Live standings unavailable. Showing the dated saved snapshot.'});}
 finally{pending=null;}
}
