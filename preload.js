const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    parseExcel: (filePath) => ipcRenderer.invoke('parse-excel', filePath),
    processSingleRecord: (data) => ipcRenderer.invoke('process-single-record', data),
    selectFile: () => ipcRenderer.invoke('select-file') // Optional helper
});
