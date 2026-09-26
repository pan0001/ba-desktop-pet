const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('pet', {
  getState: () => ipcRenderer.invoke('pet:state'),
  update: patch => ipcRenderer.invoke('pet:update', patch),
  care: (action, characterId) => ipcRenderer.invoke('pet:care', { action, characterId }),
  initiative: value => ipcRenderer.invoke('pet:initiative', value),
  command: command => ipcRenderer.send('pet:command', command),
  hit: value => ipcRenderer.send('pet:hit', Boolean(value)),
  dragStart: point => ipcRenderer.send('pet:drag-start', point),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: (allowThrow = false) => ipcRenderer.send('pet:drag-end', allowThrow === true),
  ready: () => ipcRenderer.send('pet:ready'),
  geometry: value => ipcRenderer.send('pet:geometry', value),
  animation: mode => ipcRenderer.send('pet:animation', mode),
  reaction: value => ipcRenderer.send('pet:reaction', value),
  onMotion: callback => subscribe('pet:motion', callback),
  onState: callback => subscribe('pet:state', callback),
  onCare: callback => subscribe('pet:care-event', callback),
  onInitiativeCancel: callback => subscribe('pet:initiative-cancel', callback),
  onCursor: callback => subscribe('pet:cursor', callback),
  onDrag: callback => subscribe('pet:drag', callback),
  onAction: callback => subscribe('pet:action', callback)
});
