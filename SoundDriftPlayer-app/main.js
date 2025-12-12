const { app, BrowserWindow, ipcMain } = require("electron");
const dgram = require("dgram");
const net = require("net");
const path = require("path");
const speaker = require("speaker");
const nativeImage = require("electron").nativeImage;

const image = nativeImage.createFromPath("build/icon.png");
if (process.platform === "darwin") {
  app.dock.setIcon(image);
} else if (process.platform === "linux") {
  const linuxIconPath = path.join(__dirname, "build/icon.png");
  mainWindow.setIcon(linuxIconPath);
}

let mainWindow = null;
let udpClient = null;
let tcpClient = null;
let audioOutput = null;
let currentVolume = 1.0;
let isTCPConnected = false;
let isUDPConnected = false;
let serverIP = null;

const MAX_QUEUE_LENGTH = 50; // Maximum packets to keep in queue
let silenceThreshold = 5;
let silentPacketCount = 0;

function createWindow() {
  const iconPath =
    process.platform === "win32"
      ? path.join(__dirname, "build/icon.ico")
      : process.platform === "darwin"
      ? path.join(__dirname, "build/icon.icns")
      : path.join(__dirname, "build/icon.png");

  mainWindow = new BrowserWindow({
    width: 300,
    height: 490,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: true,
    titleBarStyle: process.platform === "darwin" ? "hidden-inset" : "default",
    icon: iconPath,
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
  udpClient = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const audioQueue = []; // Queue to manage incoming audio packets

  udpClient.bind(55555, () => {
    console.log("Client bound to port 55555");

    const deviceInfo = {
      deviceName: require("os").hostname(),
    };

    const handshakeMessage = `SoundDriftConnectionRequest|${JSON.stringify(deviceInfo)}`;
    const handshakePacket = Buffer.from(handshakeMessage);

    udpClient.send(handshakePacket, 55556, serverIP, (err) => {
      if (err) {
        console.error("Error sending handshake packet:", err);
        handleDisconnect();
      } else {
        console.log("Handshake packet sent to server.");
        isUDPConnected = true;
        checkConnectionStatus();
        startConnectionMonitor();
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
    lastPacketTime = Date.now();
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
  return new Promise((resolve) => {
      isTCPConnected = false;
      isUDPConnected = false;

      if (tcpClient) {
        tcpClient.destroy();
        tcpClient = null;
      }

      let udpClosed = false;
      const currentUdpClient = udpClient;
      udpClient = null; // Clear reference immediately to prevent double-close
      
      if (currentUdpClient) {
        const disconnectPacket = Buffer.from("SoundDriftDisconnect");
        try {
          if (serverIP) {
             try {
                currentUdpClient.send(disconnectPacket, 55556, serverIP, (err) => {
                    if (err) console.error("Error sending disconnect packet:", err);
                    else console.log("Disconnect packet sent.");
                });
             } catch (e) {
                 // Ignore send errors if socket is closed
             }
          }

          currentUdpClient.close(() => {
            console.log("UDP socket closed");
            if (!udpClosed) {
                udpClosed = true;
                resolve();
            }
          });
        } catch (e) {
          console.error("Error during disconnect:", e);
          if (!udpClosed) {
             udpClosed = true;
             resolve();
          }
        }
      } else {
          resolve();
      }

      if (audioOutput) {
        audioOutput.removeAllListeners("error");
        audioOutput = null;
      }

      checkConnectionStatus();
      if (connectionMonitorInterval) clearInterval(connectionMonitorInterval);
  });
}



ipcMain.on("disconnect", () => {
  handleDisconnect();
});

let discoveryInterval = null;
let discoverySocket = null;

const os = require("os");

function getBroadcastAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        const ip = iface.address.split(".").map(Number);
        const netmask = iface.netmask.split(".").map(Number);
        const broadcast = ip
          .map((part, i) => part | (~netmask[i] & 255))
          .join(".");
        addresses.push(broadcast);
      }
    }
  }
  
  if (!addresses.includes("255.255.255.255")) {
    addresses.push("255.255.255.255");
  }
  
  return addresses;
}

let connectionMonitorInterval = null;
let lastPacketTime = 0;

function startConnectionMonitor() {
    if (connectionMonitorInterval) clearInterval(connectionMonitorInterval);
    lastPacketTime = Date.now();
    
    connectionMonitorInterval = setInterval(() => {
        if (isUDPConnected && (Date.now() - lastPacketTime > 5000)) {
            console.log("Connection timed out (no data received for 5s)");
            handleDisconnect();
        }
    }, 1000);
}

function startDiscovery() {
  if (discoverySocket) return;

  discoverySocket = dgram.createSocket("udp4");

  discoverySocket.on("error", (err) => {
    console.error(`Discovery socket error:\n${err.stack}`);
    if (discoverySocket) {
        discoverySocket.close();
        discoverySocket = null;
    }
  });

  discoverySocket.on("message", (msg, rinfo) => {
    console.log(`Discovery received: ${msg} from ${rinfo.address}:${rinfo.port}`);
    try {
      // Try to parse as JSON
      const message = msg.toString();
      // Check if it's a valid JSON
      if (message.startsWith("{") && message.endsWith("}")) {
          const data = JSON.parse(message);
          // Check for response type or just deviceName
          if (data.deviceName) {
             if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("device-discovered", {
                    ip: rinfo.address,
                    name: data.deviceName
                });
             }
          }
      }
    } catch (e) {
       console.error("Error parsing discovery message:", e);
    }
  });

  discoverySocket.bind(0, () => {
    discoverySocket.setBroadcast(true);
    console.log("Discovery socket bound");
    
    const sendProbe = () => {
        const probe = Buffer.from("SoundDriftDiscovery");
        const broadcastAddresses = getBroadcastAddresses();
        
        broadcastAddresses.forEach(addr => {
            // Android app is listening on 55558 now
            discoverySocket.send(probe, 55558, addr, (err) => {
                if (err) console.error(`Error sending probe to ${addr}:`, err);
                // else console.log(`Discovery probe sent to ${addr}`);
            });
        });
    };

    sendProbe();
    // Probe every 3 seconds
    discoveryInterval = setInterval(sendProbe, 3000);
  });
}

ipcMain.on("start-discovery", () => {
    startDiscovery();
});

ipcMain.on("connect-to-server", async (event, serverIPFromRenderer) => {
  console.log("Connect request to:", serverIPFromRenderer);
  
  // Always cleanup before connecting to ensure fresh state
  if (isTCPConnected || isUDPConnected || udpClient || tcpClient) {
      console.log("Cleaning up previous connection...");
      await handleDisconnect();
      // Small safety buffer allowing OS to release port
      setTimeout(() => {
          serverIP = serverIPFromRenderer;
          setupAudioOutput();
          connectTCP(serverIP);
          connectUDP(serverIP);
      }, 100);
  } else {
      serverIP = serverIPFromRenderer;
      setupAudioOutput();
      connectTCP(serverIP);
      connectUDP(serverIP);
  }
});

// setInterval(() => {
//   console.log("Reconnecting to prevent latency buildup...");
//   handleDisconnect();
//   if (mainWindow && serverIP) {
//     setupAudioOutput();
//     connectTCP(serverIP);
//     connectUDP(serverIP);
//   }
// }, 1800000);

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
  if (discoveryInterval) clearInterval(discoveryInterval);
  if (discoverySocket) discoverySocket.close();
  mainWindow = null;
});

app.on("window-all-closed", () => {
  handleDisconnect();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
