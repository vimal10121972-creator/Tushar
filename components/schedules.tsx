'use client';
import {useEffect,useState} from 'react';
type Schedule={id:string;company:{name:string};frequency:string;next_run_at:string;enabled:boolean};
export function Schedules(){
 const [items,setItems]=useState<Schedule[]>([]),[error,setError]=useState('');
 async function load(){const r=await fetch('/api/schedules');const d=await r.json();if(!r.ok)throw new Error(d.error||'Schedules unavailable');setItems(d.schedules);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 return <section><h2>Scheduled research</h2><p className="muted">Create monthly or quarterly schedules from a selected company. They run through the single daily queue, subject to free quotas.</p>{error?<p role="alert">{error}</p>:null}{items.filter(s=>s.enabled).map(s=><div key={s.id} className="selection-summary"><strong>{s.company.name}</strong><p>{s.frequency} · next due {new Date(s.next_run_at).toLocaleDateString('en-IN')}</p><button className="button button-white" onClick={async()=>{try{const r=await fetch('/api/schedules/'+s.id,{method:'DELETE'});if(!r.ok)throw new Error('Could not disable schedule');await load();}catch(e){setError((e as Error).message);}}}>Disable schedule</button></div>)}{!items.some(s=>s.enabled)?<p className="muted">No active schedules.</p>:null}</section>;
}
