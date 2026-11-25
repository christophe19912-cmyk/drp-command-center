// Access is enforced by Vercel Authentication on all deployment URLs.
const stores=['North Hills','Greensburg','Allegheny Valley'];
const num=v=>Number(String(v??'').replace(/[$,]/g,''))||0;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):null;
const ro=r=>String(r.Folder??'').trim();
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).end();
const {store}=req.body||{},key=process.env.UPLOAD_CENTER_SERVICE_KEY;
if(!key)return res.status(503).json({error:'Connection not configured'});
if(!stores.includes(store))return res.status(400).json({error:'Invalid store'});
try{const url=new URL('https://ricxdebplslcdlwsbvdg.supabase.co/rest/v1/wip_capacity_snapshots');url.search=new URLSearchParams({select:'report_date,source_filename,cars,raw_rows,created_at',store:'eq.'+store,order:'report_date.desc,created_at.desc',limit:'120'});const response=await fetch(url,{headers:{apikey:key,Authorization:'Bearer '+key}});if(!response.ok)throw Error('Source unavailable');const data=await response.json();if(!data.length)return res.json({available:false});
const valid=s=>Array.isArray(s.raw_rows)&&s.cars>0&&s.raw_rows.length===s.cars&&s.raw_rows.every(r=>/^\d+$/.test(ro(r))&&typeof r.Insurance==='string')&&new Set(s.raw_rows.map(ro)).size===s.cars;
if(!valid(data[0]))return res.status(409).json({error:'Latest report incomplete or invalid; no closures inferred'});
const days=new Set(),snapshots=[];for(const s of data){if(days.has(s.report_date))continue;days.add(s.report_date);if(!valid(s))break;snapshots.push(s)}
const map=(r,s)=>({ro:ro(r),insurer:r.Insurance,customer:'',stage:String(r.Stage??''),technician:String(r.__bodyTech||r['Service Resource']||''),arrival_date:date(r.Arrival),internal_date:date(r.Internal),days_on_site:date(r.Arrival)?Math.max(0,Math.round((Date.parse(s.report_date)-Date.parse(date(r.Arrival)))/86400000)):0,ro_total:num(r['Pre-Tax Total']),labor_hours:num(r['B Hrs'])+num(r['R Hrs'])+num(r['M Hrs']),missing_parts:num(r.MP),uploaded_at:s.created_at,source_file:s.source_filename});
const sf=r=>/state\s*farm/i.test(r.Insurance),closed=new Map();let previous=null;for(const s of [...snapshots].reverse()){const present=new Set(s.raw_rows.map(ro));for(const id of present)closed.delete(id);if(previous)for(const r of previous.raw_rows){if(sf(r)&&!present.has(ro(r)))closed.set(ro(r),{...map(r,previous),last_seen:previous.report_date,closed_detected:s.report_date})}previous=s}
const latest=snapshots[0];return res.json({available:true,reportDate:latest.report_date,filename:latest.source_filename,active:latest.raw_rows.filter(sf).map(r=>map(r,latest)),history:snapshots.flatMap(s=>s.raw_rows.filter(sf).map(r=>map(r,s))),closed:[...closed.values()]});
}catch{return res.status(502).json({error:'Upload Center unavailable; no closures inferred'})}}
