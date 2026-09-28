'use strict';
// A single rounded surface: each cube face maps onto a rounded-box mesh.
const DiceMesh=(()=>{
 const radius=.25,core=1-radius,patches=[],dots=[],panels=[];
 const faces=[[[0,0,1],[1,0,0],[0,1,0],1],[[1,0,0],[0,0,-1],[0,1,0],2],[[0,-1,0],[1,0,0],[0,0,1],3],[[0,1,0],[1,0,0],[0,0,-1],4],[[-1,0,0],[0,0,1],[0,1,0],5],[[0,0,-1],[-1,0,0],[0,1,0],6]];
 const pips={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
 const raw=(n,u,v,a,b)=>n.map((x,i)=>x+u[i]*a+v[i]*b);
 function rounded(v){const q=v.map(x=>Math.max(-core,Math.min(core,x))),d=v.map((x,i)=>x-q[i]),l=Math.hypot(...d);return q.map((x,i)=>x+radius*d[i]/l);}
 const grid=[-1,-.96,-.90,-.83,-.75,0,.75,.83,.90,.96,1];
 for(const [n,u,v,value] of faces){for(let i=0;i<grid.length-1;i++)for(let j=0;j<grid.length-1;j++){const points=[[grid[i],grid[j]],[grid[i+1],grid[j]],[grid[i+1],grid[j+1]],[grid[i],grid[j+1]]].map(([a,b])=>rounded(raw(n,u,v,a,b)));patches.push({points,value});}
 const panel=[];for(let k=0;k<4;k++){const cx=[.53,-.53,-.53,.53][k],cy=[.53,.53,-.53,-.53][k];for(let j=0;j<=8;j++){const t=(k*90+j*90/8)*Math.PI/180;panel.push(raw(n,u,v,cx+Math.cos(t)*.15,cy+Math.sin(t)*.15).map((x,i)=>x+n[i]*.002));}}panels.push({points:panel,normal:n});
 for(const [a,b] of pips[value]){const points=Array.from({length:28},(_,i)=>{const t=i*Math.PI*2/28;return raw(n,u,v,a*.43+Math.cos(t)*.15,b*.43+Math.sin(t)*.15).map((x,k)=>x+n[k]*.003)});dots.push({points,normal:n,value});}}
 return {patches,dots,panels};
})();
function diceRotate(v,axis,degrees){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x,y,z]=v;return axis==='x'?[x,y*c-z*s,y*s+z*c]:axis==='y'?[x*c+z*s,y,-x*s+z*c]:[x*c-y*s,x*s+y*c,z];}
function drawDice(canvas,angles,pose){const ctx=canvas.getContext('2d'),ratio=Math.min(devicePixelRatio||1,2),size=canvas.clientWidth||150;if(canvas.width!==Math.round(size*ratio)){canvas.width=canvas.height=Math.round(size*ratio)}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,size,size);const tx=-35.26438968*pose.tilt,tz=45*pose.tilt,support=.75*diceSupport(tx,tz,...angles)+.25;
 const rotate=v=>{v=diceRotate(v,'y',angles[1]);v=diceRotate(v,'x',angles[0]);v=diceRotate(v,'z',tz);v=diceRotate(v,'x',tx);return diceRotate(v,'y',pose.spin)};
 const yaw=Number(canvas.dataset?.yaw??-22);const camera=v=>diceRotate(diceRotate(v,'y',yaw),'x',-24);
 const world=v=>{v=rotate(v);v[1]+=1-support;return camera(v)};
 const project=v=>{const s=size*.255*7/(7-v[2]);return [size/2+v[0]*s,size*.53+v[1]*s]};
 const polygons=[];
 for(const patch of DiceMesh.patches){const pts=patch.points.map(world),middle=patch.points[0].map((_,i)=>patch.points.reduce((s,v)=>s+v[i],0)/4),q=middle.map(x=>Math.max(-.75,Math.min(.75,x))),normal=camera(rotate(middle.map((x,i)=>x-q[i])));if(normal[2]<-.005)continue;polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/4,normal,face:patch.value});}
 for(const dot of DiceMesh.dots){if(camera(rotate(dot.normal))[2]<=0)continue;const pts=dot.points.map(world);polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/pts.length,pip:true});}
 // The same rounded mesh keeps the roll and final pip geometry exact.
 const outline=diceHull(polygons.filter(p=>!p.pip).flatMap(p=>p.pts.map(project)));
 const trace=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
 trace(outline);ctx.save();ctx.shadowColor='#7cdcff';ctx.shadowBlur=size*.035;ctx.strokeStyle='#9eeaff';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();ctx.restore();
 polygons.sort((a,b)=>(Number(!!a.pip)-Number(!!b.pip))||a.z-b.z);
 for(const p of polygons){const pts=p.pts.map(project);trace(pts);
  if(p.pip){
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,r=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/2;
   const g=ctx.createRadialGradient(x-r*.25,y-r*.35,r*.1,x,y,r);g.addColorStop(0,'#142b72');g.addColorStop(.65,'#2543a3');g.addColorStop(1,'#698de9');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#b7d8ffb0';ctx.lineWidth=.8;ctx.stroke();
  }else{
   const len=Math.hypot(...p.normal)||1,n=p.normal.map(v=>v/len),light=Math.max(0,n[0]*-.4+n[1]*-.6+n[2]*.7);
   const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
   const top=mix([93,140,231],[221,250,255],light),bottom=mix([113,92,216],[132,214,255],light);
   const g=ctx.createLinearGradient(size*.22,size*.1,size*.8,size*.88);g.addColorStop(0,`rgb(${top})`);g.addColorStop(.5,`rgb(${mix(top,bottom,.35)})`);g.addColorStop(1,`rgb(${bottom})`);
   ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=g;ctx.lineWidth=.6;ctx.stroke();
  }
 }
 // A broad, quiet glass reflection, confined to the actual silhouette.
 ctx.save();trace(outline);ctx.clip();const sheen=ctx.createLinearGradient(0,size*.1,size,size*.75);sheen.addColorStop(0,'#ffffff00');sheen.addColorStop(.29,'#ffffff00');sheen.addColorStop(.30,'#ffffff25');sheen.addColorStop(.43,'#ffffff0a');sheen.addColorStop(.44,'#ffffff00');ctx.fillStyle=sheen;ctx.fillRect(0,0,size,size);ctx.restore();
 trace(outline);ctx.strokeStyle='#c6f1ffb0';ctx.lineWidth=1.15;ctx.stroke();
}

function diceHull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower=[],upper=[];for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}lower.pop();upper.pop();return lower.concat(upper)}
