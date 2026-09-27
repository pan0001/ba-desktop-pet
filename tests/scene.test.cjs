const {test}=require('node:test'),assert=require('node:assert/strict');
const {sanitizeScene,SeatReservations,layouts}=require('../electron/scene-rules.cjs');
test('every seat and paired clip resolves to an enabled original animation',async()=>{
  const furniture=require('../assets/furniture/models.json').items,characters=require('../assets/characters.json');
  const {furnitureInteraction}=await import('../scripts/furniture-rules.js');
  for(const [kind,l]of Object.entries(layouts)){
    assert.ok(l.scale>0&&Number.isFinite(l.scale));assert.equal(new Set(Object.values(l.roles).map(r=>r.seat)).size,l.capacity);
    for(const id of Object.keys(l.roles))assert.ok(furnitureInteraction(furniture[kind],id));
    for(const [id,clip]of Object.entries(l.pairedClips||{}))assert.ok(characters.find(c=>c.id===id).animations.includes(clip));
    if(l.pairedFurnitureClip)assert.ok(furniture[kind].animations.includes(l.pairedFurnitureClip));
  }
});
test('scene persistence bounds count, coordinates, IDs and duplicate students',()=>{
  const valid=['212','426','387','412','431','325','326'];
  const result=sanitizeScene({students:[{id:'primary',characterId:'426'},{id:'x',characterId:'212'},...valid.slice(1).map((characterId,i)=>({id:'s-'+i,characterId,x:NaN,y:-0})),{id:'dup',characterId:'426'}],furniture:[{id:'s-0',kind:'arcade'},{id:'f',kind:'arcade',x:Infinity,y:10},{id:'bad',kind:'bad'}]},valid,new Set(['arcade']),'212');
  assert.equal(result.students.length,5);assert.equal(result.furniture.length,1);assert.equal(result.students[0].x,null);assert.equal(Object.is(result.students[0].y,-0),false);
});
test('authored separate seats allow two or three distinct students without double booking',()=>{
  const seats=new SeatReservations(),f={id:'desk',kind:'arcade'},a={id:'a',characterId:'212'},b={id:'b',characterId:'426'};
  seats.release('a',0);assert.equal(seats.cooldowns.has('a'),false,'changing a free student must not delay its first interaction');
  assert.ok(seats.reserve(a,f,0));assert.ok(seats.reserve(b,f,0));assert.equal(seats.reserve({id:'copy',characterId:'212'},f,0),null);
  assert.equal(seats.reserve(a,{...f,id:'desk2'},0),null);assert.equal(seats.ready('a','wrong',0),false);assert.equal(seats.ready('a','desk',100),true);
  assert.equal(layouts.my_event20_prayerchair.capacity,3);
  assert.equal(layouts.my_event21_plantshelf.capacity,1,'alternative plant-shelf costumes cannot occupy overlapping poses together');
  assert.equal(layouts.my_event073_idolstage,undefined,'unsupported giant poses remain decorative');
});
test('approach requires a compatible unoccupied seat, ground proximity and dwell',()=>{
  const s=new SeatReservations(),f={id:'f',kind:'arcade',x:100,y:50,geometry:{left:100,right:300,floor:500}},a={id:'a',characterId:'212',available:true,x:180,y:550};
  assert.equal(s.approach(a,[f],0),null);assert.equal(s.approach(a,[f],599),null);assert.ok(s.approach(a,[f],600));
  s.release('a',1000);assert.equal(s.approach(a,[f],2000),null);assert.equal(s.approach({...a,y:100},[f],18000),null);
  assert.equal(s.approach({...a,characterId:'387'},[f],19000),null);assert.equal(s.approach({...a,available:false},[f],20000),null);
  assert.equal(s.approach(a,[{...f,dragging:true}],21000),null);assert.equal(s.approach(a,[f],22000),null);assert.ok(s.approach(a,[f],22700));
});
