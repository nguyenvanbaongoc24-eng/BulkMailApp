const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    parseExcel: (filePath) => ipcRenderer.invoke('parse-excel', filePath),
    processSingleRecord: (data) => ipcRenderer.invoke('process-single-record', data),
    selectFile: () => ipcRenderer.invoke('select-file'),
    // Real-time status updates from pipeline
    onStatusUpdate: (callback) => {
        ipcRenderer.on('record-status-update', (event, data) => callback(data));
    },
    removeStatusListener: () => {
        ipcRenderer.removeAllListeners('record-status-update');
    }
});
