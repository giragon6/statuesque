# Statuesque 𓀤

***Playable URL:***

A pose-memory game where the player **watches a sequence of poses from Greeko-Roman Gods and then tries to copy them** in front of their webcam. Each level adds one more pose to the sequence.

## What the Game Does

- Tells a cool and whimsical story for context
- With a click of the START button, displays poses of Gods one at a time with a 3 second countdown
- Switches to webcam mode and counts down again to capture your poses
- After 5 levels, shows:
  - The accuracy of your poses
  - All captured frames
  - A restart button

## Reflections

### Why We Made This

This project is a part of the Parthenon Hackathon hosted by Hack Club. We wanted to build something interactive and thematically connected to Parthenon (Greek temple) that combined React frontend and UI with pose detection features.

*(Also, pose-detection games are objectively funny to watch people play ;)*

### How We Built It

Our project is split into three main pieces:

**Frontend**: Handles the layout, central "game window", and overall page structure and style;

**Pose Detection**: Uses MediaPipe to compare user's webcame pose to the target poses from images of Greko-Roman Gods;

**Game Logic**: Responsible for level logic, countdown timers, switching between phases, turning the webcam on/off, capturing frames and revealing results.

### What We Struggled With

**Finding the right pose-detection parameters**: Getting the pose-detection model to respond accurately took more trial and error than expected;

**Coordinating all the different React components**: Our project uses several moving parts: game logic, UI, webcam streaming, and pose detection;

**Setting up the leaderboard database**: We wanted a leaderboard to save player scores, but connecting a backend database, handling score submissions, and ensuring everything stored and retrieved was hard.

*Newly baked with love by Ruzanna, Emme and Afia!*