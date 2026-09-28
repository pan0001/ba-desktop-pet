const {test}=require('node:test'),assert=require('node:assert/strict');
test('short hides cancel sleep, repeated hidden state cannot postpone eviction, and wake happens once',async()=>{
 const {createModelResidency}=await import('../scripts/model-residency.js');
 let fn,cancelled=0,sleeps=0,wakes=0,scheduled=0;
 const residency=createModelResidency({sleep:()=>sleeps++,wake:()=>{assert.equal(residency.sleeping,false);wakes++;},setTimer:cb=>{fn=cb;scheduled++;return 1;},clearTimer:()=>cancelled++});
 residency.setHidden(true);residency.setHidden(false);fn();assert.equal(sleeps,0);assert.equal(cancelled,1);
 residency.setHidden(true);residency.setHidden(true);assert.equal(scheduled,2);fn();
 assert.equal(sleeps,1);assert.equal(residency.sleeping,true);
 residency.setHidden(true);assert.equal(scheduled,2);
 residency.setHidden(false);residency.setHidden(false);assert.equal(wakes,1);
 residency.setHidden(true);residency.dispose();fn();assert.equal(sleeps,1);
});
