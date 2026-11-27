# EMESE intro video

- `emese-intro-reel-1080x1920.mp4`: Reels, Stories, vertical ads
- `emese-intro-feed-1080x1350.mp4`: Facebook and Instagram feed

29 seconds, Egyptian voice-over (ElevenLabs, voice "Omda"), scenes cut on the voice's pauses.

Rebuild: serve `src/` with an `assets` link to `../../assets`, then
`node src/render.js 1080 1920 frames` and encode the frames with `src/voice.mp3` using ffmpeg.
