// Audit every shipped video for the blank-hero defect. NO capture — pure ffmpeg on existing files,
// so it is safe in daylight. Coarse pass (~8 frames in the Maps window); anything flagged gets a
// dense re-check before it is reported, so a single mis-sampled frame can't create a false alarm.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const V = '/Users/chris/RGA/Rocket Growth Agency Website VS Code/v';
const BAND = { x:0.3156, y:0.0694, w:0.25, h:0.2667 };

function px(f,t,vf){ return execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(t),'-i',f,'-vf',vf,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<22,timeout:15000}); }
function isMaps(f,t){ try{ const r=px(f,t,'scale=96:54'); const n=r.length/3|0; let w=0,c=0;
  for(let i=0;i<n;i++){const R=r[i*3],G=r[i*3+1],B=r[i*3+2]; if(R>238&&G>238&&B>238)w++; if(Math.max(R,G,B)-Math.min(R,G,B)>18)c++;}
  return (100*w/n)<85 && (100*c/n)>=6; }catch{ return false; } }
function blank(f,t,W,H){ try{
  const r=px(f,t,`crop=${Math.round(W*BAND.w)}:${Math.round(H*BAND.h)}:${Math.round(W*BAND.x)}:${Math.round(H*BAND.y)},scale=64:48`);
  const n=r.length/3|0; let w=0,b=0;
  for(let i=0;i<n;i++){const R=r[i*3],G=r[i*3+1],B=r[i*3+2]; if(B>R+12&&B>G+6)b++; if(R>238&&G>238&&B>238)w++;}
  return (100*w/n)>=85 && (100*b/n)<40; }catch{ return false; } }
function meta(f){ const o=execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-show_entries','format=duration','-of','default=nw=1:nk=1',f],{timeout:15000}).toString().trim().split('\n');
  return { W:+o[0], H:+o[1], D:parseFloat(o[2]) }; }

const dirs = fs.readdirSync(V).filter(d=>fs.existsSync(path.join(V,d,'video.mp4')));
console.log(`scanning ${dirs.length} videos…`);
const flagged=[]; let done=0, errs=0;
for (const d of dirs){
  const f = path.join(V,d,'video.mp4');
  try{
    const {W,H,D} = meta(f);
    if(!(D>20)) { done++; continue; }
    // coarse: every 4s across the Maps window
    let hits=[];
    for(let t=D*0.08; t<=D*0.42; t+=4){ const tt=+t.toFixed(1); if(isMaps(f,tt)&&blank(f,tt,W,H)) hits.push(tt); }
    if(hits.length){
      // dense re-check ±3s around the first hit — require 2 consecutive seconds
      let run=0,best=0;
      for(let t=Math.max(1,hits[0]-3); t<=hits[0]+6; t+=1){ const tt=+t.toFixed(1);
        if(isMaps(f,tt)&&blank(f,tt,W,H)){ run++; if(run>best)best=run; } else run=0; }
      if(best>=2) flagged.push({slug:d, at:hits[0], secs:best});
    }
  }catch(e){ errs++; }
  done++;
  if(done%50===0) console.log(`  ${done}/${dirs.length}  flagged so far: ${flagged.length}`);
}
console.log(`\nDONE  scanned:${done}  errors:${errs}  FLAGGED:${flagged.length}`);
flagged.sort((a,b)=>b.secs-a.secs).forEach(x=>console.log(`  ${String(x.secs).padStart(2)}s blank from ${String(x.at).padStart(5)}s  ${x.slug}`));
fs.writeFileSync('/tmp/blank-hero-audit.json', JSON.stringify(flagged,null,1));
console.log('\nwritten: /tmp/blank-hero-audit.json');
