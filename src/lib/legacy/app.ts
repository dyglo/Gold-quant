// @ts-nocheck
/* eslint-disable */
import { trialRecorder } from '../data/trials';
import { digest } from '../backend/http';
// Lift-and-shift of the prototype script. mount() wires the engine and the DOM by id.
// Phase 2 (see README): split into typed engine modules and React components.
export function mount(api: { load: () => Promise<any>; quote?: () => Promise<any>; intraday?: () => Promise<any> }) {
let disposed=false,refreshing=false,quoteBusy=false,QUOTE=null,quoteFailed=false,MODELS=false,CHART=null,CHART_RET=null,DAY=null,dayBusy=false,dayFailed=false,dayFetched=0;
const $=id=>document.getElementById(id),fm=(v,d=2)=>"$"+v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const W=60,THR=[1,1.5,2,2.5],RG={"1D":0,"1W":6,"1M":22,"3M":63,"6M":126,"1Y":250,ALL:1e9},FN=["DXY","Oil (WTI)","Real yield (Δ)"],FK=["dxy","oil","ry"];
let SYN=true,TRI={},KEY=new Map(),LAG={gold:0,dxy:0,oil:0,ry:1,etf:1,cot:3,vix:0};const st={rng:"1Y",on:[true,true,true],inv:false};let D,A={},hov=null,seed=7,BT={},META={},PERSISTED=null,FINGERPRINT='',TRIAL_TEXT='';
const recorder=trialRecorder(n=>{PERSISTED=n;if(D)backtest(false)});
recorder.load();
async function evidence(){
 try{const r=await fetch('/api/evidence');if(r.ok){const b=await r.json();$('unlock-status').textContent=b.snapshotDays+' days of own snapshots · '+b.reason;}}catch{}

 try{const r=await fetch('/api/ledger');if(r.ok){const b=await r.json(),t=b.trackRecord[0];$('live-track').textContent=b.status+' · '+b.rows.length+' days · hit rate '+(t.hitRate==null?'—':(100*t.hitRate).toFixed(0)+'%')+' · IC '+(t.ic.ic==null?'—':t.ic.ic.toFixed(3));}}catch{}
 try{const r=await fetch('/api/validation?horizon=1');if(r.ok){const b=await r.json();$('bias-grade').textContent=b.grade||'C';$('unlock-status').textContent+=' · '+(b.verdict||'insufficient evidence')+' · '+(b.reason||'Research, not live');if(b.ic)$('validation-result').innerHTML='<div class="note">Research, not live · Grade '+esc(b.grade)+'</div><table class="ch"><tr><th>Horizon</th><th>IC</th><th>N / effective</th></tr><tr><td>1 bar</td><td>'+esc(b.ic.ic?.toFixed(3)??'—')+'</td><td>'+b.ic.n+' / '+b.ic.effectiveSampleSize+'</td></tr></table><table class="ch"><tr><th>Bucket</th><th>Mean</th><th>N</th></tr>'+b.buckets.groups.map(g=>'<tr><td>'+esc(g.bucket)+'</td><td>'+esc(g.mean?.toFixed(4)??'—')+'</td><td>'+g.n+'</td></tr>').join('')+'</table>';}}catch{$('unlock-status').textContent='Evidence check unavailable';}
}
evidence();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cor=(a,b,s,e)=>{let n=0,ma=0,mb=0;for(let i=s;i<e;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))continue;ma+=a[i];mb+=b[i];n++}if(n<3)return NaN;ma/=n;mb/=n;let x=0,y=0,z=0;for(let i=s;i<e;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))continue;const p=a[i]-ma,q=b[i]-mb;x+=p*q;y+=p*p;z+=q*q}return x/Math.sqrt(y*z||1)};
function ols(s,e){const n=e-s,k=3,m=[0,0,0];let my=0;for(let i=s;i<e;i++)my+=A.G[i];my/=n;
 for(let j=0;j<k;j++){for(let i=s;i<e;i++)m[j]+=A.F[j][i];m[j]/=n}
 const M=[[],[],[]],v=[0,0,0];
 for(let j=0;j<k;j++){for(let l=0;l<k;l++){let t=0;for(let i=s;i<e;i++)t+=(A.F[j][i]-m[j])*(A.F[l][i]-m[l]);M[j][l]=t}let t=0;for(let i=s;i<e;i++)t+=(A.F[j][i]-m[j])*(A.G[i]-my);v[j]=t}
 const cv0=v.slice();for(let c=0;c<k;c++){let p=c;for(let r=c+1;r<k;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];[v[c],v[p]]=[v[p],v[c]];
  for(let r=c+1;r<k;r++){const f=M[r][c]/M[c][c];for(let l=c;l<k;l++)M[r][l]-=f*M[c][l];v[r]-=f*v[c]}}
 const b=[0,0,0];for(let c=k-1;c>=0;c--){let t=v[c];for(let l=c+1;l<k;l++)t-=M[c][l]*b[l];b[c]=t/M[c][c]}
 const a=my-b.reduce((q,x,j)=>q+x*m[j],0);let sse=0,sst=0;for(let i=s;i<e;i++){const f=a+b.reduce((q,x,j)=>q+x*A.F[j][i],0);sse+=(A.G[i]-f)**2;sst+=(A.G[i]-my)**2}
 return{b,a,sd:Math.sqrt(sse/(n-4)),r2:1-sse/sst,sh:b.map((x,j)=>x*cv0[j]/sst)}}
function calc(){const n=D.gold.length,G=[0],F=[[0],[0],[0]];
 for(let i=1;i<n;i++){G.push(Math.log(D.gold[i]/D.gold[i-1]));F[0].push(D.dxy?Math.log(D.dxy[i]/D.dxy[i-1]):NaN);F[1].push(D.oil?Math.log(D.oil[i]/D.oil[i-1]):NaN);F[2].push(D.ry?D.ry[i]-D.ry[i-1]:NaN)}
 A={n,G,F,z:new Array(n).fill(null),rc:[[],[],[]],sh:[]};
 for(let t=W+1;MODELS&&t<n;t++){const f=ols(t-W,t);A.sh[t]=f.sh;A.z[t]=f.sd>0?(G[t]-f.a-f.b.reduce((q,x,j)=>q+x*F[j][t],0))/f.sd:null}
 A.rd=[0,1,2].map(j=>{const r=new Array(n).fill(null);for(let t=W;t<n;t++)r[t]=cor(G,F[j],t-W+1,t+1);return r});for(let j=0;j<3;j++)for(let t=W;t<n;t+=3)A.rc[j].push(A.rd[j][t])}
function plot(cv,S,o={}){const w=cv.clientWidth,h=cv.clientHeight,r=devicePixelRatio||1;if(cv.width!=Math.round(w*r)||cv.height!=Math.round(h*r)){cv.width=w*r;cv.height=h*r}
 const c=cv.getContext("2d");c.setTransform(r,0,0,r,0,0);c.clearRect(0,0,w,h);
 if(!S.length||!S.some(s=>s.a.length))return;
 const all=S.flatMap(s=>s.a).filter(Number.isFinite),mn=o.min??Math.min(...all),mx=o.max??Math.max(...all),L=S[0].a.length,p=12,X=i=>i/Math.max(1,L-1)*w,Y=v=>h-p-(v-mn)/(mx-mn||1)*(h-2*p);
 c.setLineDash([2,6]);c.strokeStyle="#333";c.lineWidth=1;(o.hl||[]).forEach(v=>{c.beginPath();c.moveTo(0,Y(v));c.lineTo(w,Y(v));c.stroke()});
 if(o.vl!=null){c.beginPath();c.moveTo(X(o.vl),0);c.lineTo(X(o.vl),h);c.stroke()}c.setLineDash([]);
 S.forEach(s=>{c.strokeStyle=s.c;c.lineWidth=1.8;c.lineJoin="round";c.beginPath();let gap=true;s.a.forEach((v,i)=>{if(!Number.isFinite(v)){gap=true;return}gap?c.moveTo(X(i),Y(v)):c.lineTo(X(i),Y(v));gap=false});c.stroke()});
 if(o.h!=null){const s=S[S.length-1],x=X(o.h);c.strokeStyle="#666";c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();c.fillStyle=s.c;c.beginPath();c.arc(x,Y(s.a[o.h]),5,0,7);c.fill()}}
const COL=["#6cb4ff","#f5a623","#b388ff"],zs=a=>{const v=a.filter(Number.isFinite),m=v.reduce((x,y)=>x+y,0)/v.length,sd=Math.sqrt(v.reduce((x,y)=>x+(y-m)**2,0)/v.length)||1;return a.map(x=>Number.isFinite(x)?(x-m)/sd:null)};
function main(){if(st.rng==='1D'){dayMain();return}if(!D)return;const C=CHART||D,n=C.gold.length,L=Math.min(RG[st.rng],n),s=n-L,g=C.gold.slice(s);A.L=L;
 const S=FK.map((k,j)=>st.on[j]&&C[k]?.some(Number.isFinite)?{a:zs(C[k].slice(s)).map(v=>Number.isFinite(v)?(st.inv?-v:v):null),c:COL[j]}:null).filter(Boolean),up=g[L-1]>=g[0],i=hov??L-1,d=g[i]-g[0];
 S.push({a:zs(g),c:up?"#00c805":"#ff5000"});plot($("chart"),S,{h:hov,hl:[0]});
 $("pv").textContent=fm(g[i]);$("dt").textContent=C.dates[s+i]+' · completed daily midpoint';
 if(hov==null)showQuote();
 $("d1").className="d "+(d>=0?"up":"dn");$("d1").innerHTML=(d>=0?"▲ ":"▼ ")+fm(Math.abs(d))+" ("+Math.abs(d/g[0]*100).toFixed(2)+"%)<span>"+(st.rng=="ALL"?"All time":st.rng)+"</span>";
 $("d2").className="d";$("d2").innerHTML="Return correlation over range: "+(FK.map((k,j)=>st.on[j]&&C[k]?`<span style="color:${COL[j]};margin:0">${FN[j].split(" ")[0]} ${cor(CHART_RET.G,CHART_RET.F[j],s+1,n).toFixed(2)}</span>`:"").filter(Boolean).join(" · ")||"no available overlay selected");
 if(hov==null){rcPlot();dhPlot()}}
function tabs(){$("rng").innerHTML=Object.keys(RG).map(k=>`<button data-r="${k}" class="${k==st.rng?"on":""}">${k}</button>`).join("");
 $("ov").innerHTML="<i>Overlay (z-score)</i>"+FN.map((k,j)=>`<button data-o="${j}" style="${st.on[j]?`background:${COL[j]};color:#000`:`color:${COL[j]}`}">${k.split(" ")[0]}</button>`).join("")+`<button data-i="1" class="${st.inv?"on":""}">Invert</button>`}
$("rng").onclick=e=>{if(e.target.dataset.r&&(D||e.target.dataset.r==='1D')){st.rng=e.target.dataset.r;hov=null;tabs();if(st.rng==='1D')loadDay();main()}};
$("ov").onclick=e=>{if(!D)return;const t=e.target.dataset;if(t.o!=null)st.on[+t.o]=!st.on[+t.o];else if(t.i)st.inv=!st.inv;else return;tabs();main()};
$("chart").onmousemove=e=>{if(!D)return;const b=e.target.getBoundingClientRect();hov=Math.max(0,Math.min(A.L-1,Math.round((e.clientX-b.left)/b.width*(A.L-1))));main()};
$("chart").onmouseleave=()=>{if(!D)return;hov=null;main()};
function rcPlot(){const st0=Math.max(A.n-A.L,W),S=FK.map((k,j)=>st.on[j]&&D[k]?{a:A.rd[j].slice(st0),c:COL[j]}:null).filter(Boolean),th=1.96/Math.sqrt(W);plot($("rcc"),S,{min:-1,max:1,hl:[0,th,-th]})}
function dhPlot(){if(!MODELS)return;const st0=Math.max(A.n-A.L,W+1),S=FK.map((k,j)=>st.on[j]?{a:A.sh.slice(st0).map(x=>x[j]),c:COL[j]}:null).filter(Boolean);plot($("dh"),S,{hl:[0]})}
function attr(){const n=A.n,f=ols(n-W,n),p=ols(Math.max(0,n-250),n),rg=(s,r2)=>{const m=Math.max(...s);return 1-r2>.9||m<.05?"Idiosyncratic":FN[s.indexOf(m)].split(" ")[0]+"-driven"},a=rg(f.sh,f.r2),b=rg(p.sh,p.r2),
 row=(k,x,y,c)=>`<tr><td>${k}</td>${[x,y].map(v=>`<td style="background:linear-gradient(90deg,${c}55 ${Math.max(0,v*100)}%,transparent ${Math.max(0,v*100)}%)">${(v*100).toFixed(0)}%</td>`).join("")}</tr>`;
 $("rg").textContent=a;$("rg").className="sig "+(a==b?"":"dn");
 $("rgd").textContent=(a==b?"Same as the available baseline. ":"Available baseline was "+b+": possible regime shift. ")+(a=="Idiosyncratic"?"Factors explain under 10% of variance, so look at central banks, ETF flows and geopolitics.":"")+" Model sample: "+n+" daily bars.";
 $("at").tBodies[0].innerHTML=FN.map((k,j)=>row(k,f.sh[j],p.sh[j],COL[j])).join("")+row("Unexplained",1-f.r2,1-p.r2,"#9aa0a0")}
const Phi=x=>{const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p},invn=q=>{const p=1-q,t=Math.sqrt(-2*Math.log(p));return t-(2.515517+.802853*t+.010328*t*t)/(1+1.432788*t+.189269*t*t+.001308*t*t*t)};
const pctl=(a,v)=>a.filter(x=>x<=v).length/a.length,rgl=sh=>{const r2=sh.reduce((a,b)=>a+b,0),m=Math.max(...sh);return 1-r2>.9||m<.05?"Idiosyncratic":FN[sh.indexOf(m)].split(" ")[0]+"-driven"};
function evs(source=D){const index=new Map(source.dates.map((d,i)=>[d,i]));return(META.events||[]).filter(e=>index.has(e.event_date)).map(e=>[index.get(e.event_date),e.kind])}
const spark=a=>{const r=a.filter((_,i)=>i%5==0),mn=Math.min(...r),mx=Math.max(...r);return`<svg width="110" height="28"><polyline points="${r.map((v,i)=>(i/(r.length-1)*110).toFixed(1)+","+(26-(v-mn)/(mx-mn||1)*24).toFixed(1)).join(" ")}" fill="none" stroke="#6cb4ff" stroke-width="1.5"/></svg>`};
function ctx(){$("cx").tBodies[0].innerHTML=[["ETF holdings (t)","etf",v=>v.toFixed(0)],["CFTC net long","cot",v=>(v/1000).toFixed(0)+"k"],["VIX","vix",v=>v.toFixed(1)]].map(([nm,k,f])=>{const a=D[k];if(!a){const last=META.lastBar?.[k];return`<tr><td>${nm}</td><td colspan="4" style="color:var(--mut)">${last?f(last.value)+" · "+esc(last.obs_date)+" · historical release evidence unavailable":"Unavailable"}</td></tr>`;}
 const n=a.length,c=a[n-1]-a[n-21];return`<tr><td>${nm}</td><td>${f(a[n-1])}</td><td class="${c>=0?"up":"dn"}">${c>=0?"+":""}${f(c)}</td><td>${(pctl(a,a[n-1])*100).toFixed(0)}th</td><td>${spark(a.slice(-250))}</td></tr>`}).join("")}
function evt(){const all_=$("er").value=="all",cur=$("rg").textContent,ev=evs(all_?CHART||D:D),G=all_?CHART_RET.G:A.G,bs=Math.sqrt(G.reduce((a,b)=>a+b*b,0)/G.length)*100;
 $("et").tBodies[0].innerHTML=["CPI","NFP","FOMC"].map(t=>{const x=ev.filter(([i,k])=>k==t&&i>0&&(all_||(i>W+1&&A.sh[i]&&rgl(A.sh[i])==cur))).map(([i])=>G[i]*100),n=x.length;
 if(n<3)return`<tr><td>${t}</td><td>${n}</td><td colspan="4" style="color:var(--mut)">Too few events</td></tr>`;
 const m=x.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(x.reduce((a,b)=>a+(b-m)**2,0)/(n-1))||1e-9,sig=Math.abs(m/sd*Math.sqrt(n))>1.96,md=[...x].sort((a,b)=>a-b)[Math.floor(n/2)],am=x.reduce((a,b)=>a+Math.abs(b),0)/n;
 return`<tr><td>${t}</td><td>${n}</td><td class="${sig?(m>0?"up":"dn"):""}" style="${sig?"":"color:#555"}">${m>=0?"+":""}${m.toFixed(2)}%</td><td>${md.toFixed(2)}%</td><td>${am.toFixed(2)}% <span style="color:var(--mut)">(${(am/bs).toFixed(1)}×)</span></td><td>${(x.filter(v=>v>0).length/n*100).toFixed(0)}%</td></tr>`}).join("")}
$("er").onchange=()=>{if(D)evt()};
$("cam").onclick=()=>{if(!D)return;const c=$("chart"),r=devicePixelRatio||1,H=64*r,o=document.createElement("canvas");o.width=c.width;o.height=c.height+H;const x=o.getContext("2d"),F=s=>`${s*r}px Inter,Arial,sans-serif`;
 x.fillStyle="#000";x.fillRect(0,0,o.width,o.height);x.fillStyle="#fff";x.font="600 "+F(20);x.fillText("XAU/USD  "+$("pv").textContent+"  ·  "+$("dt").textContent+"  ·  "+st.rng,16*r,28*r);
 x.font=F(11);x.fillStyle="#9aa0a0";x.textAlign="right";x.fillText($("src").textContent,o.width-16*r,28*r);x.textAlign="left";
 let lx=16*r;[["Gold","#00c805"],...FN.map((n,j)=>[n.split(" ")[0],COL[j]]).filter((_,j)=>st.on[j])].forEach(([n,cl])=>{x.fillStyle=cl;x.fillRect(lx,43*r,12*r,4*r);x.fillStyle="#9aa0a0";x.font=F(13);x.fillText(n,lx+18*r,49*r);lx+=(n.length*8+40)*r});
 x.drawImage(c,0,H);o.toBlob(b=>{const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="xauusd-"+$("dt").textContent+".png";a.click()})};
function votes(n){const dom=rgl(A.sh[n-1]),V=[],w=nm=>dom.startsWith(nm)?2:1,ma=D.gold.slice(n-50,n).reduce((a,b)=>a+b,0)/50,d20=a=>{const l=LAG[KEY.get(a)]||0;return a[n-1-l]-a[n-21-l]},push=(nm,v,why,wt=1)=>V.push({nm,v,why,wt}),px=a=>{const l=LAG[KEY.get(a)]||0;return pctl(a.slice(0,n-l),a[n-1-l])};
 push("Real yield",d20(D.ry)<0?1:-1,"20d "+(d20(D.ry)>=0?"+":"")+(d20(D.ry)*100).toFixed(0)+"bp",w("Real"));
 push("Dollar",d20(D.dxy)<0?1:-1,"DXY 20d "+(d20(D.dxy)/D.dxy[n-21]*100).toFixed(1)+"%",w("DXY"));
 push("Oil",d20(D.oil)>0?1:-1,"WTI 20d "+(d20(D.oil)/D.oil[n-21]*100).toFixed(1)+"% (inflation proxy)",w("Oil")*.5);
 if(D.etf)push("ETF flows",d20(D.etf)>0?1:-1,"holdings 20d "+(d20(D.etf)>=0?"+":"")+d20(D.etf).toFixed(0)+"t");
 if(D.cot){const p=px(D.cot);push("Positioning",p>.9?-1:p<.1?1:0,(p*100).toFixed(0)+"th pct (contrarian at extremes)")}
 if(D.vix){const p=px(D.vix);push("Risk (VIX)",p>.75?1:0,(p*100).toFixed(0)+"th pct",.5)}
 const z=A.z[n-1];push("Stretch",z>2?-1:z<-2?1:0,"residual z "+z.toFixed(2));push("Trend",D.gold[n-1]>ma?1:-1,"price vs 50d average");
 const tw=V.reduce((a,x)=>a+x.wt,0),sc=V.reduce((a,x)=>a+x.v*x.wt,0)/tw,lab=sc>.25?"Bullish":sc<-.25?"Bearish":"Neutral",sg=Math.sign(sc),act=V.filter(x=>x.v!=0),ag=act.filter(x=>x.v==sg).length;return{V,dom,sc,lab,sg,act,ag}}
function runBias(cm=1,d=0){const pnl=[],pos=[],g=[],cost=(+$("cb").value||0)/1e4*cm;let prev=0;for(let t=W+60+d;t<A.n;t++){const s=votes(t-d).sc,q=s>.25?1:s<-.25?-1:0;pnl.push(q*A.G[t]-cost*Math.abs(q-prev));pos.push(q);g.push(A.G[t]);prev=q}return{pnl,pos,g}}
function bias(){const{V,dom,sc,lab,sg,act,ag}=votes(A.n);
 $("bl").textContent=lab;$("bl").className="sig "+(lab=="Bullish"?"up":lab=="Bearish"?"dn":"");
 $("bs").textContent="Score "+(sc>=0?"+":"")+sc.toFixed(2)+" · "+(sg?ag+" of "+act.length+" active signals agree":"signals offset")+" · regime: "+dom;
 $("bv").innerHTML=V.map(x=>`<div class="f"><span>${x.nm} <small style="color:#666">${x.why}</small></span><b class="${x.v>0?"up":x.v<0?"dn":""}">${x.v>0?"▲":x.v<0?"▼":"–"}</b></div>`).join("");
 $("bf").textContent=lab=="Bullish"?"Chart filter: favor longs on pullbacks, skip counter-trend shorts.":lab=="Bearish"?"Chart filter: favor shorts on rallies, skip counter-trend longs.":"Chart filter: no directional edge from macro. Trade ranges or stand aside.";if(SYN)$("bf").textContent+=" Based on synthetic data."}
function alerts(){if(!MODELS){$("al").textContent="Some factor feeds are unavailable. Gold history remains usable.";return}const n=A.n,L=[],a=rgl(ols(n-W,n).sh),b=rgl(ols(Math.max(0,n-250),n).sh);
 if(a!=b)L.push(["dn","Regime change","Now "+a+", baseline "+b]);
 FN.forEach((nm,j)=>{const r=A.rd[j],sr=r.filter(v=>v!=null).sort((x,y)=>x-y),lo=sr[Math.floor(.1*sr.length)],hi=sr[Math.floor(.9*sr.length)];if(r.slice(-5).every(v=>v<lo||v>hi))L.push(["dn","Correlation break",nm+" 60d correlation outside its 10th to 90th range for 5 days"])});
 const z=A.z[n-1];if(Math.abs(z)>2)L.push(["wn","Stretched move","Residual z "+z.toFixed(2)]);
 const v5=votes(n-5).lab,v0=votes(n).lab;if(v5!=v0)L.push(["wn","Bias changed",v5+" to "+v0+" in 5 days"]);
 const age=Math.round((Date.now()-new Date(D.dates[n-1]+"T00:00:00Z"))/864e5);if(isFinite(age)&&age>4)L.push(["wn","Stale data","Last bar "+D.dates[n-1]+", "+age+" days old"]);
 ["etf","cot","vix"].forEach(k=>{if(!D[k])L.push(["wn","Missing series",k.toUpperCase()+" not loaded"])});
 $("al").innerHTML=L.length?L.map(([c,t,d])=>`<div class="f"><span><b style="color:var(--tx)">${t}</b> <small style="color:#666">${d}</small></span><b class="${c=="dn"?"dn":""}" style="${c=="wn"?"color:#f5a623":""}">●</b></div>`).join(""):`<div class="mut">No active alerts.</div>`}
function wire(lb){const imp=lb.startsWith("Imported");$("dw").tBodies[0].innerHTML=[["XAU/USD","gold"],["DXY","dxy"],["WTI oil","oil"],["Real yield (10y TIPS)","ry"],["ETF holdings","etf"],["CFTC net long","cot"],["VIX","vix"]].map(([nm,k])=>`<tr><td>${nm}</td><td title="${esc(META.lastBar?.[k]?.available_at||'')}">${esc(D[k]||META.lastBar?.[k]?META.lastBar?.[k]?.obs_date||D.dates[D.dates.length-1]:'—')}</td><td><input data-k="${k}" type="number" min="0" max="10" value="${LAG[k]}" style="width:46px;background:#161818;border:1px solid var(--line);border-radius:6px;padding:3px 6px;text-align:right;color:var(--tx)"></td><td class="${D[k]?"":"dn"}">${D[k]?(imp?"CSV":lb.startsWith("Live")?"Live · PIT aligned":"Provider history"):"Missing"}</td></tr>`).join("")}
$("dw").onchange=e=>{if(!D||!MODELS)return;const k=e.target.dataset.k;if(!k)return;LAG[k]=Math.max(0,+e.target.value||0);bias();alerts();backtest()};
function corrTable(){const n=A.n;$("ct").tBodies[0].innerHTML=FN.map((nm,j)=>{
 const cell=(c,w)=>{const sg=Math.abs(c)>1.96/Math.sqrt(w);return`<td title="${sg?"Significant at 95%":"Not distinguishable from zero"}" style="${sg?`background:rgba(${c>0?"0,200,5":"255,80,0"},${Math.min(.5,Math.abs(c)*.6).toFixed(2)})`:"color:#555"}">${c.toFixed(2)}</td>`},
 r=A.rc[j],last=cor(A.G,A.F[j],n-60,n),sr=[...r].sort((a,b)=>a-b),lo=sr[Math.floor(.1*sr.length)],hi=sr[Math.floor(.9*sr.length)],out=A.rd[j].slice(-5).every(v=>v<lo||v>hi),
 mn=Math.min(...r),mx=Math.max(...r),pts=r.map((v,i)=>(i/(r.length-1)*120).toFixed(1)+","+(26-(v-mn)/(mx-mn||1)*24).toFixed(1)).join(" ");
 return`<tr><td>${nm}</td>${cell(cor(A.G,A.F[j],n-30,n),30)}${cell(last,60)}${cell(cor(A.G,A.F[j],n-90,n),90)}<td><svg width="120" height="28"><polyline points="${pts}" fill="none" stroke="#6cb4ff" stroke-width="1.5"/></svg></td><td class="${out?"dn":""}">${out?"Outside range":"Normal"}</td></tr>`}).join("")}
function model(){const n=A.n,f=ols(n-W,n),z=A.z[n-1];
 $("fm").innerHTML=[["β DXY",f.b[0].toFixed(2)],["β Oil",f.b[1].toFixed(2)],["β Real yield / 10bp",(f.b[2]*.1*100).toFixed(2)+"%"],["R² (60d)",(f.r2*100).toFixed(0)+"%"],["Residual z today",(z>=0?"+":"")+z.toFixed(2)]].map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join("");}
const stat=(p,q)=>{const n=p.length,m=p.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(p.reduce((a,b)=>a+(b-m)**2,0)/(n-1))||1e-9,act=p.filter((x,i)=>q[i]!=0),w=act.filter(x=>x>0),l=act.filter(x=>x<=0),mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
 return{n,tr:act.length,win:act.length?w.length/act.length:0,b:w.length&&l.length?mean(w)/Math.abs(mean(l)):0,sh:m/sd*Math.sqrt(252),t:m/sd*Math.sqrt(n),m}};
function run(thr,cm=1,d=0){const pnl=[],pos=[],cost=(+$("cb").value||0)/1e4*cm;let prev=0;for(let t=W+2+d;t<A.n;t++){const z=A.z[t-1-d],q=Math.abs(z)>thr?-Math.sign(z):0;pnl.push(q*A.G[t]-cost*Math.abs(q-prev));pos.push(q);prev=q}return{pnl,pos}}
function backtest(persist=true){if(!D)return;if(!MODELS||META.researchEligible!==true){
 $("tsv").textContent=$("spl").value+"%";$("bt").tBodies[0].innerHTML='<tr><td colspan="3">Strict point-in-time research unavailable for this downloaded history.</td></tr>';
 $("sx").tBodies[0].innerHTML='';$("vd").textContent='Historical charts are usable. Original-vintage price evidence is required before reporting verified research results.';$("bx").textContent='Descriptive daily bias; strategy not validated.';$("tl").textContent='No backtest or trial is recorded from unverified history.';
 if(MODELS&&Number.isFinite(A.z[A.n-1])){const z=A.z[A.n-1];$("sg").textContent=Math.abs(z)>2?(z>0?'Short gold':'Long gold'):'Flat';$("sgd").textContent='Descriptive residual z '+z.toFixed(2)+' · unvalidated fade rule';}else{$("sg").textContent='Unavailable';$("sgd").textContent='Needs a complete factor sample.';}return;}const sp=+$("spl").value/100;$("tsv").textContent=Math.round(sp*100)+"%";let best=null;const bd=+$("dl").value||0;
 ($("bm").value=="bias"?[null]:THR).forEach(th=>{const r=th==null?runBias(1,bd):run(th,1,bd),c=Math.floor(r.pnl.length*sp),tr=stat(r.pnl.slice(0,c),r.pos.slice(0,c));if(!best||tr.sh>best.tr.sh)best={th,r,c,tr}});
 const te=stat(best.r.pnl.slice(best.c),best.r.pos.slice(best.c));BT={...best,te};
 const ev=(cm,d)=>{const r=best.th==null?runBias(cm,d):run(best.th,cm,d),c=Math.floor(r.pnl.length*sp);return stat(r.pnl.slice(c),r.pos.slice(c))},f2=v=>isFinite(v)?v.toFixed(2):"n/a";
 $("sx").tBodies[0].innerHTML=[["Base",1,bd],["Costs ×3",3,bd],["+1 day late",1,bd+1],["Both",3,bd+1]].map(([nm,cm,d])=>{const s=ev(cm,d);return`<tr><td>${nm}</td><td class="${s.sh>0?"up":"dn"}">${f2(s.sh)}</td><td>${f2(s.t)}</td></tr>`}).join("");
 const key=[D.dates.length,D.gold[D.gold.length-1].toFixed(2),$("bm").value,$("spl").value,$("cb").value,bd,JSON.stringify(LAG)].join("|");TRI[key]=$("bm").value=="bias"?1:THR.length;
 const N=Math.max(PERSISTED||0,Object.values(TRI).reduce((a,b)=>a+b,0)),T=te.n,sr=te.sh/Math.sqrt(252),gm=.5772,sr0=N>1?(1/Math.sqrt(T))*((1-gm)*invn(1-1/N)+gm*invn(1-1/(N*Math.E))):0,dsr=Phi((sr-sr0)*Math.sqrt(T-1));
 $("tl").innerHTML=(PERSISTED===null?'Session candidates (persistence unavailable): ':'Persistent candidates: ')+'<b>'+N+'</b> · Deflated Sharpe (normal/iid approximation): <b>'+f2(dsr)+'</b>. Correlated trials and non-normal returns require further adjustment.';
 if(persist&&FINGERPRINT){const p=best.r.pnl.slice(best.c),mean=te.m,sd=Math.sqrt(p.reduce((s,x)=>s+(x-mean)**2,0)/p.length)||1;recorder.record({config:{mode:$("bm").value,split:sp,costBps:+$("cb").value,delay:bd,lags:{...LAG},thresholds:THR},dataFingerprint:FINGERPRINT,results:{train:best.tr,test:te,threshold:best.th},deflatedSharpeInputs:{sampleSize:T,dailySharpe:sr,candidateCountAtEvaluation:N,skew:p.reduce((s,x)=>s+((x-mean)/sd)**3,0)/p.length,kurtosis:p.reduce((s,x)=>s+((x-mean)/sd)**4,0)/p.length,benchmark:sr0,approximation:'normal iid; trial Sharpe variance assumed 1/T; candidates correlated'},candidateCount:$("bm").value==='bias'?1:THR.length})}
 const row=(k,f)=>`<tr><td>${k}</td><td>${f(best.tr)}</td><td>${f(te)}</td></tr>`;
 $("bt").tBodies[0].innerHTML=row(best.th==null?"Rule":"Threshold (z)",()=>best.th==null?"Bias ±0.25":best.th.toFixed(1))+row("Active days",s=>s.tr)+row("Win %",s=>(s.win*100).toFixed(0)+"%")+row("Avg win ÷ avg loss",s=>s.b.toFixed(2))+row("Sharpe (ann.)",s=>s.sh.toFixed(2))+row("t-stat",s=>s.t.toFixed(2))+(best.r.g?(()=>{const sp2=(a,b)=>{const u=[],d=[];a.forEach((x,i)=>{if(b[i]>0)u.push(x);if(b[i]<0)d.push(x)});const m=q=>q.reduce((s,x)=>s+x,0)/(q.length||1);return((m(u)-m(d))*1e4).toFixed(1)},c=best.c,g=best.r.g,p=best.r.pos;return`<tr><td>Bull − bear (bps/day)</td><td>${sp2(g.slice(0,c),p.slice(0,c))}</td><td>${sp2(g.slice(c),p.slice(c))}</td></tr>`})():"");
 let c=0;const eq=best.r.pnl.map(v=>(c+=v)*100);plot($("eq"),[{a:eq,c:eq[eq.length-1]>=0?"#00c805":"#ff5000"}],{hl:[0],vl:best.c});
 $("vd").innerHTML=te.tr<100?`<span class="dn">Too few trades to judge (${te.tr} active test days, need 100).</span> Any t-stat here is noise.`:te.m>0&&te.t>2?`<span class="up">Survives out-of-sample (t = ${te.t.toFixed(2)}).</span> One sample only: re-test on real data.${best.th==null?" Weights are fixed placeholders, nothing was fitted.":" Threshold was chosen on train only."}`:`<span class="dn">No edge out-of-sample (t = ${te.t.toFixed(2)}).</span> Treat as noise until it passes t > 2 on real data.${best.th==null?" Weights are fixed placeholders, nothing was fitted.":" Threshold was chosen on train only."}`;
 if($("bm").value=="bias")$("bx").innerHTML=te.tr<100?"Too few test trades ("+te.tr+") to judge. Unvalidated.":te.m>0&&te.t>2?"Out-of-sample: passes (t = "+te.t.toFixed(2)+"). Re-test on real data.":"Out-of-sample: not significant (t = "+te.t.toFixed(2)+"). Treat as unvalidated.";else $("bx").textContent="";
 if(SYN){$("vd").innerHTML="<b>Synthetic data, not a market result.</b> "+$("vd").innerHTML;if($("bm").value=="bias")$("bx").innerHTML="Synthetic data. "+$("bx").innerHTML}
 const z=A.z[A.n-1],thS=best.th??2,on=Math.abs(z)>thS;$("sg").className="sig "+(on?(z>0?"dn":"up"):"");$("sg").textContent=on?(z>0?"Short gold":"Long gold"):"Flat";
 $("sgd").textContent="Residual z "+z.toFixed(2)+" vs threshold ±"+thS.toFixed(1)+(on?" (fade the unexplained move)":"")}
["spl","cb","bm","dl"].forEach(i=>$(i).oninput=backtest);
function all(label){const C=CHART||D;CHART_RET={G:[0],F:[[0],[0],[0]]};for(let i=1;i<C.gold.length;i++){CHART_RET.G.push(Math.log(C.gold[i]/C.gold[i-1]));CHART_RET.F[0].push(C.dxy&&C.dxy[i]>0&&C.dxy[i-1]>0?Math.log(C.dxy[i]/C.dxy[i-1]):NaN);CHART_RET.F[1].push(C.oil&&C.oil[i]>0&&C.oil[i-1]>0?Math.log(C.oil[i]/C.oil[i-1]):NaN);CHART_RET.F[2].push(C.ry&&Number.isFinite(C.ry[i])&&Number.isFinite(C.ry[i-1])?C.ry[i]-C.ry[i-1]:NaN);}$("at").tHead.rows[0].cells[2].textContent='Baseline ('+Math.min(250,D.gold.length)+'d)';MODELS=D.gold.length>=91&&FK.every(k=>D[k]);calc();tabs();main();KEY=new Map(["gold","dxy","oil","ry","etf","cot","vix"].filter(k=>D[k]).map(k=>[D[k],k]));SYN=false;corrTable();if(MODELS){model();attr();bias()}else{$("rg").textContent='Unavailable';$("rgd").textContent='Complete factor history is required.';$("at").tBodies[0].innerHTML='<tr><td colspan="3">Some factor history is unavailable.</td></tr>';$("fm").textContent='Complete factor history is required.';$("bl").textContent='Unavailable';$("bs").textContent='Insufficient factor history';$("bv").textContent='';$("bf").textContent='Gold price history remains usable.';}ctx();evt();wire(label);backtest();alerts();$("src").className="bdg";$("src").textContent=''}
$("nw").textContent='Refresh';$("nw").onclick=()=>{refresh();pollQuote();if(st.rng==='1D')loadDay(true)};
$("fi").onchange=e=>{const f=e.target.files[0];e.target.value="";if(!f)return;f.text().then(t=>{const L=t.trim().split(/\r?\n/),h=L[0].toLowerCase().split(",").map(x=>x.trim()),ix=re=>h.findIndex(x=>re.test(x)),c={d:ix(/date/),g:ix(/gold|xau/),x:ix(/dxy|dollar/),o:ix(/oil|wti/),y:ix(/real|tips|yield|ry/)},bad=m=>{$("src").className="bdg e";$("src").textContent=m};
 if(Object.values(c).some(v=>v<0))return bad("CSV needs columns: date, gold, dxy, oil, realyield");
 const R=L.slice(1).map(l=>l.split(",")).filter(r=>[c.g,c.x,c.o,c.y].every(k=>isFinite(parseFloat(r[k]))));
 if(R.length<200)return bad("Need at least 200 valid rows");
 D={dates:R.map(r=>r[c.d].trim()),gold:R.map(r=>+r[c.g]),dxy:R.map(r=>+r[c.x]),oil:R.map(r=>+r[c.o]),ry:R.map(r=>+r[c.y])};[["etf",/etf/],["cot",/cot|position/],["vix",/vix/]].forEach(([k,re])=>{const q=ix(re);D[k]=q>=0?R.map(r=>+r[q]):null});CHART=null;META={researchEligible:false};FINGERPRINT='';digest(D).then(h=>{FINGERPRINT=h;all("Imported CSV · "+R.length+" days")})})};
const resize=()=>{if(!D)return;main();backtest(false);plotZ()};addEventListener("resize",resize);
function plotZ(){if(!MODELS)return;const z=A.z.slice(-250);plot($("rz"),[{a:z,c:"#6cb4ff"}],{min:-4,max:4,hl:[BT.th||2,-(BT.th||2),0]})}
function showQuote(){if(hov!=null)return;
 if(QUOTE){const old=Date.now()-Date.parse(QUOTE.time)>120000;$("pv").textContent=fm(QUOTE.price);$("dt").textContent=(quoteFailed?'Last cached quote · ':QUOTE.status==='not_tradeable'?'Not tradeable · ':old||QUOTE.status==='stale'?'Stale quote · ':'Current quote · ')+'Bid/ask mid · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(QUOTE.time));$("dt").title=QUOTE.time+' · '+QUOTE.basis;}
 else if(!D){$("pv").textContent='—';$("dt").textContent=quoteFailed?'Current quote unavailable':'Connecting…';}
 else if(quoteFailed)$("dt").textContent=D.dates.at(-1)+' · completed daily midpoint · current quote unavailable';
}
async function pollQuote(){if(disposed||quoteBusy||!api.quote)return;quoteBusy=true;try{const q=await api.quote();if(disposed)return;QUOTE=q;quoteFailed=false;}catch{quoteFailed=true;}finally{quoteBusy=false;if(!disposed)showQuote();}}
async function refresh(){if(refreshing||disposed)return;refreshing=true;$("nw").disabled=true;$("src").textContent=D?'Refreshing history…':'Loading provider history…';
 try{const r=await api.load();const fingerprint=await digest(r.data);if(disposed)return;META=r.meta||{};CHART={...r.data,...META.chartFactors};D=META.analysisData||r.data;FINGERPRINT=fingerprint;LAG={...LAG,...META.lagDefaults};all(r.label+(D.dates.length<CHART.dates.length?' · model '+D.dates.length+' bars':''));plotZ();}
 catch{if(disposed)return;$("src").textContent=D?'Last cached history · refresh unavailable':'Market history unavailable · retry Refresh';$("src").className='bdg e';if(!D){$("al").textContent='History unavailable. Current quote is independent.';$("bl").textContent='Unavailable';$("sg").textContent='Unavailable';$("vd").textContent='Research unavailable until eligible history is present.';}showQuote();}
 finally{refreshing=false;if(!disposed)$("nw").disabled=false;}}
function dayMain(){const points=DAY?.points||[];A.L=points.length;
 if(!points.length){const c=$("chart");c.getContext('2d').clearRect(0,0,c.width,c.height);$("d1").textContent='';$("d2").textContent=dayFailed?'Intraday history unavailable · choose another range or Refresh':'Loading 15-minute gold candles…';showQuote();return;}
 const g=points.map(p=>p.price),i=hov??g.length-1,delta=g[i]-g[0];plot($("chart"),[{a:g,c:g.at(-1)>=g[0]?'#00c805':'#ff5000'}],{h:hov});
 $("pv").textContent=fm(g[i]);$("dt").textContent=points[i].time+' · completed M15 midpoint';if(hov==null)showQuote();
 $("d1").className='d '+(delta>=0?'up':'dn');$("d1").textContent=(delta>=0?'▲ ':'▼ ')+fm(Math.abs(delta))+' ('+Math.abs(delta/g[0]*100).toFixed(2)+'%) 1D';
 $("d2").textContent=(dayFailed?'Last cached intraday history · ':'')+'15-minute completed candles · daily factor overlays unavailable';}
 async function loadDay(force=false){if(disposed||dayBusy||!api.intraday||(!force&&DAY&&Date.now()-dayFetched<60000))return;dayBusy=true;
 try{const r=await api.intraday();if(disposed)return;DAY=r;dayFetched=Date.now();dayFailed=false;}catch{dayFailed=true;}finally{dayBusy=false;if(!disposed&&st.rng==='1D')dayMain();}}
 showQuote();tabs();refresh();pollQuote();const timer=setInterval(()=>{if(!document.hidden){pollQuote();if(st.rng==='1D')loadDay()}},15000);
return()=>{disposed=true;clearInterval(timer);removeEventListener('resize',resize);};
}
