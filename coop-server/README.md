# ACK Rivals co-op server

Small Cloudflare Worker that runs private 2-player rooms for ACK Rivals VR.

- Join: `wss://<worker address>/room/<CODE>?as=host` makes a room, `?as=guest` joins it.
- Codes are 4 letters from BCDFGHJKLMNPQRSTVWXZ (no vowels, so no words).
- First in is the host. Messages are passed to the other player as they are.
- Only the game's own site can connect. No chat, no names, nothing saved.

Deploys from GitHub with Cloudflare Workers Builds, root directory `coop-server`.
