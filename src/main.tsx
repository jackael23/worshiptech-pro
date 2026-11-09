import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

// 2026-11-09: each page type is its own chunk, so the phone remote and the projector / stage
// windows do not download the whole Simulator (PouchDB, PPT import, chat, …).
const App = lazy(() => import('./App.tsx'));
const OutputWindow = lazy(() => import('./components/OutputWindow').then((m) => ({default: m.OutputWindow})));
const RemoteControl = lazy(() => import('./components/RemoteControl').then((m) => ({default: m.RemoteControl})));
const StageScreen = lazy(() => import('./components/StageScreen').then((m) => ({default: m.StageScreen})));

// 2026-10-28 (Jarvis): ?output=main = projector / second-monitor window (only the LIVE screen).
const params = new URLSearchParams(location.search);
const isOutput = params.get('output') === 'main';
// 2026-11-08 (Mira): ?output=stage = Stage screen (TV for musicians / worship leaders, with chords).
const isStage = params.get('output') === 'stage';
// 2026-10-29 (Jarvis): ?remote = phone remote (same WiFi, through the local server).
const isRemote = params.has('remote');
// 2026-11-05 (Jarvis): tells the local server this laptop page is open; when every page
// is closed the server stops by itself (see registerAutoStop in server.ts). Phones skip it.
// Without the local server (e.g. Firebase Hosting) the request fails once and stops.
if (!isRemote && typeof EventSource !== 'undefined') new EventSource('/api/app/presence');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {isOutput ? <OutputWindow /> : isStage ? <StageScreen /> : isRemote ? <RemoteControl /> : <App />}
    </Suspense>
  </StrictMode>,
);
