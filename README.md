# Nook

A cozy virtual study room where you focus alongside friends. Pick your vinyl-toy
avatar, join a room, start a focus timer, and study together in a warm,
Animal-Crossing-inspired space.

This is **v1**: the core study-together loop, running entirely on a local mock
backend (no external accounts or services required).

## Tech stack

- **React + TypeScript + Vite** — app shell and UI
- **Tailwind CSS** — warm, cozy design tokens (cream / sage / peach palette)
- **Phaser 3** — the live virtual study room (desks, plants, avatars, lamp glow)
- **Tauri 2** — desktop packaging (optional; see below)
- **Local mock backend** — `src/lib/mockBackend.ts` stands in for Supabase
  (auth + database + realtime) using `localStorage` and `BroadcastChannel`

## Getting started (web)

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:1420). Everything runs in the
browser — no backend setup needed.

### Try studying "together"

The mock backend syncs across browser tabs via `BroadcastChannel`:

1. Sign up and create a nook — note the room code.
2. Open a second browser tab/window, sign up as a different user, and **Join with
   the code**.
3. Start a focus timer in one tab and watch the other avatar light up its desk
   lamp and switch to a studying pose in real time.

## Building for desktop (Tauri)

Desktop bundling needs the Rust toolchain:

```bash
# install Rust first: https://rustup.rs
npm run tauri dev      # run as a native desktop window
npm run tauri build    # produce a distributable app
```

> Add an app icon at `src-tauri/icons/icon.png` before bundling.

## Project structure

```
src/
  pages/        Splash, Auth, Onboarding, Home, CharacterBuilder, StudyRoom
  components/   VinylAvatar, CharacterBuilder, PhaserRoom, FocusTimer, NookLogo
  game/         StudyRoomScene (Phaser)
  lib/          mockBackend, useAuth, avatarTypes, avatarCatalog
src-tauri/      Tauri 2 desktop shell
```

## App flow

Splash (Nook logo fade) → Login / Sign up
- **Log in** → Home
- **Sign up** → Create character → Home

Home → Create or Join a room → Study room (Phaser scene + synced focus timer).

## Avatar customization

v1 ships a single bare-bones vinyl-toy avatar. The character builder already
shows all five slots — **Expression, Clothing, Hats, Held Items, Shoes** — with
"Coming soon" placeholders. Adding real parts later means dropping art and
registering entries in `src/lib/avatarCatalog.ts`; the builder and Phaser
compositor pick them up automatically.

## Roadmap

See the planning doc for the full growth roadmap (friends, streaks,
achievements, accountability buddies, persistent personal nooks, and more).
