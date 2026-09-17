'use strict';
const dayKey=value=>new Date(new Date(value).getTime()+5*3600000).toISOString().slice(0,10);
function dashboard(db,stationId,now=new Date(),evidenceExists=()=>true){
 const today=dayKey(now),runs=(db.runs||[]).filter(r=>r.stationId===stationId),completed=runs.filter(r=>r.status==='completed'&&r.completedAt&&dayKey(r.completedAt)===today),pending=runs.filter(r=>r.status!=='completed');
 const totals={fuelMilli:0,salesMinor:0,expectedMinor:0,cashMinor:0,varianceMinor:0};
 for(const r of completed){const c=r.calculation;if(!c)continue;totals.fuelMilli+=c.totalMilli;totals.salesMinor+=c.expectedMinor;totals.expectedMinor+=c.expectedMinor;totals.cashMinor+=c.cashMinor;totals.varianceMinor+=c.varianceMinor;}
 const describe=r=>({id:r.id,status:r.status,salesman:r.snapshot.salesmanName,machine:r.snapshot.machineName,shift:r.snapshot.shiftName,startedAt:r.startedAt||r.createdAt,endedAt:r.endedAt||null,completedAt:r.completedAt||null,calculation:r.calculation||null});
 const exceptions=[];
 for(const r of completed){if(r.calculation?.varianceMinor)exceptions.push({...describe(r),issue:r.calculation.varianceMinor<0?'Cash shortage':'Cash excess',severity:r.calculation.varianceMinor<0?'warning':'info'});if(!r.calculation)exceptions.push({...describe(r),issue:'Missing calculation',severity:'warning'});}
 for(const r of runs){const overdue=r.status!=='completed'&&(db.assignments||[]).find(a=>a.id===r.assignmentId)?.endsAt<now.toISOString();
 if(overdue)exceptions.push({...describe(r),issue:'Overdue incomplete shift',severity:'warning'});
 if(r.status==='review')exceptions.push({...describe(r),issue:'Awaiting final submission',severity:'info'});
 // Missing input is normal during capture; flag it once overdue, or when finalization is expected.
 if(overdue||r.status==='completed'||r.status==='review'){
 const missingReading=r.readings.some(n=>!n.opening||(r.status!=='opening'&&r.status!=='active'&&!n.closing));
 const missingPhoto=r.readings.some(n=>[n.opening,n.closing].some(e=>e&&(!e.photoId||!evidenceExists(e.photoId))));
 if(missingReading)exceptions.push({...describe(r),issue:'Missing meter reading',severity:'warning'});
 if(missingPhoto)exceptions.push({...describe(r),issue:'Missing reading evidence',severity:'warning'});
 }}
 const trend=Array.from({length:7},(_,i)=>{const date=dayKey(new Date(now.getTime()-(6-i)*86400000));return {date,salesMinor:runs.filter(r=>r.status==='completed'&&r.completedAt&&dayKey(r.completedAt)===date).reduce((sum,r)=>sum+(r.calculation?.expectedMinor||0),0)};});
 return {date:today,timezone:'Asia/Karachi',generatedAt:now.toISOString(),totals,counts:{activeSalesmen:new Set(pending.filter(r=>r.status==='active').map(r=>r.salesmanId)).size,activeShifts:pending.filter(r=>r.status==='active').length,completedShifts:completed.length,activeMachines:(db.machines||[]).filter(m=>m.stationId===stationId&&m.status==='active').length,pendingShifts:pending.length},inProgress:pending.sort((a,b)=>(a.startedAt||a.createdAt).localeCompare(b.startedAt||b.createdAt)).map(describe),recentCompleted:completed.slice().sort((a,b)=>b.completedAt.localeCompare(a.completedAt)).slice(0,10).map(describe),exceptions,trend};
}
module.exports={dashboard,dayKey};
