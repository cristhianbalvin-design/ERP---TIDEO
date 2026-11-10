import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationalApp } from './OperationalApp.jsx';
import { AsistenteErpProvider } from '../../src/context/AsistenteErpContext.jsx';
import './styles.css';
import '../../src/aria_asistente.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><AsistenteErpProvider><OperationalApp /></AsistenteErpProvider></React.StrictMode>,
);
