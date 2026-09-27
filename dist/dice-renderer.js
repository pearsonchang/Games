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
 for(const [a,b] of pips[value]){const points=Array.from({length:6},(_,i)=>{const t=(i*60-30)*Math.PI/180;return raw(n,u,v,a*.43+Math.cos(t)*.14,b*.43+Math.sin(t)*.14).map((x,k)=>x+n[k]*.003)});dots.push({points,normal:n,value});}}
 return {patches,dots,panels};
})();
function diceRotate(v,axis,degrees){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x,y,z]=v;return axis==='x'?[x,y*c-z*s,y*s+z*c]:axis==='y'?[x*c+z*s,y,-x*s+z*c]:[x*c-y*s,x*s+y*c,z];}
function drawDice(canvas,angles,pose){const ctx=canvas.getContext('2d'),ratio=Math.min(devicePixelRatio||1,2),size=canvas.clientWidth||150;if(canvas.width!==Math.round(size*ratio)){canvas.width=canvas.height=Math.round(size*ratio)}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,size,size);const tx=-35.26438968*pose.tilt,tz=45*pose.tilt,support=.75*diceSupport(tx,tz,...angles)+.25;
 const rotate=v=>{v=diceRotate(v,'y',angles[1]);v=diceRotate(v,'x',angles[0]);v=diceRotate(v,'z',tz);v=diceRotate(v,'x',tx);return diceRotate(v,'y',pose.spin)};
 const yaw=Number(canvas.dataset?.yaw??-22);const camera=v=>diceRotate(diceRotate(v,'y',yaw),'x',-24);
 const world=v=>{v=rotate(v);v[1]+=1-support;return camera(v)};
 const project=v=>{const s=size*.255*7/(7-v[2]);return [size/2+v[0]*s,size*.53+v[1]*s]};
 const polygons=[];
 for(const patch of DiceMesh.patches){const pts=patch.points.map(world),middle=patch.points[0].map((_,i)=>patch.points.reduce((s,v)=>s+v[i],0)/4),q=middle.map(x=>Math.max(-.75,Math.min(.75,x))),normal=camera(rotate(middle.map((x,i)=>x-q[i])));if(normal[2]<-.005)continue;polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/4,color:['','#62666c','#4a4e54','#71757b','#42464c','#595d63','#51555b'][patch.value]});}
 for(const panel of DiceMesh.panels){if(camera(rotate(panel.normal))[2]<=0)continue;const pts=panel.points.map(world);polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/pts.length,color:'#292c31',pip:true,panel:true});}
 for(const dot of DiceMesh.dots){if(camera(rotate(dot.normal))[2]<=0)continue;const pts=dot.points.map(world);polygons.push({pts,z:pts.reduce((s,v)=>s+v[2],0)/pts.length,color:dot.value===1?'#ffb327':'#f4f0e8',pip:true});}
 polygons.sort((a,b)=>((a.panel?1:a.pip?2:0)-(b.panel?1:b.pip?2:0))||a.z-b.z);for(const p of polygons){const pts=p.pts.map(project);ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=p.color;ctx.fill();if(p.panel){ctx.strokeStyle='#82868b';ctx.lineWidth=1.1;ctx.stroke();}if(!p.pip){ctx.strokeStyle=p.color;ctx.lineWidth=.65;ctx.stroke();}}
}
