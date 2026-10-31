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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOutput ? <OutputWindow /> : isRemote ? <RemoteControl /> : <App />}
  </StrictMode>,
);
