const fs=require('fs'),path=require('path');
const W=require('./load_app.js')(process.env.MAZED||require('path').resolve(__dirname,'../../apps/Mazatrol Editor.html'));const {Maz}=W;
const rows=require('./calib-rows.json').filter(r=>r.unit==='MMS');
const machine=m=>require('../tests/datapaths.js').machine(m)+'/';const cache={};
const types=['Z-FACE','X-FACE','Y-FACE','X-STP','Y-STP','X-GRV','Y-GRV','XY-BOS','BORE-XY'];const X=[],Y=[];
for(const r of rows){const pf=fs.readdirSync(machine(r.m)+'MC_Machine Programs').find(f=>f.replace(/\.[^.]+$/,'').toUpperCase()===r.prog);
  const p=cache[pf]||(cache[pf]=Maz.parse(new Uint8Array(fs.readFileSync(machine(r.m)+'MC_Machine Programs/'+pf)),pf));const ls=Maz.lines(p),us=Maz.structure(p,ls);
  const u=us.find(u=>Maz.number(p.recs[u.i])===r.uno);const row=types.map(()=>0);let bad=false;
  for(const i of u.seqs){const L=ls[i];if(L.sel.code!==0xa2||!L.lay)continue;const k=L.lay.cells.findIndex((c,j)=>Maz.cellLabel(L.lay,j)==='PTN');const v=Maz.cellText(L,k,{units:r.units}).trim();const ti=types.indexOf(v);if(ti<0)bad=true;else row[ti]++}
  if(bad||!row.some(Boolean))continue;X.push(row);Y.push(r.ctl)}
// least squares (ridge-free): solve (X'X)t = X'y
const n=types.length,A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
X.forEach((x,i)=>{for(let a=0;a<n;a++){b[a]+=x[a]*Y[i];for(let c=0;c<n;c++)A[a][c]+=x[a]*x[c]}});
for(let a=0;a<n;a++)A[a][a]+=1e-6;
for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];[b[c],b[p]]=[b[p],b[c]];
  for(let r=c+1;r<n;r++){const f=A[r][c]/A[c][c];for(let k=c;k<n;k++)A[r][k]-=f*A[c][k];b[r]-=f*b[c]}}
const t=Array(n).fill(0);for(let r=n-1;r>=0;r--){let s=b[r];for(let k=r+1;k<n;k++)s-=A[r][k]*t[k];t[r]=s/A[r][r]}
const cnt=types.map((_,k)=>X.reduce((a,x)=>a+(x[k]>0?1:0),0));
console.log('units fitted',X.length);types.forEach((k,i)=>console.log(k.padEnd(8),'units',String(cnt[i]).padStart(3),'fit',t[i].toFixed(2),'s'));
const pred=X.map(x=>x.reduce((a,v,k)=>a+v*t[k],0));const ct=Y.reduce((a,v)=>a+v,0),pt=pred.reduce((a,v)=>a+v,0);console.log('total control',ct.toFixed(0),'fit',pt.toFixed(0));
const err=Y.map((y,i)=>Math.abs(pred[i]-y)).sort((a,b)=>a-b);console.log('median abs error',err[Math.floor(err.length/2)].toFixed(1),'s');
