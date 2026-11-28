# EMESE intro video

- `emese-intro-reel-1080x1920.mp4`: Reels, Stories, vertical ads
- `emese-intro-feed-1080x1350.mp4`: Facebook and Instagram feed

33.5 seconds. Voice-over: ElevenLabs (voice "Omda"), cleaned (rumble cut, noise reduced, pauses gated)
and given short pauses between sections (`src/clean.py`).

Music: "Motivational Time Lapse Music" by Sticks5611, Freesound (freesound.org/s/614035),
CC0 public domain: free for commercial use, no credit required. Starts at 15.3 s of the track so its
lift lands on the outro; ducked under the voice.

Rebuild: serve `src/` with an `assets` link to `../../assets`, render frames with
`node src/render.js 1080 1920 frames`, then mix and encode with ffmpeg.
