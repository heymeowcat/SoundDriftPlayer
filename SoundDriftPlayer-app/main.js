const { app, BrowserWindow, ipcMain } = require("electron");
const dgram = require("dgram");
const path = require("path");
const speaker = require("speaker");

const nativeImage = require("electron").nativeImage;
const image = nativeImage.createFromPath("build/icondoc.png");
app.dock.setIcon(image);

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
    icon: path.join(__dirname, "build/icon.icns"),
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
  client = dgram.createSocket("udp4");

  client.bind(55555, () => {
    const address = client.address();
    console.log(`Client listening on ${address.address}:${address.port}`);

    const firstPacket = Buffer.alloc(1);
    client.send(firstPacket, 55556, serverIP, (err) => {
      if (err) {
        console.error("Error sending first packet:", err);
        event.reply("connection-status", "Error: " + err.message);
      } else {
        console.log("Initial packet sent to server.");
        event.reply("connection-status", "Connected");
      }
    });
  });

  client.on("message", (msg, rinfo) => {
    console.log(
      `Received packet from ${rinfo.address}:${rinfo.port}, size: ${msg.length} bytes`
    );
    audioOutput.write(msg);
  });

  client.on("error", (err) => {
    console.error("Connection error:", err);
    event.reply("connection-status", "Error: " + err.message);
  });
});

ipcMain.on("disconnect", () => {
  if (client) {
    client.close();
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
