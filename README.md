
# SoundDrift Client

A minimalist desktop client for receiving SoundDrift app's audio streams from Android devices. Built with Electron.

<img width="412" height="606" alt="Screenshot 2025-12-12 at 3 03 07 PM" src="https://github.com/user-attachments/assets/4c5807bc-55d5-4eaf-9842-91f553845beb" />


## Usage
Download the 
[Latest Release](https://github.com/heymeowcat/SoundDriftPlayer/releases/latest)


## Features

- Compact, Retro UI design
- Real-time audio streaming from Android devices
- Cross-platform support (Windows, macOS, Linux)

## Prerequisites

Before installing, make sure you have the following installed:
- [Node.js](https://nodejs.org/)
- npm (comes with Node.js)

### Platform-specific Requirements

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
`npm run make`

This will create platform-specific packages in the  `out`  folder.

## Usage

1.  Start the [SoundDrift](https://github.com/heymeowcat/SoundDrift) Android app on your phone
2.  Click Start Streaming on the App
3.  Enter the IP address in the SoundDrift Client
4.  Click "Connect" to start receiving audio

## Development

-   `npm start`  - Start the app in development mode
-   `npm run make`  - Build the app for distribution
-   `npm run generate-icons`  - Generate app icons
