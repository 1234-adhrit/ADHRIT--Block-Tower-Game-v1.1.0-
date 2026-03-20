# Block Tower

Stack blocks, chase perfect drops, and compete with friends online. Play solo anytime or host a multiplayer room.

## How To Run

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open the game in your browser:

```
http://localhost:3000/
```

## How To Play

- **Goal:** Place each moving block on top of the stack. If you miss completely, the tower falls and the run ends.
- **Perfects:** Land a block within a small threshold to keep the full size and build a perfect streak.
- **Score:** Each placed block adds 1 point. Higher scores unlock new skins.

### Controls

- **Mouse / Touch:** Click or tap to place the block.
- **Keyboard:** Press **Space** or **Enter** to place the block.

## Solo Play

1. You can leave the name field empty for solo play.
2. Click **Play Solo** to start.
3. Complete the **Daily Challenge** to unlock the Sunrise Drift skin.
4. Watch your last run using the **Replay** button after the game ends.

## Multiplayer (Online)

1. Enter a **Player Name** (required for online).
2. Use the **Server URL** field (auto‑fills when opened at `http://localhost:3000`).
3. Click **Create Server** to host a room, or enter a room code and click **Join**.
4. The host can change **Room Settings** (round time, win target, max players).
5. During a match, the leader panel shows room scores and rounds.
6. Use the **Room Chat** panel to talk with everyone in the room.
7. If you lose, you can **Spectate** remaining players.

## Replays

- After a run, click **Watch Replay** to view your last run.
- Click **Copy Replay Link** to share a replay URL.

## Achievements & Leaderboards

- Achievements track milestones like perfect streaks and match wins.
- Global leaderboards show the top scores submitted to your server.
- Room history shows recent match winners for the current room.

## Notes

- Leaderboards and room history are stored in memory and reset when the server restarts.
- Multiplayer requires everyone to use the same server URL.
- Chat is available only during multiplayer sessions.
