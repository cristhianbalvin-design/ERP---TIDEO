import React from 'react';
import { createRoot } from 'react-dom/client';
import { OperationalApp } from './OperationalApp.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><OperationalApp /></React.StrictMode>,
);
