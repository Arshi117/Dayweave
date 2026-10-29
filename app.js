'use strict';
const $ = selector => document.querySelector(selector);
const frame=$('#product-demo'),desktop=$('#desktop');
const state={height:44,calendar:false,expanded:false,dimensions:{stripWidth:300,calendarWidth:760,calendarHeight:620},anchor:{x:0,y:54}};
let scale=1,drag=null,resize=null;
function send(type,data={}){frame.contentWindow?.postMessage({channel:'dayweave-demo-host',type,...data},location.origin);}
function resetAnchor(){const width=desktop.clientWidth;state.anchor={x:Math.max(6,(width-state.dimensions.stripWidth)/2),y:24};}
function layout(){
 const area=desktop.clientWidth,sidebar=Math.max(300,state.dimensions.stripWidth),width=state.calendar?sidebar+8+state.dimensions.calendarWidth:state.expanded?sidebar:state.dimensions.stripWidth;
 scale=Math.min(1,(area-12)/width);
 const left=state.calendar;
 const x=Math.max(6,Math.min(area-width*scale-6,state.anchor.x-(left?(width-state.dimensions.stripWidth)*scale:0)));
 const y=Math.max(12,Math.min(390,state.anchor.y));
 const needed=Math.ceil(state.height*scale+y+42);desktop.style.height=Math.max(100,needed)+'px';
 Object.assign(frame.style,{width:width+'px',height:state.height+'px',left:x+'px',top:y+'px',transform:'scale('+scale+')'});
 send('placement',{placement:{above:false,left,availableHeight:700,availableWidth:width,dimensions:{...state.dimensions}}});
}
function applyResize(gesture,dx,dy){
 const {target,edge,dimensions,anchor}=gesture;
 if(target==='strip'){
  const change=edge.includes('left')?-dx:dx;
  state.dimensions.stripWidth=Math.max(180,Math.min(600,dimensions.stripWidth+change));
  if(edge.includes('left'))state.anchor.x=anchor.x+dimensions.stripWidth-state.dimensions.stripWidth;
 }else{
  if(edge.includes('left')||edge.includes('right'))state.dimensions.calendarWidth=Math.max(400,Math.min(1400,dimensions.calendarWidth+(edge.includes('left')?-dx:dx)));
  if(edge.includes('top')||edge.includes('bottom'))state.dimensions.calendarHeight=Math.max(420,Math.min(1000,dimensions.calendarHeight+(edge.includes('top')?-dy:dy)));
 }
 layout();
}
addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.channel!=='dayweave-product-demo')return;
 const data=event.data;
 if(data.type==='ready')layout();
 if(data.type==='layout'){state.height=Math.max(44,Math.min(1100,data.height));state.calendar=data.calendar;state.expanded=data.expanded;layout();}
 if(data.type==='drag-start')drag={x:data.x,y:data.y,anchor:{...state.anchor}};
 if(data.type==='drag-move'&&drag){state.anchor.x=Math.max(6,Math.min(desktop.clientWidth-state.dimensions.stripWidth*scale-6,drag.anchor.x+data.x-drag.x));state.anchor.y=Math.max(12,Math.min(390,drag.anchor.y+data.y-drag.y));layout();}
 if(data.type==='drag-end')drag=null;
 if(data.type==='resize-start')resize={...data,dimensions:{...state.dimensions},anchor:{...state.anchor}};
 if(data.type==='resize-move'&&resize)applyResize(resize,(data.x-resize.x)/scale,(data.y-resize.y)/scale);
 if(data.type==='resize-end')resize=null;
 if(data.type==='resize-step')applyResize({...data,dimensions:{...state.dimensions},anchor:{...state.anchor}},data.dx,data.dy);
 if(data.type==='notice')$('#demo-status').textContent=data.message;
});
frame.addEventListener('load',layout);
function resetExample(){
 drag=null;resize=null;
 Object.assign(state,{height:44,calendar:false,expanded:false,dimensions:{stripWidth:300,calendarWidth:760,calendarHeight:620}});
 $('#demo-status').textContent='已重置 Google 日历日程与 Microsoft To Do 示例待办。';
 resetAnchor();frame.src='product-demo/index.html?surface=focus';layout();
}
$('#reset-demo').addEventListener('click',resetExample);
addEventListener('resize',()=>{resetAnchor();layout();});resetAnchor();layout();
const dialog=$('#release-dialog');
document.querySelectorAll('[data-release]').forEach(button=>button.addEventListener('click',()=>dialog.showModal()));
$('#dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
