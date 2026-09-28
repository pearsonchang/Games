'use strict';
// A single rounded surface: each cube face maps onto a rounded-box mesh.
const DiceMesh=(()=>{
 const radius=.25,core=1-radius,patches=[],dots=[];
 const faces=[[[0,0,1],[1,0,0],[0,1,0],1],[[1,0,0],[0,0,-1],[0,1,0],2],[[0,-1,0],[1,0,0],[0,0,1],3],[[0,1,0],[1,0,0],[0,0,-1],4],[[-1,0,0],[0,0,1],[0,1,0],5],[[0,0,-1],[-1,0,0],[0,1,0],6]];
 const pips={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
 const raw=(n,u,v,a,b)=>n.map((x,i)=>x+u[i]*a+v[i]*b);
 function rounded(v){const q=v.map(x=>Math.max(-core,Math.min(core,x))),d=v.map((x,i)=>x-q[i]),l=Math.hypot(...d);return q.map((x,i)=>x+radius*d[i]/l);}
 const grid=[-1,-.96,-.90,-.83,-.75,0,.75,.83,.90,.96,1];
 for(const [n,u,v,value] of faces){for(let i=0;i<grid.length-1;i++)for(let j=0;j<grid.length-1;j++){const points=[[grid[i],grid[j]],[grid[i+1],grid[j]],[grid[i+1],grid[j+1]],[grid[i],grid[j+1]]].map(([a,b])=>rounded(raw(n,u,v,a,b)));patches.push({points,value});}
 for(const [a,b] of pips[value]){const points=Array.from({length:28},(_,i)=>{const t=i*Math.PI*2/28;return raw(n,u,v,a*.43+Math.cos(t)*.18,b*.43+Math.sin(t)*.18).map((x,k)=>x+n[k]*.003)});dots.push({points,normal:n,value});}}
 return {patches,dots};
})();
function diceRotate(v,axis,degrees){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x,y,z]=v;return axis==='x'?[x,y*c-z*s,y*s+z*c]:axis==='y'?[x*c+z*s,y,-x*s+z*c]:[x*c-y*s,x*s+y*c,z];}
function drawDice(canvas,angles,pose){const ctx=canvas.getContext('2d'),ratio=Math.min(devicePixelRatio||1,2),size=canvas.clientWidth||150;if(canvas.width!==Math.round(size*ratio)){canvas.width=canvas.height=Math.round(size*ratio)}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,size,size);const tx=-35.26438968*pose.tilt,tz=45*pose.tilt,support=.75*diceSupport(tx,tz,...angles)+.25;
 const rotate=v=>{v=diceRotate(v,'y',angles[1]);v=diceRotate(v,'x',angles[0]);v=diceRotate(v,'z',tz);v=diceRotate(v,'x',tx);return diceRotate(v,'y',pose.spin)};
 const yaw=Number(canvas.dataset?.yaw??-22);const camera=v=>diceRotate(diceRotate(v,'y',yaw),'x',-24);
 const world=v=>{v=rotate(v);v[1]+=1-support;return camera(v)};
 const project=v=>{const s=size*.255*7/(7-v[2]);return [size/2+v[0]*s,size*.53+v[1]*s]};
 // Split orbit passes wrap behind and in front of the animated cube.
 const energy=Math.min(1,pose.tilt),phase=pose.spin*Math.PI/180;
 const orbit=front=>{if(energy<.01)return;ctx.save();ctx.translate(size/2,size*.54);ctx.rotate(-.22);ctx.globalAlpha=energy;ctx.lineCap='round';for(let k=0;k<2;k++){const a=phase*(k?-.5:.7)+k*2.4;ctx.strokeStyle=k?'#a79bff':'#71e5ff';ctx.lineWidth=k?1.5:2.6;ctx.shadowColor=k?'#8b76ff':'#5bdfff';ctx.shadowBlur=7;ctx.beginPath();ctx.ellipse(0,0,size*(.40-k*.025),size*(.14+k*.035),0,front?0:Math.PI,front?Math.PI:Math.PI*2);ctx.stroke();ctx.strokeStyle='#e0fcff';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,size*.405,size*.145,0,a,a+.72);ctx.stroke();}ctx.restore();};
 orbit(false);
 const polygons=[];
 for(const patch of DiceMesh.patches){const pts=patch.points.map(world),middle=patch.points[0].map((_,i)=>patch.points.reduce((s,v)=>s+v[i],0)/4),q=middle.map(x=>Math.max(-.75,Math.min(.75,x))),normal=camera(rotate(middle.map((x,i)=>x-q[i])));if(normal[2]<-.005)continue;polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/4,normal,face:patch.value});}
 for(const dot of DiceMesh.dots){if(camera(rotate(dot.normal))[2]<=0)continue;const pts=dot.points.map(world);polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/pts.length,pip:true});}
 // The same rounded mesh keeps the roll and final pip geometry exact.
 const outline=diceHull(polygons.filter(p=>!p.pip).flatMap(p=>p.pts.map(project)));
 const trace=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
 ctx.lineJoin='round';
 polygons.sort((a,b)=>(Number(!!a.pip)-Number(!!b.pip))||a.z-b.z);
 for(const p of polygons){const pts=p.pts.map(project);trace(pts);
  if(p.pip){
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,r=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/2;
   // Dark ceramic inlays: shallow recess, without glass rims or specular shine.
   const g=ctx.createLinearGradient(x,y-r,x,y+r);g.addColorStop(0,'#182641');g.addColorStop(1,'#263653');ctx.fillStyle=g;ctx.fill();const lip=ctx.createLinearGradient(x,y-r,x,y+r);lip.addColorStop(0,'#10223f50');lip.addColorStop(1,'#c9d5e550');ctx.strokeStyle=lip;ctx.lineWidth=.55;ctx.stroke();
  }else{
   // Broad diffuse lighting on one continuous matte ceramic shell.
   const len=Math.hypot(...p.normal)||1,n=p.normal.map(v=>v/len),up=Math.max(0,-n[1]),side=Math.abs(n[0]);
   const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
   let base=mix([186,207,231],[139,152,193],side*.82);base=mix(base,[246,243,237],Math.pow(up,.85)*.98);
   const shade=.96+Math.max(0,-n[0]*.3-n[1]*.65+n[2]*.55)*.04;
   base=base.map(v=>Math.round(v*shade));const bottom=base.map(v=>Math.max(0,v-6));
   const g=ctx.createLinearGradient(0,size*.15,size*.2,size*.9);g.addColorStop(0,`rgb(${base})`);g.addColorStop(1,`rgb(${bottom})`);ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=g;ctx.lineWidth=.65;ctx.stroke();
  }
 }
 orbit(true);
}

function diceHull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower=[],upper=[];for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}lower.pop();upper.pop();return lower.concat(upper)}
