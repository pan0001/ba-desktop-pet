const {BrowserWindow,screen}=require('electron');
const {randomUUID}=require('node:crypto');
const {DesktopWorld}=require('./world.cjs');
const {fitBounds,motionPosition}=require('./core.cjs');
const {SeatReservations,layouts,MAX_STUDENTS,MAX_FURNITURE}=require('./scene-rules.cjs');
const furniture=require('../assets/furniture/models.json').items;

class DesktopScene {
  constructor(host){this.host=host;this.windows=new Map();this.seats=new SeatReservations();this.lastSave=0;this.clock=0;this.closed=false;this.error='';}
  settings(){return this.host.settings();}
  actors(){return [...(this.settings().primaryEnabled!==false?[this.host.primary()]:[]),...[...this.windows.values()].filter(v=>v.type==='student')];}
  actor(id){return this.actors().find(v=>v.id===id);}
  owns(event){return event.senderFrame===event.sender.mainFrame&&event.senderFrame?.url.startsWith('pet://app/')&&[...this.windows.values()].some(v=>v.win.webContents===event.sender);}
  record(event){return [...this.windows.values()].find(v=>v.win.webContents===event.sender);}
  occupied(id){return this.seats.occupied(id);}
  send(v,channel,value){this.host.send(v.win,channel,value);}
  snapshot(){return {students:this.actors().map(a=>({id:a.id,characterId:a.characterId,seated:this.seats.occupied(a.id)?.furnitureId||null})),
    furniture:[...this.windows.values()].filter(v=>v.type==='furniture').map(v=>({id:v.id,kind:v.kind,capacity:layouts[v.kind]?.capacity||0,occupants:this.seats.list(v.id).map(e=>({actorId:e.actorId,characterId:e.characterId,phase:e.phase}))})),error:this.error};}
  state(v){const global=this.host.state();return {...global,actorId:v.id,characterId:v.characterId||global.characterId,furniture:'none',
    sceneSeated:this.seats.occupied(v.id)?.phase==='seated',
    canvasWidth:v.extent.width,canvasHeight:v.extent.height,proactiveEvents:false,
    care:v.type==='student'?this.host.care().snapshot(v.characterId):null,
    kind:v.kind,occupants:this.seats.list(v.id),desktopScene:this.snapshot()};}
  persist(){const s=this.settings(),pending={students:s.desktopScene.students.filter(e=>!this.host.resourceAvailable('characters',e.characterId)),furniture:s.desktopScene.furniture.filter(e=>!this.host.resourceAvailable('furniture',e.kind))};s.desktopScene={students:[],furniture:[]};for(const v of this.windows.values())s.desktopScene[v.type==='student'?'students':'furniture'].push({id:v.id,...(v.type==='student'?{characterId:v.characterId}:{kind:v.kind}),x:v.world?.x??v.win.getBounds().x,y:v.world?.y??v.win.getBounds().y});for(const key of ['students','furniture'])s.desktopScene[key]=[...s.desktopScene[key],...pending[key]].slice(0,key==='students'?MAX_STUDENTS-(s.primaryEnabled!==false?1:0):MAX_FURNITURE);this.host.save();}
  changed(){this.persist();this.host.publish();}
  restore(){const saved=this.settings().desktopScene;for(const entry of saved.students)if(!this.windows.has(entry.id)&&this.actors().length<MAX_STUDENTS&&!this.actors().some(a=>a.characterId===entry.characterId)&&this.host.resourceAvailable('characters',entry.characterId))this.create('student',entry);for(const entry of saved.furniture)if(!this.windows.has(entry.id)&&[...this.windows.values()].filter(v=>v.type==='furniture').length<MAX_FURNITURE&&this.host.resourceAvailable('furniture',entry.kind))this.create('furniture',entry);
    const legacy=this.settings().furniture;if(legacy!=='none'&&saved.furniture.length<MAX_FURNITURE&&this.host.resourceAvailable('furniture',legacy)){this.settings().furniture='none';this.create('furniture',{id:randomUUID(),kind:legacy,x:null,y:null});this.persist();}
  }
  create(type,entry){
    const settings=this.settings(),saved=motionPosition(entry),area=saved?screen.getDisplayNearestPoint({x:Math.round(saved.x+settings.size*1.3),y:Math.round(saved.y+settings.size*1.3)}).workArea:screen.getPrimaryDisplay().workArea;
    const bounds=fitBounds({...settings,x:entry.x,y:entry.y},area);
    if(type==='furniture'&&saved)Object.assign(bounds,saved);
    if(entry.x==null)bounds.x=Math.round(area.x+area.width/2-bounds.width/2+(this.windows.size%3-1)*90);
    const win=new BrowserWindow({...bounds,title:type==='student'?'BA桌宠 · 学生':'BA桌宠 · 家具',frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,
      resizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:settings.alwaysOnTop,show:false,webPreferences:this.host.preferences()});
    const v={...entry,type,win,extent:{width:bounds.width,height:bounds.height},ready:false,geometry:null,drag:null,ignoring:false,autoPlace:entry.y==null};
    if(type==='student'){v.world=new DesktopWorld();v.world.place(bounds);this.configure(v);}
    this.windows.set(v.id,v);this.host.secureWindow(win);win.setAlwaysOnTop(settings.alwaysOnTop,this.host.platform.topLevel);
    if(this.host.platform.mac)win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
    win.on('blur',()=>this.endDrag(v,false));
    win.on('closed',()=>{if(this.windows.has(v.id)&&!this.closed)this.remove(v.id);});
    win.webContents.on('render-process-gone',()=>{if(!this.closed)this.remove(v.id);});
    win.webContents.on('did-fail-load',(_e,code)=>{if(code!==-3&&!this.closed)this.remove(v.id);});
    win.loadURL(`pet://app/${type==='student'?'pet':'furniture'}.html`);return v;
  }
  configure(v){if(!v.world)return;const s=this.settings(),care=this.host.care().snapshot(v.characterId);v.world.configure({...s,furniture:'none',roaming:s.roaming&&!care.resting&&care.energy>20});v.world.environment(this.host.rects(),screen.getAllDisplays().map(d=>({id:d.id,...d.workArea})));}
  publish(){
    const activeIds=new Set(this.settings().desktopScene.students.map(s=>s.id));
    for(const v of [...this.windows.values()]){
      if(v.removing)continue;
      // Switching the main student cannot create a second copy of that student.
      if(v.type==='student'&&(!activeIds.has(v.id)||v.characterId===this.settings().characterId)){this.remove(v.id);continue;}
      this.configure(v);v.win.setAlwaysOnTop(this.settings().alwaysOnTop,this.host.platform.topLevel);
      const target=fitBounds({...this.settings(),...v.win.getBounds()},screen.getDisplayMatching(v.win.getBounds()).workArea);
      if(target.width!==v.extent.width){
        this.endDrag(v,false);
        const old=v.extent.width,ratio=target.width/old,b=v.win.getBounds();v.extent={width:target.width,height:target.height};
        const anchor=v.geometry?{x:v.geometry.x??(v.geometry.left+v.geometry.right)/2,y:v.geometry.y??v.geometry.floor}:{x:old/2,y:old/2};
        const pos=motionPosition({x:b.x+anchor.x*(1-ratio),y:b.y+anchor.y*(1-ratio)});v.win.setBounds({...pos,...v.extent});
        if(v.world){v.world.place({...pos,...v.extent});v.geometry=null;}
      }
      this.send(v,'pet:state',this.state(v));
      const hide=this.host.hidden()||this.host.suspended()||this.seats.occupied(v.id)?.phase==='seated';
      if(hide){this.endDrag(v,false);this.send(v,'pet:action','suspend');v.win.hide();}
      else {this.send(v,'pet:action','resume');if(v.ready)v.win.showInactive();}
    }
  }
  move(v,point){const position=motionPosition(point);if(!position)return;const b=v.win.getBounds();if(position.x!==b.x||position.y!==b.y)v.win.setBounds({...position,...v.extent});}
  fitFurniture(v){if(!v.geometry)return;const b=v.win.getBounds(),g=v.geometry,point=motionPosition({x:b.x+(g.left+g.right)/2,y:b.y+g.floor}),area=screen.getDisplayNearestPoint(point).workArea;
    this.move(v,{x:Math.max(area.x-g.left,Math.min(b.x,area.x+area.width-g.right)),y:Math.max(area.y-g.top,Math.min(b.y,area.y+area.height-g.floor))});
  }
  through(v,value){if(v.ignoring===value)return;v.ignoring=value;v.win.setIgnoreMouseEvents(value,{forward:true});}
  motion(v,value){const key=JSON.stringify(value);if(key===v.lastMotion)return;v.lastMotion=key;this.send(v,'pet:motion',{...value,physics:this.settings().physics});}
  poll(cursor){
    if(this.host.hidden()||this.host.suspended())return;
    for(const v of this.windows.values()){
      if(!v.ready||this.seats.occupied(v.id)?.phase==='seated')continue;
      const b=v.win.getBounds();
      if(v.drag){
        const dx=cursor.x-v.drag.cursor.x,dy=cursor.y-v.drag.cursor.y;
        if(!v.drag.moved&&Math.hypot(dx,dy)>4){v.drag.moved=true;this.send(v,'pet:drag',true);}
        if(v.drag.moved){const p=motionPosition({x:v.drag.bounds.x+dx,y:v.drag.bounds.y+dy});if(p){this.move(v,p);if(v.world){v.world.dragTo(p.x,p.y,Date.now());this.motion(v,v.world.snapshot(v.world.dragVx,v.world.dragVy));}}}
      }else {const x=cursor.x-b.x,y=cursor.y-b.y;if(x<0||y<0||x>=b.width||y>=b.height)this.through(v,true);else this.send(v,'pet:cursor',{x,y});}
    }
  }
  endDrag(v,allowThrow){if(!v.drag)return;const moved=v.drag.moved;v.drag=null;if(v.world){const p=motionPosition(v.world)||v.win.getBounds();v.world.dragTo(p.x,p.y,Date.now());v.world.release({now:Date.now(),allowThrow:allowThrow&&moved&&!this.host.hidden()&&!this.host.suspended()});this.motion(v,v.world.snapshot());}this.send(v,'pet:drag',false);this.persist();}
  tick(delta){
    if(this.closed||this.host.hidden()||this.host.suspended()||this.settings().paused)return;
    this.clock+=Math.max(0,Math.min(.15,delta))*1000;
    for(const v of this.windows.values())if(v.world&&v.geometry&&!this.occupied(v.id)){
      this.configure(v);const motion=v.world.step(delta),p=motionPosition(motion);
      if(!p){v.world.place(fitBounds({...this.settings(),x:null,y:null},screen.getPrimaryDisplay().workArea));continue;}
      if(!v.drag)this.move(v,p);this.motion(v,motion);
    }
    for(const entry of [...this.seats.occupants.values()])if(this.clock>=entry.deadline)this.release(entry.actorId);
    const furnitureWindows=[...this.windows.values()].filter(v=>v.type==='furniture'&&v.ready).map(v=>({...v,...v.win.getBounds(),dragging:!!v.drag}));
    for(const a of this.actors()){
      const w=a.world;
      const entry=this.seats.approach({id:a.id,characterId:a.characterId,x:w.x+w.foot.x,y:w.y+w.foot.y,
        available:!!a.geometry&&!a.drag&&!w.reaction&&!w.options.busy&&!w.options.menuOpen&&['idle','walk'].includes(w.mode)&&!this.host.busy(a.id)},furnitureWindows,this.clock);
      if(entry){this.send(this.windows.get(entry.furnitureId),'pet:state',this.state(this.windows.get(entry.furnitureId)));this.host.publish();}
    }
    if(this.clock-this.lastSave>3000){this.lastSave=this.clock;this.persist();}
  }
  release(actorId){
    const entry=this.seats.release(actorId,this.clock);if(!entry)return;
    const a=this.actor(actorId),f=this.windows.get(entry.furnitureId);
    if(a&&!a.win.isDestroyed()){
      if(entry.phase==='seated'&&f?.geometry&&!f.win.isDestroyed()){const b=f.win.getBounds(),g=f.geometry;const area=screen.getDisplayMatching(b).workArea;
        const p=motionPosition({x:Math.max(area.x+a.world.foot.radius,Math.min(area.x+area.width-a.world.foot.radius,b.x+g.right+50))-a.world.foot.x,y:b.y+g.floor-a.world.foot.y});
        a.world.place({...p,...a.extent});this.move(a,p);a.world.interact(2);
      }
      this.send(a,'pet:action','recover');this.send(a,'pet:action',this.host.hidden()||this.host.suspended()?'suspend':'resume');
      if(!this.host.hidden()&&!this.host.suspended()&&a.ready)a.win.showInactive();
      if(actorId==='primary')this.host.primaryPosition();
    }
    if(f)this.send(f,'pet:state',this.state(f));this.host.publish();
  }
  remove(id){const v=this.windows.get(id);if(!v||v.removing)return;v.removing=true;for(const entry of [...this.seats.occupants.values()])if(entry.actorId===id||entry.furnitureId===id)this.release(entry.actorId);this.windows.delete(id);if(!v.win.isDestroyed())v.win.destroy();this.changed();}
  command(action,value={},source=null){
    if(!value||typeof value!=='object')return {ok:false};
    if(['seated','seat-error','load-error'].includes(action)){
      if(source?.type!=='furniture')return {ok:false};
      if(action==='load-error'){this.error='家具加载失败，请重新摆放。';this.remove(source.id);return {ok:false};}
      const entry=this.seats.occupied(value.actorId);if(entry?.furnitureId!==source.id)return {ok:false};
      if(action==='seat-error'){this.error='互动模型加载失败，学生已回到桌面。';this.release(value.actorId);return {ok:false};}
      if(this.seats.ready(value.actorId,source.id,this.clock)){const a=this.actor(value.actorId);if(a){this.send(a,'pet:action','suspend');a.win.hide();}this.host.publish();}return {ok:true};
    }
    if(source?.type==='furniture'&&(action!=='leave'||this.seats.occupied(value.actorId)?.furnitureId!==source.id))return {ok:false};
    this.error='';
    if(action==='setStudent'){
      if(typeof value.enabled!=='boolean'||!this.host.characters.some(c=>c.id===value.characterId))return {ok:false};
      const actor=this.actors().find(a=>a.characterId===value.characterId);
      if(value.enabled&&!actor){
        if(!this.host.resourceAvailable('characters',value.characterId))return {ok:false,message:'请先在角色目录下载这位学生'};
        if(this.actors().length>=MAX_STUDENTS)return {ok:false,message:'最多同时陪伴 6 位学生。'};
        if(value.characterId===this.settings().characterId)this.host.setPrimaryEnabled(true);
        else this.create('student',{id:randomUUID(),characterId:value.characterId,x:null,y:null});
      }else if(!value.enabled&&actor){
        if(actor.id==='primary')this.host.setPrimaryEnabled(false);
        else this.remove(actor.id);
      }
    }else if(action==='addStudent'){
      if(!this.host.resourceAvailable('characters',value.characterId))return {ok:false,message:'请先在角色目录下载这位学生'};
      if(this.actors().length>=MAX_STUDENTS)return {ok:false,message:'最多同时陪伴 6 位学生。'};
      if(!this.host.characters.some(c=>c.id===value.characterId)||this.actors().some(a=>a.characterId===value.characterId))return {ok:false,message:'这位学生已经在桌面上了。'};
      if(value.characterId===this.settings().characterId)this.host.setPrimaryEnabled(true);
      else this.create('student',{id:randomUUID(),characterId:value.characterId,x:null,y:null});
    }else if(action==='placeFurniture'){
      if(!this.host.resourceAvailable('furniture',value.kind))return {ok:false,message:'请先下载这类家具资源'};
      if(typeof value.kind!=='string'||!Object.hasOwn(furniture,value.kind))return {ok:false};
      if([...this.windows.values()].filter(v=>v.type==='furniture').length>=MAX_FURNITURE)return {ok:false,message:'最多同时摆放 6 件家具。'};
      this.create('furniture',{id:randomUUID(),kind:value.kind,x:null,y:null});
    }else if(action==='remove'){if(value.id==='primary')this.host.setPrimaryEnabled(false);else this.remove(value.id);}
    else if(action==='clearFurniture'){for(const v of [...this.windows.values()])if(v.type==='furniture')this.remove(v.id);}
    else if(action==='leave')this.release(value.actorId);
    else return {ok:false};
    this.changed();
    if(action==='setStudent'&&value.enabled&&this.host.hidden())this.host.commands('show');
    return {ok:true,scene:this.snapshot()};
  }
  invoke(channel,event,value,extra){const v=this.record(event);if(!v)return null;
    if(channel==='pet:state')return this.state(v);
    if(channel==='pet:scene')return this.command(value,extra,v);
    if(channel==='pet:initiative')return {ok:false};
    if(channel==='pet:update')return this.state(v);
    if(channel==='pet:care'&&v.type==='student'&&value?.characterId===v.characterId&&['tap','pet','snack','gift','play','rest','claim'].includes(value.action)){
      const result=this.host.care().act(v.characterId,value.action);if(result.changed)this.host.saveCare();if(result.ok)this.send(v,'pet:care-event',{...result,action:value.action,characterId:v.characterId,care:this.host.care().snapshot(v.characterId)});this.host.publish();return {...result,state:this.state(v)};
    }return null;
  }
  event(channel,event,value){const v=this.record(event);if(!v)return;
    if(channel==='pet:ready'){v.ready=true;if(!this.host.hidden()&&!this.host.suspended()&&!this.seats.occupied(v.id))v.win.showInactive();}
    if(channel==='pet:command'){
      if(['settings','menu'].includes(value))this.host.commands('settings');
      else if(value==='recover'){v.world?.cancelReaction();v.world?.interact(2);this.send(v,'pet:action','recover');}
      else if(value==='assist')v.world?.assist();
    }
    if(channel==='pet:hit'&&!v.drag)this.through(v,!value);
    if(channel==='pet:geometry'&&value){
      if(v.type==='student'){
        if(!['x','y','radius','bodyHeight'].every(k=>Number.isFinite(value[k])&&value[k]>=0&&value[k]<=v.extent.width))return;
        v.geometry=value;v.world.geometry(value);this.configure(v);
      }else {
        if(!['left','right','floor','top','bottom'].every(k=>Number.isFinite(value[k])&&Math.abs(value[k])<=v.extent.width*3))return;
        v.geometry=value;
        if(v.autoPlace){v.autoPlace=false;const b=v.win.getBounds(),area=screen.getDisplayMatching(b).workArea;this.move(v,{x:b.x,y:area.y+area.height-value.floor});this.persist();}
        else this.fitFurniture(v);
      }
    }
    if(channel==='pet:animation'&&v.world&&typeof value==='string'){v.world.configure({busy:!['idle','walk'].includes(value)});if(value==='interaction')v.world.interact();}
    if(channel==='pet:reaction'&&Number.isSafeInteger(value?.id)&&['help','done'].includes(value.phase))v.world?.reactionStatus(value.id,value.phase);
    if(channel==='pet:drag-start'&&v.ready&&!v.drag&&value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.y>=0&&value.x<=v.extent.width&&value.y<=v.extent.height){
      if(this.occupied(v.id))return;const b=v.win.getBounds();v.drag={bounds:b,cursor:{x:b.x+value.x,y:b.y+value.y},moved:false};v.world?.grab(Date.now());v.world?.dragTo(b.x,b.y,Date.now());this.through(v,false);
    }
    if(channel==='pet:drag-move')this.poll(this.host.cursor());
    if(channel==='pet:drag-end'){this.poll(this.host.cursor());this.endDrag(v,value===true);}
  }
  careTick(seconds){let changed=false;const key=id=>this.host.characters.find(c=>c.id===id)?.studentId||id,seen=new Set(this.settings().primaryEnabled!==false?[key(this.settings().characterId)]:[]);for(const v of this.windows.values())if(v.world&&!seen.has(key(v.characterId))){seen.add(key(v.characterId));const result=this.host.care().tick(v.characterId,{active:!!v.geometry&&!this.host.hidden()&&!this.host.suspended()&&!this.settings().paused,seconds});changed||=result.changed;}if(changed)this.host.saveCare();}
  relocate(){for(const v of this.windows.values()){this.endDrag(v,false);if(v.type==='furniture'){this.fitFurniture(v);continue;}const b=v.win.getBounds(),area=screen.getDisplayMatching(b).workArea,fit=fitBounds({...this.settings(),x:b.x,y:b.y},area);this.move(v,fit);if(v.world)v.world.place({...fit,...v.extent});}this.persist();}
  close(){this.closed=true;for(const v of this.windows.values())if(!v.win.isDestroyed())v.win.destroy();this.windows.clear();}
}
module.exports={DesktopScene};
