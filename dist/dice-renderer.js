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
 trace(outline);ctx.save();ctx.shadowColor='#7cdcff';ctx.shadowBlur=size*.012;ctx.strokeStyle='#6fb6db80';ctx.lineWidth=1.3;ctx.lineJoin='round';ctx.stroke();ctx.restore();
 polygons.sort((a,b)=>(Number(!!a.pip)-Number(!!b.pip))||a.z-b.z);
 for(const p of polygons){const pts=p.pts.map(project);trace(pts);
  if(p.pip){
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,r=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/2;
   const g=ctx.createLinearGradient(x,y-r,x+r*.35,y+r);g.addColorStop(0,'#050d2b');g.addColorStop(.45,'#10244f');g.addColorStop(.8,'#1c4380');g.addColorStop(1,'#5488bd');ctx.fillStyle=g;ctx.fill();const lip=ctx.createLinearGradient(x,y-r,x,y+r);lip.addColorStop(0,'#143b6580');lip.addColorStop(.48,'#3964ac55');lip.addColorStop(1,'#b7f1ffee');ctx.strokeStyle=lip;ctx.lineWidth=.85;ctx.stroke();
  }else{
   const len=Math.hypot(...p.normal)||1,n=p.normal.map(v=>v/len),light=Math.max(0,n[0]*-.4+n[1]*-.6+n[2]*.7);
   const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
   const rim=Math.pow(1-Math.max(0,n[2]),3)*.32,spec=Math.pow(Math.max(0,n[0]*-.31+n[1]*-.48+n[2]*.82),28)*.42;
   const top=mix(mix([32,81,151],[140,216,240],light),[207,249,255],Math.min(.65,rim+spec)),bottom=mix(mix([48,38,112],[68,126,192],light),[120,163,230],rim);
   const g=ctx.createLinearGradient(size*.22,size*.1,size*.8,size*.88);g.addColorStop(0,`rgb(${top})`);g.addColorStop(.32,`rgb(${mix(top,bottom,.22)})`);g.addColorStop(.6,`rgb(${mix(top,bottom,.68)})`);g.addColorStop(.87,`rgb(${bottom})`);g.addColorStop(1,`rgb(${mix(bottom,[111,183,224],.25)})`);
   ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=g;ctx.lineWidth=.6;ctx.stroke();
  }
 }
 // Environment reflections follow each face; fine bright edges imply glass thickness.
 for(const panel of DiceMesh.panels){const n=camera(rotate(panel.normal));if(n[2]<=.12)continue;const pts=panel.points.map(world).map(project),xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);ctx.save();trace(pts);ctx.clip();const shift=Math.sin(phase)*size*.02,shine=ctx.createLinearGradient(x0+shift,y0,x1+shift,y1);shine.addColorStop(0,'#c1f4ff00');shine.addColorStop(.35,'#c1f4ff00');shine.addColorStop(.36,'#d3f6ff66');shine.addColorStop(.40,'#b5ecff22');shine.addColorStop(.46,'#d3f6ff00');shine.addColorStop(.78,'#788fff00');shine.addColorStop(1,'#b4c5ff22');ctx.fillStyle=shine;ctx.fillRect(0,0,size,size);ctx.restore();const rim=ctx.createLinearGradient(x0,y0,x1,y1);rim.addColorStop(0,'#c8f6ff66');rim.addColorStop(.45,'#91c7ff08');rim.addColorStop(1,'#bdbeff55');trace(pts);ctx.strokeStyle=rim;ctx.lineWidth=.65;ctx.stroke();}
 const edge=ctx.createLinearGradient(size*.25,size*.1,size*.7,size*.95);edge.addColorStop(0,'#ddfaff');edge.addColorStop(.28,'#9ee2efb0');edge.addColorStop(.5,'#477bb544');edge.addColorStop(.8,'#a4aeecb0');edge.addColorStop(1,'#d2caff');trace(outline);ctx.strokeStyle=edge;ctx.lineWidth=1.05;ctx.stroke();
 orbit(true);
}

function diceHull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower=[],upper=[];for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}lower.pop();upper.pop();return lower.concat(upper)}
