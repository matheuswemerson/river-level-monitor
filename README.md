# River Level Monitor

A low-cost IoT prototype that measures water level with magnetic float sensors, sends the readings from an ESP32 to a Node.js/MySQL API, and shows them on a live web dashboard and on a small touchscreen display.

Built as a vocational high school project funded by a **FACEPE Innovation Grant (BFI)**, aimed at flood monitoring for rivers in the Recife metropolitan area. The prototype was tested on a water-tank mock-up that simulates a river.

<!-- Add a screenshot or GIF of the dashboard here, e.g. ![Dashboard](docs/dashboard.png) -->

## How it works

```
Float + magnet ──► Reed/magnetic sensors ──► ESP32 ──HTTP POST──► Node.js API ──► MySQL
                    (25 / 50 / 75 / 100 %)                            │
                                                                      ├──► Web dashboard (gauge, history, alerts, map)
                                                                      └──► ESP32 touchscreen display (gauge + calendar)
```

A float with a magnet rises along a column. Each time it passes one of four sensors (25%, 50%, 75%, 100%), the ESP32 detects the level change and posts it to the API. The dashboard and the display poll the API every few seconds.

## Features

- Live water-level gauge with color-coded status (safe / moderate / flood risk)
- History charts (last 7 days, 30 days, or all time) and daily readings list
- Active alerts list (sites whose last reading is at 50% or above)
- Interactive map of monitoring sites (Leaflet) and per-site details
- Optional browser notifications for new readings
- Admin area (login required) to create, edit and delete monitoring sites
- ESP32 firmware that only sends when the level changes and retries if the request fails
- ESP32 touchscreen display (LVGL) with gauge, status and calendar

## Tech stack

| Area | Tools |
|------|-------|
| Hardware | ESP32, magnetic float level sensors (4 levels), Arduino IDE, Tinkercad (prototyping) |
| Firmware | C++ (Arduino framework), `WiFi`, `HTTPClient`, LVGL, TFT_eSPI, ArduinoJson |
| Backend | Node.js, Express 5, mysql2 |
| Database | MySQL / MariaDB |
| Frontend | HTML, CSS, JavaScript, Chart.js, Leaflet |

## Project structure

```
river-level-monitor/
├── server/              Node.js API + static web dashboard (server/public)
├── firmware/
│   ├── esp32-sensor/    Reads the 4 sensors and posts levels to the API
│   └── cyd-display/     ESP32 touchscreen dashboard (LVGL)
├── database/schema.sql  Tables and sample data
└── docs/                Photos, wiring diagram, screenshots
```

## Hardware

- ESP32 board
- 4 magnetic (reed-type) sensor modules, outputs read on GPIO **27, 14, 12, 13** (25%, 50%, 75%, 100%); the modules output HIGH when the magnet is detected
- Float with a magnet inside a vertical column
- ESP32 touchscreen board for the display (`cyd-display`)

## Getting started

### 1. Database

Import `database/schema.sql` into MySQL/MariaDB (phpMyAdmin or the `mysql` CLI). It creates the `tanque_db` database with two sample sites and one admin user (`admin` / `123456`).

> Change the sample password: `node server/scripts/hash-password.js <new-password>` generates a hash to put in the `usuarios.senha` column.

### 2. Server

```bash
cd server
cp .env.example .env     # fill in your database credentials
npm install
npm run dev              # or: npm start
```

Open `http://localhost:3000`.

Also set in `.env`:
- `ADMIN_TOKEN_SECRET`: a long random string used to sign admin login tokens (if empty, a temporary one is generated and admin sessions end when the server restarts).
- `DEVICE_API_KEY` (optional): only requests with this key in the `x-api-key` header can post readings, so set the same key in the ESP32 `secrets.h`.

### 3. Firmware

1. In `firmware/esp32-sensor/` copy `secrets.example.h` to `secrets.h` and fill in your Wi-Fi, the server IP (your computer's local IP) and the optional API key.
2. Open the `.ino` in the Arduino IDE, select your ESP32 board and upload.
3. Do the same for `firmware/cyd-display/` if you use the display (it also needs the LVGL, TFT_eSPI, XPT2046_Touchscreen and ArduinoJson libraries).

### 4. Try the API

`server/test.http` has ready-to-run requests (VS Code REST Client extension).

## API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/locais` | Sites with last level and total readings |
| GET | `/api/leituras?local_id=1` | Readings from the most recent day of a site |
| GET | `/api/leituras/:date` | Readings of a given day (`YYYY-MM-DD`) |
| GET | `/api/todas-leituras?local_id=1&dias=7` | Full history, optionally limited to the last N days |
| GET | `/api/alertas-atuais` | Sites whose last level is >= 50% |
| POST | `/api/leituras` | New reading `{ "nivel": 0-100, "local_id": 1 }` (header `x-api-key` if configured) |
| POST | `/api/login` | Admin login, returns a signed session token |
| POST / PUT / DELETE | `/api/admin/locais[/:id]` | Manage sites (header `Authorization: Bearer <token>`) |

## Known limitations

This is a school prototype, and these are the next steps I would take:

- Admin auth is deliberately simple: one role, an 8-hour signed token stored in `localStorage`, no login rate limiting and no password-change screen.
- Level is discrete (4 sensors), and there is no "below 25%" state: when the float is between sensors, the last level is kept.
- If the Wi-Fi is down, readings are not stored on the device; only the latest level is retried.
- Communication is plain HTTP, without HTTPS.
- No automated tests.
- The dashboard polls the API instead of using WebSockets.

## My role

I worked on the hardware prototyping, the ESP32/Arduino firmware, the REST API and the web dashboard, as a FACEPE BFI fellow (Jul-Dec 2025).

## License

[MIT](LICENSE)
