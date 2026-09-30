'use strict';
// A single rounded surface: each cube face maps onto a rounded-box mesh.
const DiceMesh=(()=>{
 const radius=.34,core=1-radius,patches=[],dots=[];
 const faces=[[[0,0,1],[1,0,0],[0,1,0],1],[[1,0,0],[0,0,-1],[0,1,0],2],[[0,-1,0],[1,0,0],[0,0,1],3],[[0,1,0],[1,0,0],[0,0,-1],4],[[-1,0,0],[0,0,1],[0,1,0],5],[[0,0,-1],[-1,0,0],[0,1,0],6]];
 const pips={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
 const raw=(n,u,v,a,b,depth=0)=>n.map((x,i)=>x*(1-depth)+u[i]*a+v[i]*b);
 const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
 function rounded(v){const q=v.map(x=>Math.max(-core,Math.min(core,x))),d=unit(v.map((x,i)=>x-q[i]));return q.map((x,i)=>x+radius*d[i]);}
 const grid=[-1,-.97,-.92,-.84,-.74,-core,0,core,.74,.84,.92,.97,1];
 for(const [n,u,v,value] of faces){
  for(let i=0;i<grid.length-1;i++)for(let j=0;j<grid.length-1;j++){
   const points=[[grid[i],grid[j]],[grid[i+1],grid[j]],[grid[i+1],grid[j+1]],[grid[i],grid[j+1]]].map(([a,b])=>rounded(raw(n,u,v,a,b)));
   const middle=points[0].map((_,k)=>points.reduce((sum,p)=>sum+p[k],0)/4),normal=unit(middle.map(x=>x-Math.max(-core,Math.min(core,x))));
   const bevel=1-normal.reduce((sum,x,k)=>sum+x*n[k],0);
   patches.push({points,normal,faceNormal:n,bevel,value});
  }
  for(const [a,b] of pips[value]){
   const circle=(r,depth)=>Array.from({length:32},(_,i)=>{const t=i*Math.PI*2/32;return raw(n,u,v,a*.44+Math.cos(t)*r,b*.44+Math.sin(t)*r,depth)});
   dots.push({outer:circle(.18,-.001),inner:circle(.155,.04),normal:n,value});
  }
 }
 return {radius,core,patches,dots};
})();
function diceRotate(v,axis,degrees){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x,y,z]=v;return axis==='x'?[x,y*c-z*s,y*s+z*c]:axis==='y'?[x*c+z*s,y,-x*s+z*c]:[x*c-y*s,x*s+y*c,z];}
function drawDice(canvas,angles,pose){const ctx=canvas.getContext('2d'),ratio=Math.min(devicePixelRatio||1,2),size=canvas.clientWidth||150;if(canvas.width!==Math.round(size*ratio)){canvas.width=canvas.height=Math.round(size*ratio)}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,size,size);const tx=-35.26438968*pose.tilt,tz=45*pose.tilt,support=DiceMesh.core*diceSupport(tx,tz,...angles)+DiceMesh.radius;
 const rotate=v=>{v=diceRotate(v,'y',angles[1]);v=diceRotate(v,'x',angles[0]);v=diceRotate(v,'z',tz);v=diceRotate(v,'x',tx);return diceRotate(v,'y',pose.spin)};
 const yaw=Number(canvas.dataset?.yaw??-32);const camera=v=>diceRotate(diceRotate(v,'y',yaw),'x',-30);
 const world=v=>{v=rotate(v);v[1]+=1-support;return camera(v)};
 const project=v=>{const s=size*.26*12/(12-v[2]);return [size/2+v[0]*s,size*.53+v[1]*s]};
 // Split orbit passes wrap behind and in front of the animated cube.
 const energy=Math.min(1,pose.tilt),phase=pose.spin*Math.PI/180;
 const orbit=front=>{if(energy<.01)return;ctx.save();ctx.translate(size/2,size*.54);ctx.rotate(-.22);ctx.globalAlpha=energy;ctx.lineCap='round';for(let k=0;k<2;k++){const a=phase*(k?-.5:.7)+k*2.4;ctx.strokeStyle=k?'#a79bff':'#71e5ff';ctx.lineWidth=k?1.5:2.6;ctx.shadowColor=k?'#8b76ff':'#5bdfff';ctx.shadowBlur=7;ctx.beginPath();ctx.ellipse(0,0,size*(.40-k*.025),size*(.14+k*.035),0,front?0:Math.PI,front?Math.PI:Math.PI*2);ctx.stroke();ctx.strokeStyle='#e0fcff';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,size*.405,size*.145,0,a,a+.72);ctx.stroke();}ctx.restore();};
 orbit(false);
 const polygons=[];
 for(const patch of DiceMesh.patches){const normal=camera(rotate(patch.normal));if(normal[2]<-.005)continue;const pts=patch.points.map(world),faceNormal=camera(rotate(patch.faceNormal));polygons.push({pts,z:pts.reduce((sum,v)=>sum+v[2],0)/4,normal,faceNormal,bevel:patch.bevel});}
 for(const dot of DiceMesh.dots){if(camera(rotate(dot.normal))[2]<=0)continue;const outer=dot.outer.map(world),inner=dot.inner.map(world);polygons.push({pts:outer.map((p,i)=>project(p)),inner:inner.map(project),z:inner.reduce((sum,v)=>sum+v[2],0)/inner.length,pip:true});}
 // The same rounded mesh keeps the roll and final pip geometry exact.
 const outline=diceHull(polygons.filter(p=>!p.pip).flatMap(p=>p.pts.map(project)));
 const trace=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
 ctx.lineJoin='round';
 polygons.sort((a,b)=>(Number(!!a.pip)-Number(!!b.pip))||a.z-b.z);
 const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*Math.max(0,Math.min(1,t))));
 for(const p of polygons){
  if(p.pip){
   const outer=p.pts,inner=p.inner,xs=outer.map(v=>v[0]),ys=outer.map(v=>v[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
   // A beveled opening plus a recessed inner disk creates a shallow, readable well.
   trace(outer);const rim=ctx.createLinearGradient(x0,y0,x1,y1);rim.addColorStop(0,'#153b76');rim.addColorStop(.42,'#2d56a4');rim.addColorStop(1,'#a9dbff');ctx.fillStyle=rim;ctx.fill();
   trace(inner);const well=ctx.createLinearGradient(x0,y0,x0,y1);well.addColorStop(0,'#071b43');well.addColorStop(1,'#102653');ctx.fillStyle=well;ctx.fill();
  }else{
   const n=p.normal,fn=p.faceNormal,up=Math.pow(Math.max(0,-fn[1]),6),side=Math.pow(Math.abs(fn[0]),6),front=Math.pow(Math.abs(fn[2]),6),sum=up+side+front||1;
   const top=[201,237,255],blue=[37,146,248],violet=[125,78,236];
   let color=top.map((v,i)=>Math.round((v*up+blue[i]*front+violet[i]*side)/sum));
   // Highlight the continuous curved bevel, with no threshold-generated white corner patches.
   const edge=Math.min(1,p.bevel/.28),light=Math.max(0,-n[0]*.36-n[1]*.62+n[2]*.69);
   color=mix(color,[228,249,255],edge*(.22+.60*Math.pow(light,2)));
   const pts=p.pts.map(project);trace(pts);const g=ctx.createLinearGradient(size*.2,size*.15,size*.8,size*.86);g.addColorStop(0,`rgb(${mix(color,[220,245,255],.075)})`);g.addColorStop(.55,`rgb(${color})`);g.addColorStop(1,`rgb(${mix(color,[35,62,174],.07)})`);ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=g;ctx.lineWidth=.55;ctx.stroke();
  }
 }
 trace(outline);ctx.strokeStyle='#9cdbff73';ctx.lineWidth=.7;ctx.stroke();
 orbit(true);
}

function diceHull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower=[],upper=[];for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}lower.pop();upper.pop();return lower.concat(upper)}
