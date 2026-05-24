# Video Match

A small Azar-style random video chat app. It uses Socket.IO for matchmaking and WebRTC signaling, then sends camera and microphone streams directly between browsers through WebRTC.

## Features

- Random one-to-one video matching
- Camera and microphone permission flow
- WebRTC video and audio calls
- Mute, skip, stop, and reconnect states
- Render-ready `render.yaml`
- Health check endpoint at `/health`

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser tabs or two devices. Localhost is allowed to use the camera and microphone without HTTPS in modern browsers.

## Deploy to Render

1. Push this folder to a GitHub repository.
2. In Render, choose **New > Blueprint** and select the repo.
3. Render will read `render.yaml` automatically.
4. Deploy the `voice-match` web service.

For WebRTC camera and microphone access in production, browsers require HTTPS. Render provides HTTPS URLs automatically.

## Notes

The app uses public STUN servers, which works for many networks. For more reliable calls across strict NATs or corporate networks, add a TURN service and include it in `rtcConfig` inside `public/app.js`.
