const { app, BrowserWindow, ipcMain } = require("electron");
const net = require("net");
const path = require("path");
const speaker = require("speaker");

function createWindow() {
  const win = new BrowserWindow({
    width: 300,
    height: 280,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: true,
    titleBarStyle: "hidden-inset",
    icon:
      process.platform === "win32"
        ? path.join(__dirname, "assets/icons/win/icon.ico")
        : process.platform === "darwin"
        ? path.join(__dirname, "assets/icons/mac/icon.icns")
        : path.join(__dirname, "assets/icons/png/1024x1024.png"),
  });

  win.loadFile("index.html");
}

// Audio configuration
const audioOutput = new speaker({
  channels: 1,
  bitDepth: 16,
  sampleRate: 44100,
});

let client = null;

ipcMain.on("connect-to-server", (event, serverIP) => {
  client = new net.Socket();

  client.connect(12345, serverIP, () => {
    console.log("Connected to Android server");
    event.reply("connection-status", "Connected");
  });

  client.on("data", (data) => {
    audioOutput.write(data);
  });

  client.on("error", (err) => {
    console.error("Connection error:", err);
    event.reply("connection-status", "Error: " + err.message);
  });

  client.on("close", () => {
    console.log("Connection closed");
    event.reply("connection-status", "Disconnected");
  });
});

ipcMain.on("disconnect", () => {
  if (client) {
    client.destroy();
    client = null;
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
