'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {MatrixEffects}=require('../src/matrix-effects.js');
const {matrixRevealedStatus,MatrixLineTour}=require('../src/matrix-interface.js');
const engine=require('../src/matrix-engine.js'),{MATRIX_EXAMPLES}=require('../src/matrix-examples.js');
test('matrix can still boot and send one spin intent without audio; embedded classic link never navigates the wrong frame',()=>{
 const nodes=new Map(),messages=[],events={};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',disabled:false,hidden:false,open:false,dataset:{},setAttribute(k,v){this[k]=v;},querySelectorAll(){return [];},addEventListener(){},classList:{add(){},remove(){},toggle(){}},replaceChildren(){}});return nodes.get(id);};
 const parent={postMessage:d=>messages.push(d)};
 const document={hidden:false,getElementById:el,querySelector:el,addEventListener(){},body:el('body')};
 const context=vm.createContext({...engine,MATRIX_EXAMPLES,MatrixEffects,matrixRevealedStatus,MatrixLineTour,document,window:{parent,addEventListener:(k,v)=>events[k]=v},location:{origin:'https://demo.test'},matchMedia:()=>({matches:false}),setTimeout,clearTimeout,console});
 vm.runInContext(fs.readFileSync('src/matrix.js','utf8'),context);
 assert.equal(el('sound').disabled,true);assert.equal(el('.classic-link').hidden,true);
 assert.equal(messages.length,1);assert.equal(messages[0].type,'matrix-ready');
 const snapshot={type:'matrix-state',state:'idle',roundId:'',balance:1000,stopped:[null,null,null,null,null],result:null};
 events.message({origin:'https://foreign.test',source:parent,data:snapshot});assert.equal(el('balance').textContent,'');
 events.message({origin:'https://demo.test',source:parent,data:snapshot});assert.equal(el('balance').textContent,'1,000');assert.equal(el('spin').disabled,false);
 el('spin').onclick();el('spin').onclick();assert.equal(messages.filter(m=>m.type==='matrix-spin').length,1);assert.equal(el('spin').disabled,true);
});
