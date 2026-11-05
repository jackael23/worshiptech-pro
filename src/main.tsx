import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {OutputWindow} from './components/OutputWindow';
import {RemoteControl} from './components/RemoteControl';
import './index.css';

// 2026-10-28 (Jarvis): ?output=main = projector / second-monitor window (only the LIVE screen).
const params = new URLSearchParams(location.search);
const isOutput = params.get('output') === 'main';
// 2026-10-29 (Jarvis): ?remote = phone remote (same WiFi, through the local server).
const isRemote = params.has('remote');
// 2026-11-05 (Jarvis): tells the local server this laptop page is open; when every page
// is closed the server stops by itself (see registerAutoStop in server.ts). Phones skip it.
// Without the local server (e.g. Firebase Hosting) the request fails once and stops.
if (!isRemote && typeof EventSource !== 'undefined') new EventSource('/api/app/presence');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOutput ? <OutputWindow /> : isRemote ? <RemoteControl /> : <App />}
  </StrictMode>,
);
