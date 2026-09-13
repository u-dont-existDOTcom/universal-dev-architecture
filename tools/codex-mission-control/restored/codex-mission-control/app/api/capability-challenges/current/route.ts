import { authenticateIngestProducer } from "@/lib/ingestion-credentials";
import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";

export const dynamic="force-dynamic";
export async function GET(request: Request) {
  const auth=authenticateIngestProducer(process.env.MISSION_CONTROL_INGEST_CREDENTIALS,request.headers.get("x-mission-control-producer-id"),request.headers.get("authorization"));
  if(!auth.ok) return Response.json({error:"Unauthorized"},{status:401,headers:{"cache-control":"no-store"}});
  if(auth.producer.kind!=="COLLECTOR") return Response.json({error:"Relay collector required"},{status:403});
  const query=new URL(request.url).searchParams;
  const supervisor=query.get("supervisor_id"),chat=query.get("chat_id");
  if(!supervisor||!chat||supervisor.length>180||chat.length>180||query.getAll("supervisor_id").length!==1||query.getAll("chat_id").length!==1||[...query.keys()].some(k=>!["supervisor_id","chat_id"].includes(k))) return Response.json({error:"Exact supervisor and chat required"},{status:400});
  const response=await relayJson(`/capability-challenges/current?${new URLSearchParams({supervisor_id:supervisor,chat_id:chat})}`,{headers:daemonMutationHeaders(auth.producer)});
  const headers={"cache-control":"no-store, max-age=0","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
  if(!response.ok) return Response.json({error:"Current capability challenge unavailable"},{status:response.status,headers});
  try {
    const value=await response.json();
    const keys=["schema_version","status","supervisor_id","chat_id","challenge_id","expires_at"];
    if(!value||typeof value!=="object"||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k))
      ||value.schema_version!==1||value.status!=="CURRENT"||value.supervisor_id!==supervisor||value.chat_id!==chat
      ||typeof value.challenge_id!=="string"||value.challenge_id.length<1||value.challenge_id.length>180
      ||typeof value.expires_at!=="string"||!(Date.parse(value.expires_at)>Date.now())) throw new Error("invalid");
    return Response.json(Object.fromEntries(keys.map(k=>[k,value[k]])),{headers});
  }catch{return Response.json({error:"Current capability challenge unavailable"},{status:503,headers});}
}
