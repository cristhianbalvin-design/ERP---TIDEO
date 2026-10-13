import React from 'react';
import { openWorkNav } from '../../workMode.js';

export function WorkMenuButton() {
  return <button type="button" className="dx-work-menu-button" aria-label="Abrir menu" onClick={openWorkNav}>☰</button>;
}
