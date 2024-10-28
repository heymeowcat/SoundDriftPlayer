const { app, BrowserWindow, ipcMain } = require("electron");
const dgram = require("dgram");
const net = require("net");
const path = require("path");
const speaker = require("speaker");
const nativeImage = require("electron").nativeImage;

const image = nativeImage.createFromPath("build/icondoc.png");
app.dock.setIcon(image);

let mainWindow = null;
let udpClient = null;
let tcpClient = null;
let audioOutput = null;
let currentVolume = 1.0;
let isTCPConnected = false;
let isUDPConnected = false;

const MAX_QUEUE_LENGTH = 50; // Maximum packets to keep in queue
let silenceThreshold = 5;
let silentPacketCount = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 380,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: true,
    titleBarStyle: "hidden-inset",
    icon: path.join(__dirname, "build/icon.icns"),
  });

  mainWindow.loadFile("index.html");
}

function setupAudioOutput() {
  audioOutput = new speaker({
    channels: 2,
    bitDepth: 16,
    sampleRate: 44100,
    float: false,
    signed: true,
    device: "default",
    endianness: "LE",
  });

  audioOutput.on("error", (err) => {
    console.error("Audio output error:", err);
  });
}

function applyVolume(buffer, volume) {
  const newBuffer = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i += 2) {
    let sample = buffer.readInt16LE(i);
    let adjusted = Math.round(sample * volume);
    newBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, adjusted)), i);
  }
  return newBuffer;
}

function connectTCP(serverIP) {
  tcpClient = new net.Socket();

  tcpClient.connect(55557, serverIP, () => {
    console.log("TCP Connected");
    isTCPConnected = true;
    checkConnectionStatus();
  });

  tcpClient.on("error", (err) => {
    console.error("TCP Error:", err);
    handleDisconnect();
  });

  let dataBuffer = "";

  tcpClient.on("data", (dataChunk) => {
    dataBuffer += dataChunk.toString();
    let newlineIndex;
    while ((newlineIndex = dataBuffer.indexOf("\n")) !== -1) {
      const message = dataBuffer.substring(0, newlineIndex);
      dataBuffer = dataBuffer.substring(newlineIndex + 1);
      try {
        const metadata = JSON.parse(message);
        console.log("Received metadata:", metadata);
        mainWindow.webContents.send("stream-metadata", metadata);
      } catch (e) {
        console.error("Error parsing metadata:", e);
      }
    }
  });

  tcpClient.on("close", () => {
    console.log("TCP Connection closed");
    handleDisconnect();
  });
}

function connectUDP(serverIP) {
  udpClient = dgram.createSocket("udp4");
  const audioQueue = []; // Queue to manage incoming audio packets

  udpClient.bind(55555, () => {
    console.log("Client bound to port 55555");

    const initialPacket = Buffer.from("SoundDriftConnectionRequest");
    udpClient.send(initialPacket, 55556, serverIP, (err) => {
      if (err) {
        console.error("Error sending first packet:", err);

        handleDisconnect();
      } else {
        console.log("Initial packet sent to server.");

        const deviceInfo = {
          deviceName: require("os").hostname(),
        };

        const deviceInfoPacket = Buffer.from(JSON.stringify(deviceInfo));
        udpClient.send(deviceInfoPacket, 55556, serverIP, (err) => {
          if (err) {
            console.error("Error sending device info JSON packet:", err);
          } else {
            console.log(" device info JSON packet sent to server.");
            isUDPConnected = true;
            checkConnectionStatus();
          }
        });
      }
    });
    udpClient.on("close", () => {
      console.log("UDP socket closed");
      handleDisconnect();
    });
  });

  udpClient.on("message", (msg) => {
    if (audioQueue.length >= MAX_QUEUE_LENGTH) {
      audioQueue.shift(); // Remove oldest packet to prevent lag
    }
    audioQueue.push(applyVolume(msg, currentVolume));
    playAudioFromQueue(audioQueue);
  });

  udpClient.on("error", (err) => {
    console.error("UDP Connection error:", err);
    handleDisconnect();
  });
}

function isSilent(buffer) {
  // Check if packet is silent
  for (let i = 0; i < buffer.length; i += 2) {
    if (buffer.readInt16LE(i) !== 0) return false;
  }
  return true;
}

function playAudioFromQueue(queue) {
  if (audioOutput && queue.length > 0) {
    const bufferToPlay = queue.shift();

    if (bufferToPlay) {
      if (isSilent(bufferToPlay)) {
        silentPacketCount++;
        if (silentPacketCount >= silenceThreshold) {
          queue.length = 0; // Clear queue
          silentPacketCount = 0;
          console.log("Silence detected, clearing queue...");
        }
      } else {
        silentPacketCount = 0;
        audioOutput.write(bufferToPlay);
      }
    }
  }
}

function checkConnectionStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (isTCPConnected && isUDPConnected) {
      mainWindow.webContents.send("connection-status", "Connected");
      mainWindow.webContents.send("show-metadata", true);
      mainWindow.webContents.send("update-connect-button", true);
    } else {
      mainWindow.webContents.send("connection-status", "Disconnected");
      mainWindow.webContents.send("show-metadata", false);
      mainWindow.webContents.send("update-connect-button", false);
    }
  }
}

function handleDisconnect() {
  isTCPConnected = false;
  isUDPConnected = false;

  if (tcpClient) {
    tcpClient.destroy();
    tcpClient = null;
  }

  if (udpClient) {
    const disconnectPacket = Buffer.from("SoundDriftDisconnect");
    try {
      udpClient.send(disconnectPacket, 55556, serverIP, (err) => {
        if (err) {
          console.error("Error sending disconnect packet:", err);
        } else {
          console.log("Disconnect packet sent to server.");
        }
      });

      setTimeout(() => {
        udpClient.close();
        udpClient = null;
      }, 100);
    } catch (e) {
      console.error("Error during disconnect:", e);
    }
  }

  if (audioOutput) {
    audioOutput.removeAllListeners("error");
    audioOutput = null;
  }

  checkConnectionStatus();
}

ipcMain.on("connect-to-server", (event, serverIP) => {
  if (!isTCPConnected && !isUDPConnected) {
    setupAudioOutput();
    connectTCP(serverIP);
    connectUDP(serverIP);
  } else {
    console.log("Already connected");
    mainWindow.webContents.send("connection-status", "Already connected");
  }
});

ipcMain.on("disconnect", () => {
  handleDisconnect();
});

setInterval(() => {
  console.log("Reconnecting to prevent latency buildup...");
  handleDisconnect();
  if (mainWindow) {
    setupAudioOutput();
    connectTCP(serverIP);
    connectUDP(serverIP);
  }
}, 1800000);

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

app.on("before-quit", () => {
  handleDisconnect();
  mainWindow = null;
});

app.on("window-all-closed", () => {
  handleDisconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
