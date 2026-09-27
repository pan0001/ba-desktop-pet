const layouts = require('../assets/furniture/seats.json').items;
const MAX_STUDENTS = 6, MAX_FURNITURE = 6;
function sanitizeScene(value, validIds, furnitureIds, primaryId, primaryEnabled = true) {
  const seen = new Set(['primary']), students = new Set([primaryId]);
  const position = v => Number.isFinite(v) && Math.abs(v) <= 1000000 ? Math.round(v) + 0 : null;
  const entries = (list, type, limit) => (Array.isArray(list) ? list : []).filter(v => {
    if (!v || typeof v.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(v.id) || seen.has(v.id)) return false;
    if (type === 'student' ? !validIds.includes(v.characterId) || students.has(v.characterId) : !furnitureIds.has(v.kind)) return false;
    seen.add(v.id); if(type==='student')students.add(v.characterId); return true;
  }).slice(0,limit).map(v => ({id:v.id,...(type==='student'?{characterId:v.characterId}:{kind:v.kind}),x:position(v.x),y:position(v.y)}));
  return {students:entries(value?.students,'student',MAX_STUDENTS-(primaryEnabled?1:0)), furniture:entries(value?.furniture,'furniture',MAX_FURNITURE)};
}
// Reservations are made synchronously in the main process. Loading a model must
// not leave the seat available to another student, nor hide its owner early.
class SeatReservations {
  constructor() { this.occupants = new Map(); this.cooldowns = new Map(); this.waiting = new Map(); }
  occupied(actorId) { return this.occupants.get(actorId); }
  list(furnitureId) { return [...this.occupants.values()].filter(v=>v.furnitureId===furnitureId); }
  reserve(actor, furniture, now) {
    const role=layouts[furniture.kind]?.roles[actor.characterId];
    if (!role || this.occupied(actor.id) || (this.cooldowns.get(actor.id)||0)>now || this.list(furniture.id).some(v=>v.seat===role.seat)) return null;
    const entry={actorId:actor.id,characterId:actor.characterId,furnitureId:furniture.id,seat:role.seat,phase:'loading',deadline:now+20000};
    this.occupants.set(actor.id,entry); this.waiting.delete(actor.id); return entry;
  }
  ready(actorId, furnitureId, now) {
    const v=this.occupied(actorId); if(!v||v.furnitureId!==furnitureId||v.phase!=='loading')return false;
    v.phase='seated';v.deadline=now+60000;return true;
  }
  release(actorId, now) {
    const v=this.occupied(actorId);this.waiting.delete(actorId);if(!v)return null;
    this.occupants.delete(actorId);this.cooldowns.set(actorId,now+15000);return v;
  }
  approach(actor, furniture, now) {
    if (!actor.available || this.occupied(actor.id) || (this.cooldowns.get(actor.id)||0)>now) {this.waiting.delete(actor.id);return null;}
    const candidates=furniture.filter(f=>f.geometry&&layouts[f.kind]?.roles[actor.characterId]&&!f.dragging).map(f=>{
      const g=f.geometry,dx=Math.max(f.x+g.left-actor.x,actor.x-f.x-g.right,0),dy=Math.abs(actor.y-f.y-g.floor);
      return {f,dx,dy};
    }).filter(v=>v.dx<=48&&v.dy<=48).sort((a,b)=>a.dx+a.dy-b.dx-b.dy);
    for(const {f} of candidates){
      const role=layouts[f.kind].roles[actor.characterId]; if(this.list(f.id).some(v=>v.seat===role.seat))continue;
      const previous=this.waiting.get(actor.id);
      if(previous?.id!==f.id){this.waiting.set(actor.id,{id:f.id,since:now});return null;}
      if(now-previous.since>=600)return this.reserve(actor,f,now);
      return null;
    }
    this.waiting.delete(actor.id);return null;
  }
}
module.exports={layouts,MAX_STUDENTS,MAX_FURNITURE,sanitizeScene,SeatReservations};
