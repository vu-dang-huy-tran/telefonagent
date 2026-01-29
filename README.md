<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# UKK IT‑Service Telefonagent

Frontend (Vite/React) + Backend (WebSocket‑Proxy zu Gemini Live) in einem Projekt.

## Voraussetzungen

- Node.js 20+
- Gemini API Key (oder Vertex AI Setup)

## Lokaler Start (Frontend + Backend)

1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Umgebungsvariable setzen:
   ```bash
   export GEMINI_API_KEY="<dein_key>"
   ```
   Unter Windows (PowerShell):
   ```powershell
   $env:GEMINI_API_KEY="<dein_key>"
   ```
3. Beide Services starten:
   ```bash
   npm run dev:all
   ```

Frontend: http://localhost:3000
Backend WebSocket: ws://localhost:3001/ws

## Wichtige Variablen

- `GEMINI_API_KEY`: API‑Key für Gemini Live
- `PORT`: Port für Backend (Default: 3001)
- `VOICE_WS_PATH`: WebSocket Pfad (Default: /ws)
- `DEBUG_WS`: Debug‑Logs (Default: true)

## Architektur

- Frontend sendet PCM‑Audio (16 kHz) via WebSocket an das Backend.
- Backend öffnet eine Gemini Live Session und streamt Audio/Tools zurück.

## Docker / Cloud Run

Build:
```bash
docker build -t it-service-agent .
```

Run lokal:
```bash
docker run -p 8080:8080 -e GEMINI_API_KEY="<dein_key>" it-service-agent
```

Cloud Run nutzt Port `8080` automatisch. Frontend & Backend laufen gemeinsam in einem Container.
