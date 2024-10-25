
# SoundDrift Client

A minimalist desktop client for receiving SoundDrift app's audio streams from Android devices. Built with Electron.

<img width="304" alt="sounddriftclient" src="https://github.com/user-attachments/assets/d7fa311e-ad03-409c-b6e0-c015f111862f">


## Features

- Compact, Retro UI design
- Real-time audio streaming from Android devices
- Cross-platform support (Windows, macOS, Linux)

## Prerequisites

Before installing, make sure you have the following installed:
- [Node.js](https://nodejs.org/)
- npm (comes with Node.js)

### Platform-specific Requirements

#### Windows
`npm install --global --production windows-build-tools`
#### macOS
`xcode-select --install`
#### Linux (Ubuntu/Debian)
`sudo  apt-get  install libasound2-dev`

## Installation

1.  Clone the repository
`git clone https://github.com/heymeowcat/SoundDriftPlayer.git`

2.  Install dependencies
`npm  install`

3.  Start the application
`npm start`

## Building from Source

To create a distributable package:
`npm run build`

This will create platform-specific packages in the  `dist`  folder.

## Usage

1.  Start the [SoundDrift](https://github.com/heymeowcat/SoundDrift) Android app on your phone
2.  Click Start Streaming on the App
3.  Enter the IP address in the SoundDrift Client
4.  Click "Connect" to start receiving audio

## Development

-   `npm start`  - Start the app in development mode
-   `npm run build`  - Build the app for distribution
-   `npm run make-icons`  - Generate app icons (requires source icon.png in assets folder)
