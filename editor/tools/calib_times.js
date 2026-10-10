// Calibration: the editor's per-unit times against the control's own (MC_sdg/cutest/*.ebd records) for every unit of the
// programs on a machine folder (default the two horizontal mills). usage: node tools/calib_times.js ["name,name"]
// writes calib-rows.json (here) and prints the ratio editor/control by unit type. load_app.js loads the built app's modules.
// Set NODIA=1 to leave the machine's tool diameters out. Reads the shop data in place; nothing is copied.
const fs=require('fs'),path=require('path');
const W=require('./load_app.js')(process.env.MAZED||require('path').resolve(__dirname,'../../apps/Mazatrol Editor.html'));const {Maz,Paths,GCode}=W;
const machine=m=>require('../tests/datapaths.js').machine(m)+'/';
const FIXED={mms:3.5,index:2.2,pallet:10.3,mcode:1.6,mmsBy:process.env.OLDMMS?undefined:Paths.MMS_BY};
const machines=(process.argv[2]||'MCH-C1,MCH-C2').split(',');
const rows=[];const memo={};
function mach(m){if(memo[m])return memo[m];const f=machine(m)+'m8ysram';let r={mts:[],tf:[]};try{const tt=Maz.parseMachineMemory(new Uint8Array(fs.readFileSync(f)),'m8ysram');r={mts:Maz.machineTools(tt),tf:Maz.toolFileEntries(tt)}}catch(e){}return memo[m]=r}
function diaFn(m,p,units){const M=mach(m),nm=units==='metric'?1e6:25.4e6,map=new Map();for(const pt of Maz.programTools(p,units))for(const l of pt.lines)map.set(l,pt);
  return (pp,ti,nom)=>{const pt=map.get(ti);if(!pt)return nom;if(pt.type===13){const e=Maz.findToolFile(pt,M.tf);if(e)return (e.nom+e.min)/2/nm}
    const r=Maz.checkTool(pt,M.mts),act=r.status==='ok'?r.tools[0].dia:0;return act>0?act/nm:nom}}
function nebd(b){const out=[];for(let o=0x40;o+176<=b.length;o+=176){const uno=b.readUInt16LE(o+72),ms=b.readUInt32LE(o+24);if(!uno&&!ms)break;out.push({ms,uno,code:b.readUInt16LE(o+74)})}return out}   // newer control: 176-byte records from 0x40
function ebd(f){if(/\.nebd$/i.test(f))return nebd(fs.readFileSync(f));const b=fs.readFileSync(f);const n=b.readUInt32LE(0),out=[];for(let i=0;i<n&&16+96*(i+1)<=b.length;i++){const o=16+96*i;out.push({ms:b.readUInt32LE(o+20),uno:b.readUInt16LE(o+68),code:b.readUInt16LE(o+70)})}return out}
for(const m of machines){const cd=machine(m)+'MC_sdg/cutest/',pd=machine(m)+'MC_Machine Programs/';if(!fs.existsSync(cd))continue;
  const progs={};for(const f of fs.readdirSync(pd))progs[f.replace(/\.[^.]+$/,'').toUpperCase()]=pd+f;
  for(const f of fs.readdirSync(cd)){if(/\.vebd$/i.test(f))continue;const name=f.replace(/\.[^.]+$/,'').toUpperCase();const pf=progs[name];if(!pf)continue;
    let recs;try{recs=ebd(cd+f)}catch(e){continue}if(!recs.length)continue;
    let p;try{p=Maz.parse(new Uint8Array(fs.readFileSync(pf)),path.basename(pf))}catch(e){continue}
    const ls=Maz.lines(p),us=Maz.structure(p,ls);const byUno={};us.forEach((u,i)=>{byUno[Maz.number(p.recs[u.i])]={i,code:u.code,u}});
    const ctl={};let ok=0,bad=0;for(const r of recs){const u=byUno[r.uno];if(u&&u.code===r.code){ctl[r.uno]=(ctl[r.uno]||0)+r.ms/1000;ok++}else bad++}
    if(!ok||bad>ok*0.2)continue;                 // the program on the machine is not the one that was timed
    let best=null;
    for(const units of ['inch','metric']){let r;try{r=Paths.program(p,units,ls,undefined,{fixed:FIXED,toolDia:process.env.NODIA?undefined:diaFn(m,p,units),resolve:n=>{const base=String(n).replace(/\.[^.]*$/,'').toUpperCase();const pf2=progs[base];if(!pf2||pf2===pf)return null;if(/\.(EIA|NC|TAP|CNC|ISO)$/i.test(pf2)){try{return {moves:GCode.run(base,fs.readFileSync(pf2,'latin1'),{}).moves.filter(m=>m.kind!=='dwell')}}catch(e){return null}}try{const q=Maz.parse(new Uint8Array(fs.readFileSync(pf2)),path.basename(pf2));return {p:q}}catch(e){return null}}})}catch(e){continue}
      const tm=GCode.times(r.moves,{units,accel:units==='metric'?2000:80});const by={};r.moves.forEach((mv,k)=>{by[mv.unit]=(by[mv.unit]||0)+(tm.each[k]||0)});
      if(Maz.CONTROLS[p.ctl].type==='millturn'){          // turning units from the turning view, the rest from the milling one
        let rt;try{rt=Paths.program(p,units,ls,'turn',{fixed:FIXED,toolDia:undefined})}catch(e){rt=null}
        if(rt){const tt=GCode.times(rt.moves,{units,accel:units==='metric'?2000:80}),byT={};rt.moves.forEach((mv,k)=>{byT[mv.unit]=(byT[mv.unit]||0)+(tt.each[k]||0)});
          us.forEach((u,i)=>{if(u.code>=0x30&&u.code<=0x37)by[i]=byT[i]||0})}}
      let ct=0,et=0;for(const n of Object.keys(ctl)){ct+=ctl[n];et+=by[byUno[n].i]||0}
      const err=Math.abs(Math.log((et+1)/(ct+1)));if(!best||err<best.err)best={err,units,by,tot:[ct,et]}}
    if(!best)continue;
    for(const n of Object.keys(ctl)){const u=byUno[n];if(Maz.controlOut(ls[u.u.i]))continue;rows.push({m,prog:name,uno:+n,code:u.code,unit:Maz.unitName(p.ctl,u.code),ctl:ctl[n],ed:best.by[u.i]||0,units:best.units})}}}
fs.writeFileSync('calib-rows.json',JSON.stringify(rows));
const g={};for(const r of rows){if(r.ctl<1)continue;(g[r.unit]=g[r.unit]||[]).push(r.ed/r.ctl)}
const q=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
console.log('programs matched, units timed:',rows.length);console.log('unit'.padEnd(12),'n'.padStart(5),'p10'.padStart(6),'median'.padStart(7),'p90'.padStart(6));
for(const k of Object.keys(g).sort((a,b)=>g[b].length-g[a].length))console.log(k.padEnd(12),String(g[k].length).padStart(5),q(g[k],.1).toFixed(2).padStart(6),q(g[k],.5).toFixed(2).padStart(7),q(g[k],.9).toFixed(2).padStart(6));
