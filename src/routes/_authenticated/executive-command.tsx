/**
 * EXECUTIVE COMMAND — /executive-command
 * Portfolio-level leadership visibility across all missions.
 * "The fleet view." Not a dashboard — a command center.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { daysUntil, relativeTime } from "@/lib/time";
import { generateIrisExecutiveBrief } from "@/lib/iris/iris-brief.functions";

export const Route = createFileRoute("/_authenticated/executive-command")({
  head: () => ({ meta: [{ title: "Executive Command — Athena" }] }),
  component: ExecutiveCommand,
});

const GOLD = "#C49A2A"; const BG2 = "#1a2235"; const BORDER = "rgba(255,255,255,0.08)";
const HEALTH_COLOR: Record<string, string> = { Green:"#22c55e", Yellow:"#f59e0b", Orange:"#f97316", Red:"#ef4444" };

function healthColor(h: string) { return HEALTH_COLOR[h] ?? HEALTH_COLOR.Green; }

function ExecutiveCommand() {
  const { memberships, loading, switchEngagement } = useEngagement();
  const { user } = useSession();
  const [statsById, setStatsById] = useState<Record<string, any>>({});
  const [irisBrief, setIrisBrief] = useState<string | null>(null);
  const [irisLoading, setIrisLoading] = useState(false);
  const navigate = (() => { /* placeholder */ }) as any;

  const active = useMemo(() => memberships.filter(m => m.engagement.status !== "Archived"), [memberships]);

  useEffect(() => {
    if (!active.length) return;
    const ids = active.map(m => m.engagement.id);
    (async () => {
      const [sos, risks, signals, decisions, issues] = await Promise.all([
        supabase.from("sos_alerts").select("engagement_id,severity,description,created_at").in("engagement_id",ids).neq("status","Resolved").order("created_at",{ascending:false}),
        supabase.from("risks").select("engagement_id,title,severity").in("engagement_id",ids).in("status",["Open","Monitoring"]),
        supabase.from("huddles").select("engagement_id,health,leadership_needed,created_at").in("engagement_id",ids).order("created_at",{ascending:false}).limit(ids.length*3),
        supabase.from("decisions").select("engagement_id").in("engagement_id",ids).eq("status","Pending Confirmation"),
        supabase.from("issues").select("engagement_id,issue_type,severity,status").in("engagement_id",ids).neq("status","Resolved").neq("status","Closed"),
      ]);
      const map: Record<string,any> = {};
      for (const id of ids) map[id] = { openSos:0, openRisks:0, highRisks:0, pendingDecisions:0, leadershipSignals:0, lastSignal:null, health:"Green", proposalIssues:0, opsIssues:0 };
      for (const r of (sos.data??[]) as any[]) { const b=map[r.engagement_id]; if(b) b.openSos++; }
      for (const r of (risks.data??[]) as any[]) { const b=map[r.engagement_id]; if(b) { b.openRisks++; if(r.severity==="High"||r.severity==="Critical") b.highRisks++; } }
      for (const r of (decisions.data??[]) as any[]) { const b=map[r.engagement_id]; if(b) b.pendingDecisions++; }
      for (const r of (issues.data??[]) as any[]) { const b=map[r.engagement_id]; if(b) { if(r.issue_type==="proposal") b.proposalIssues++; else b.opsIssues++; } }
      const seen = new Set<string>();
      for (const s of (signals.data??[]) as any[]) {
        if(!seen.has(s.engagement_id)) { const b=map[s.engagement_id]; if(b) { b.lastSignal=s.created_at; b.health=s.health??"Green"; b.leadershipSignals+=s.leadership_needed?1:0; seen.add(s.engagement_id); } }
      }
      setStatsById(map);
    })();
  }, [active.length]);

  useEffect(() => {
    if (!active.length || !user?.id) return;
    const key = `iris_exec_${user.id}_${new Date().toDateString()}`;
    try { const c=JSON.parse(localStorage.getItem(key)??"null"); if(c) { setIrisBrief(c); return; } } catch {}
    setIrisLoading(true);
    const raw=user.email?.split("@")?.[0]?.split(".")?.[0]??"";
    const name=raw.charAt(0).toUpperCase()+raw.slice(1);
    generateIrisExecutiveBrief({data:{userName:name}})
      .then(r=>{ setIrisBrief(r.brief); localStorage.setItem(key,JSON.stringify(r.brief)); })
      .catch(()=>setIrisBrief(null))
      .finally(()=>setIrisLoading(false));
  }, [active.length, user?.id]);

  function enter(id: string) {
    const m = active.find(x => x.engagement.id === id);
    if (!m) return;
    // Use the existing switchEngagement + navigate pattern
    window.location.href = "/command";
  }

  const atRisk = active.filter(m => { const s=statsById[m.engagement.id]; const d=daysUntil((m.engagement as any).submission_date); return s&&(s.openSos>0||s.highRisks>0||(d!==null&&d<=14)); });
  const totalSOS = active.reduce((a,m)=>a+(statsById[m.engagement.id]?.openSos??0),0);
  const totalHighRisk = active.reduce((a,m)=>a+(statsById[m.engagement.id]?.highRisks??0),0);
  const totalLeadership = active.reduce((a,m)=>a+(statsById[m.engagement.id]?.leadershipSignals??0),0);
  const totalPending = active.reduce((a,m)=>a+(statsById[m.engagement.id]?.pendingDecisions??0),0);

  const Row = ({ label, value, color }: any) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`0.5px solid ${BORDER}`}}>
      <span style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color:color||"var(--foreground)"}}>{value}</span>
    </div>
  );

  return (
    <div style={{maxWidth:1100,margin:"0 auto",padding:"40px 32px",display:"flex",flexDirection:"column",gap:40}}>
      {/* Header */}
      <div>
        <div style={{fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",color:"rgba(255,255,255,0.3)",marginBottom:6}}>Portfolio Intelligence</div>
        <h1 style={{fontSize:30,fontWeight:700,letterSpacing:"-0.02em",margin:0}}>Executive Command</h1>
        <p style={{fontSize:14,color:"rgba(255,255,255,0.45)",marginTop:6}}>Fleet-wide visibility across {active.length} active mission{active.length!==1?"s":""}.</p>
      </div>

      {/* KPI strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        {[
          {label:"Active Missions",value:active.length,color:GOLD},
          {label:"Missions At Risk",value:atRisk.length,color:atRisk.length>0?"#f59e0b":"#22c55e"},
          {label:"Active SOS",value:totalSOS,color:totalSOS>0?"#ef4444":"#22c55e"},
          {label:"Leadership Signals",value:totalLeadership,color:totalLeadership>0?"#f59e0b":"rgba(255,255,255,0.4)"},
        ].map(({label,value,color})=>(
          <div key={label} style={{background:BG2,border:`0.5px solid ${BORDER}`,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:8}}>{label}</div>
            <div style={{fontSize:32,fontWeight:800,color,lineHeight:1}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Two columns: Mission Grid + IRIS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:24}}>

        {/* Mission Health Grid */}
        <div>
          <SectionLabel>Mission Health Grid</SectionLabel>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {active.map(m=>{
              const s=statsById[m.engagement.id];
              const d=daysUntil((m.engagement as any).submission_date);
              const h=s?.health??"Green"; const hc=healthColor(h);
              const urgent=s&&(s.openSos>0||s.highRisks>0||(d!==null&&d<=14));
              return (
                <div key={m.engagement.id} onClick={()=>enter(m.engagement.id)} style={{
                  display:"flex",alignItems:"center",gap:16,padding:"14px 18px",borderRadius:10,
                  background:urgent?`color-mix(in oklab,${hc} 5%,${BG2})`:BG2,
                  border:`0.5px solid ${urgent?`color-mix(in oklab,${hc} 30%,transparent)`:BORDER}`,
                  cursor:"pointer",transition:"all 0.15s",
                }}>
                  <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:`${hc}18`,border:`1.5px solid ${hc}60`,boxShadow:`0 0 10px ${hc}22`}}>
                    <span style={{fontSize:13,fontWeight:900,color:hc}}>{h[0]}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                      <span style={{fontSize:14,fontWeight:600}}>{m.engagement.name}</span>
                      {s?.openSos?<span style={{fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:3,background:"#ef4444",color:"#fff"}}>SOS</span>:null}
                      {s?.highRisks?<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:3,background:"rgba(245,158,11,0.15)",color:"#f59e0b"}}>{s.highRisks} high risk</span>:null}
                    </div>
                    <div style={{display:"flex",gap:14,fontSize:11,color:"rgba(255,255,255,0.4)"}}>
                      <span>{m.engagement.client}</span>
                      {d!==null&&<span style={{color:d<=7?"#ef4444":d<=14?"#f59e0b":undefined}}>{d}d left</span>}
                      {s?.openRisks?<span>{s.openRisks} open risk{s.openRisks>1?"s":""}</span>:null}
                      {s?.pendingDecisions?<span style={{color:"#f59e0b"}}>{s.pendingDecisions} pending decision{s.pendingDecisions>1?"s":""}</span>:null}
                    </div>
                  </div>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.2)"}}>→</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* IRIS Executive Brief */}
        <div>
          <SectionLabel>IRIS Executive Briefing</SectionLabel>
          <div style={{background:BG2,border:`0.5px solid rgba(196,154,42,0.2)`,borderRadius:14,padding:"22px",height:"calc(100% - 36px)",display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:GOLD,boxShadow:`0 0 10px ${GOLD}`}} />
              <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:GOLD}}>IRIS · Executive Intelligence</span>
            </div>
            {irisLoading&&!irisBrief?(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[90,75,85,55].map((w,i)=><div key={i} style={{height:11,borderRadius:5,background:"rgba(255,255,255,0.04)",width:`${w}%`}}/>)}
              </div>
            ):irisBrief?(
              <p style={{fontSize:13,lineHeight:1.8,color:"rgba(255,255,255,0.8)",margin:0,whiteSpace:"pre-line",flex:1,overflow:"auto"}}>{irisBrief}</p>
            ):(
              <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",lineHeight:1.7,margin:0}}>
                {atRisk.length>0?`${atRisk.length} mission${atRisk.length>1?"s":""} require leadership attention. ${totalSOS>0?`${totalSOS} active SOS.`:""}`:
                "Portfolio is healthy. All missions within normal parameters."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* At-Risk Detail */}
      {atRisk.length>0&&(
        <div>
          <SectionLabel>Missions Requiring Attention</SectionLabel>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
            {atRisk.map(m=>{
              const s=statsById[m.engagement.id]; const d=daysUntil((m.engagement as any).submission_date);
              const h=s?.health??"Green"; const hc=healthColor(h);
              return (
                <div key={m.engagement.id} onClick={()=>enter(m.engagement.id)} style={{background:BG2,border:`0.5px solid rgba(239,68,68,0.2)`,borderRadius:10,padding:"16px 18px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:hc,boxShadow:`0 0 8px ${hc}`}}/>
                    <span style={{fontSize:14,fontWeight:600}}>{m.engagement.name}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    {s?.openSos>0&&<Row label="Active SOS" value={s.openSos} color="#ef4444"/>}
                    {s?.highRisks>0&&<Row label="High Risks" value={s.highRisks} color="#f59e0b"/>}
                    {d!==null&&d<=14&&<Row label="Days to Submission" value={`${d}d`} color={d<=7?"#ef4444":"#f59e0b"}/>}
                    {s?.leadershipSignals>0&&<Row label="Leadership Signals" value={s.leadershipSignals} color="#f59e0b"/>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leadership priorities */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[
          {label:"Pending Decisions",value:totalPending,color:totalPending>0?GOLD:"#22c55e",icon:"📌"},
          {label:"High-Severity Risks",value:totalHighRisk,color:totalHighRisk>0?"#f59e0b":"#22c55e",icon:"⚠️"},
          {label:"Proposal Issues",value:active.reduce((a,m)=>a+(statsById[m.engagement.id]?.proposalIssues??0),0),color:"rgba(255,255,255,0.6)",icon:"🎯"},
        ].map(({label,value,color,icon})=>(
          <div key={label} style={{background:BG2,border:`0.5px solid ${BORDER}`,borderRadius:10,padding:"16px 18px",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24}}>{icon}</span>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:4}}>{label}</div>
              <div style={{fontSize:26,fontWeight:800,color,lineHeight:1}}>{value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({children}:{children:React.ReactNode}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
      <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.2em",textTransform:"uppercase",color:`${GOLD}`,opacity:0.7}}>{children}</span>
      <div style={{flex:1,height:"0.5px",background:`linear-gradient(to right, rgba(196,154,42,0.3), transparent)`}}/>
    </div>
  );
}
