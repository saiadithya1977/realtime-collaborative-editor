const { app, BrowserWindow, Menu } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadURL("http://localhost:5173");
}


app.whenReady().then(() => {
  createWindow();

  
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "Ctrl+N",
          click() {
            createWindow();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});


app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
