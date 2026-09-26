const {test} = require('node:test');
const assert = require('node:assert/strict');
const {platformOptions,helperPath,normalizeWindows} = require('../electron/platform.cjs');
test('macOS window points are not scaled twice; Windows physical rectangles become DIP', () => {
  const row={id:'42:15',x:-1440,y:22,width:900,height:700,standable:true};
  const noWindowsAPI={get screenToDipRect(){throw new Error('Windows-only API called');}};
  assert.deepEqual(normalizeWindows([row],noWindowsAPI,'darwin'),[row]);
  let calls=0;
  const screen={screenToDipRect(_,rect){calls++;return {...rect,width:rect.width/2,height:rect.height/2};}};
  assert.equal(normalizeWindows([row],screen,'win32')[0].width,450);assert.equal(calls,1);
  assert.deepEqual(normalizeWindows([null,{...row,x:NaN},{...row,height:0},{...row,id:3}],noWindowsAPI,'darwin'),[]);
});
test('platform-specific helper paths and window/menu conventions',()=>{
  assert.match(helperPath('root','resources',true,'darwin'),/native[\\/]WindowGeometry$/);
  assert.match(helperPath('root','resources',false,'win32'),/native[\\/]bin[\\/]WindowGeometry.exe$/);
  assert.equal(platformOptions('darwin').topLevel,'floating');
  assert.equal(platformOptions('win32').topLevel,'pop-up-menu');
  assert.equal(platformOptions('darwin').shortcut,'⌘ + ⌥ + B');
});
