// node gen_tpc_md.js [lib/core.js] [docs/TPC.md]: writes the TPC reference page from the editor's tables
const fs=require('fs');
const u16=(r,o)=>r[o]|r[o+1]<<8, fixed=(v,d)=>v.toFixed(d);
const SRC=fs.readFileSync(process.argv[2]||'lib/core.js','utf8');
const BLOCK=SRC.slice(SRC.indexOf('  const TURN_COMMON = ['),SRC.indexOf('  const api = {\n    REC,'));
eval(BLOCK.replace(/^  const /gm,'var ').replace(/^  function /gm,'function '));
const hex=n=>'0x'+n.toString(16).toUpperCase().padStart(2,'0');
const dText=(unit,d,kind)=>{ // default shown as the control shows it
  const v=tpcDefault(unit,d,undefined,false,kind); if(v===null||v===undefined) return '';
  if(kind==='bits') return v.toString(2).padStart(8,'0'); return tpcText(v,kind,false); };
let o=[];
o.push('# TPC (tool path control) records of Mazatrol programs\n');
o.push('What each TPC record holds, as read from programs edited on Smooth CAM Ai and from the machines\' own parameter lists. Generated from the editor\'s tables (`lib/core.js`); the editor reads, shows and edits all of it (**TPC** soft key).\n');
o.push('## Records\n');
o.push('| Class | Record code | Notes |\n|---|---|---|');
o.push('| parameter | `0xD0`-`0xEF`, `0xF4`-`0xFF` | `xx 00 00 00` header; fields are little-endian u16 (a few u32) at fixed offsets per code |');
o.push('| relay point | `0xF0`, bytes 4-5 = `FF 01` | approach / escape; byte 10 = 01 / 02 on mills, 03 / 04 on the turning centre; M u16 @20/22/24, X Y Z u32 /100000 @36..68, S u32 /1000 @72/76/80 |');
o.push('| rotate position | `0xF1` | CORNER (ROUGH byte 10 = 1, FIN = 2, always empty); MMS and TRANSFER keep their M codes in the first one (u16 @26/28, TRANSFER head 2 @42/44) |');
o.push('| extra fields | other `0xF0` | mill-turn POCKET: E40 @84, E41 @88 (len2) |\n');
o.push('A unit without a TPC record runs on the machine\'s parameters. Editing a unit creates the record (a parameter-only edit adds one record; relay points add two).\n');
o.push('## Scales\n');
o.push('| kind | inch | metric (one decimal fewer) |\n|---|---|---|');
for(const k of ['len1','len2','len3','len4','len5']) o.push(`| ${k} | /${Math.round(1/TPC_SCALE[k])} | /${Math.round(1/TPC_SCALE_MM[k])||1} |`);
o.push('| int | integer | integer |\n| sec2 | /100 | |\n| dec, dec1 | raw + ".", raw / 10 | |\n| bits | 8 binary digits, bit 0 rightmost | |\n');
o.push('## Layouts\n');
for(const [code,L] of Object.entries(TPC_LAYOUTS).sort((a,b)=>a[0]-b[0])){
  o.push(`### ${hex(+code)} ${L.unit}\n`);
  o.push('| offset | parameter | name | kind | default |\n|---|---|---|---|---|');
  for(const f of L.fields.slice().sort((a,b)=>a[0]-b[0])) o.push(`| ${f[0]} | ${f[1]} | ${(f[2]||TPC_NAMES[f[1]]||'').replace(/\|/g,'/')} | ${f[3]}${f[4]==='S'?' (Smooth)':''} | ${dText(L.unit,f[1],f[3])} |`);
  o.push('');
}
o.push('Turning units (`0xF5`-`0xFC`) also end with TC37-TC40 @46..52, TC62 @56, TC45 @96; on a turning machine the point units add TC37-TC40 and TC62.\n');
o.push('## Bit fields (bit 0 rightmost; 1 does what is written)\n');
for(const [d,labels] of Object.entries(TPC_BITS)){
  const df=TPC_BIT_DEFAULT[d];
  o.push(`**${d}**${df!==undefined?` (default ${df.toString(2).padStart(8,'0')})`:''}\n`);
  labels.forEach((l,k)=>o.push(`- bit ${k}: ${l||'(not used)'}`));
  o.push('');
}
o.push('Findings from flipping bits on the control (time and tool path picture): D92 bit 3 shortens the tap and changes the path; E93 bits 2 and 3 change the finish pass and bit 4 shortens it by 2.3 s; E104 bit 7 adds 14 ms; E92 bits 1/5/6/7, E95 bits 0/1/5, E104 bits 0-6, TC290 bits 0-7, D91 bits 3/5 and D92 bits 2/4/7 showed no change on the cases tried.\n');
o.push('## Defaults\n');
o.push('Stored values; what the control shows in a new program on a horizontal mill. Machine-dependent: **D92** 0F (horizontal mill), 2F (lathe), 1F (mill-turn); **E99** 00 (horizontal mill), 30 (mill-turn), 40 (metric machine); **D141** 02 (mill, lathe), D2 (mill-turn); **TC62** 0 / 6, **TC45** 0.0079 / 0.1 (350 / mill-turn). The editor never marks bits D92 4-5 and E99 4-6 as changed.\n');
o.push('```\nE: '+JSON.stringify(TPC_DEFAULT_E)+'\nTC: '+JSON.stringify(TPC_DEFAULT_TC)+'\nmill-turn: '+JSON.stringify(TPC_DEFAULT_MT)+'\nmetric: '+JSON.stringify(TPC_DEFAULT_MM)+'\n```\n');
o.push('## Colours on the control\'s program screen\n');
o.push('- white = typed by the user; yellow = worked out by the control (AUTO SET) or a `?` left for it, and always the priority number column; green = fixed text (unit, tool, figure names); magenta box = the second variant of a menu value. Meaning (programming manuals): PART `*OUT` `*IN` `*FCE` `*BAK` = "middle type" (cut from the middle of the periphery / face); lathe tool section `*IN` `*EDG` = the back-side (BAK) tool; `*CCW` `*CW` on CIRC MIL = direction of the circular tornado cycle (TORNA. 1). Face-milling TYPE `*XBI` ... and PAT `*CHK`: not found in the manuals (the TYPE ones are probably the SHORT / ARCSHORT variants).');
o.push('- Tool line byte 13: bit 2 (0x04) APRCH-X calculated, bit 3 (0x08) APRCH-Y calculated, bits 0 / 1 = `?` for X / Y. Typing a value clears the flag. Typing the value already shown changes nothing.');
o.push('- Turning PART (unit byte 20): 1 OUT, 2 *OUT, 3 IN, 4 *IN, 5 FCE, 6 *FCE, 7 BAK, 8 *BAK.\n');
fs.writeFileSync(process.argv[3]||'docs/TPC.md',o.join('\n'));
console.log(o.length,'lines');
