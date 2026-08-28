import { parseConfigFromUrl } from './config.js';
import { renderMenu } from './render.js';

const root = document.getElementById('menu-root');
if (root) {
  renderMenu(root, parseConfigFromUrl());
}
