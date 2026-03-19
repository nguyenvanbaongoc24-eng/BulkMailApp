const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    parseExcel: (filePath) => ipcRenderer.invoke('parse-excel', filePath),
    fetchSinglePdf: (data) => ipcRenderer.invoke('fetch-single-pdf', data),
    uploadToSupabase: (data) => ipcRenderer.invoke('upload-to-supabase', data),
    cleanupTemp: () => ipcRenderer.invoke('cleanup-temp'),
    selectFile: () => ipcRenderer.invoke('select-file') // Optional helper
});
