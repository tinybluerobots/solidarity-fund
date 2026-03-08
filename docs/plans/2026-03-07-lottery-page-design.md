# Lottery Page Design

## Overview

Admin web UI at `/lottery` for managing the monthly lottery lifecycle: opening/closing the application window and running the draw.

## UI States

| Lottery State   | Display                          | Action                                                    |
|-----------------|----------------------------------|-----------------------------------------------------------|
| `initial`       | "No window open for {month}"     | "Open Applications" button                                |
| `open`          | "Applications open for {month}"  | "Close Applications" button                               |
| `windowClosed`  | "Window closed for {month}"      | Draw form (balance, reserve, grant amount) + "Run Draw"   |
| `drawn`         | "Lottery drawn for {month}"      | Link to `/applications?month={month}`                     |

## Components

1. **`src/domain/lottery/commandHandlers.ts`** — open/close/draw via CommandHandler + decider, stream = `lottery-{monthCycle}`
2. **`src/web/pages/lottery.ts`** — status card + context-sensitive action
3. **`src/web/routes/lottery.ts`** — GET list, POST open/close/draw
4. **Wire into `server.ts`**

## Draw Flow

- POST `/lottery/draw` with `{availableBalance, reserve, grantAmount}`
- Gathers accepted applications from repo as applicant pool
- Generates seed from `crypto.randomUUID()`
- Dispatches `DrawLottery` command
- Process manager updates each application status (selected/not_selected)
- Redirects to `/applications?month={month}`

## Constraints

- Any authenticated volunteer can trigger all actions (no admin restriction)
- No default values on draw form inputs
- Current month auto-selected
- No grants page yet — post-draw redirects to applications list
