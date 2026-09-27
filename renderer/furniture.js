import {mountFurnitureScene} from '../scripts/furniture-scene.js';
const api=window.pet,stage=document.getElementById('stage'),notice=document.getElementById('notice');
let viewer,state,suspended=false,signature='',dragPoint=null;
function apply(next){state=next;stage.style.width=state.canvasWidth+'px';stage.style.height=state.canvasHeight+'px';viewer?.pause(state.paused||state.hidden||suspended);const key=JSON.stringify(state.occupants?.map(v=>[v.actorId,v.characterId])||[]);if(viewer&&key!==signature){signature=key;void viewer.setOccupants(state.occupants||[],state.characters);}}
api.onState(apply);api.onAction(action=>{if(action==='suspend')suspended=true;if(action==='resume')suspended=false;if(state)apply(state);});
api.onCursor(point=>api.hit(Boolean(viewer?.hit(point.x,point.y))));
stage.addEventListener('pointerdown',event=>{if(event.button!==0||!viewer?.hit(event.clientX,event.clientY))return;dragPoint={x:event.clientX,y:event.clientY};stage.setPointerCapture(event.pointerId);api.dragStart(dragPoint);});
stage.addEventListener('pointermove',()=>{if(dragPoint)api.dragMove();});
const release=()=>{if(dragPoint){api.dragEnd(false);dragPoint=null;}};
stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);window.addEventListener('blur',release);
stage.addEventListener('dblclick',event=>{const hit=viewer?.hit(event.clientX,event.clientY);if(hit?.actorId)void api.scene('leave',{actorId:hit.actorId});});
stage.addEventListener('contextmenu',event=>{event.preventDefault();api.command('settings');});
try{
  state=await api.getState();stage.style.width=state.canvasWidth+'px';stage.style.height=state.canvasHeight+'px';
  viewer=await mountFurnitureScene(stage,state.kind,{onGeometry:value=>api.geometry(value),onLoaded:actorId=>api.scene('seated',{actorId}),onError:(actorId,error)=>{console.error(error);void api.scene('seat-error',{actorId});}});
  stage.dataset.state='ready';apply(state);api.ready();
  if(state.measureFrames)window.furnitureSceneTest={diagnostics:()=>viewer.diagnostics(),hit:(x,y)=>viewer.hit(x,y),reviewOccupants:entries=>viewer.setOccupants(entries,state.characters)};
}catch(error){stage.dataset.state='error';notice.hidden=false;notice.textContent=error.message;console.error(error);void api.scene('load-error');}
window.addEventListener('beforeunload',()=>viewer?.dispose());
