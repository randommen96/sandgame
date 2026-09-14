import { E, ELEMENTS, SWATCH } from './elements.js';

// Toolbar: element buttons (extended per task as elements are implemented).
export function buildToolbar(container, state) {
  const order = [E.SAND, E.WATER, E.WOOD, E.FIRE, E.LAVA, E.WALL, E.EMPTY];
  container.innerHTML = '';
  for (const id of order) {
    const btn = document.createElement('button');
    btn.className = 'el';
    btn.dataset.element = id;
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = SWATCH[id];
    const label = document.createElement('span');
    label.textContent = ELEMENTS[id].name;
    btn.append(swatch, label);
    btn.addEventListener('click', () => selectElement(state, id));
    container.appendChild(btn);
  }
  refreshActive(container, state);
}

export function selectElement(state, id) {
  state.element = id;
  const container = document.getElementById('toolbar');
  if (container) refreshActive(container, state);
}

function refreshActive(container, state) {
  for (const btn of container.querySelectorAll('button.el')) {
    btn.classList.toggle('active', Number(btn.dataset.element) === state.element);
  }
}
