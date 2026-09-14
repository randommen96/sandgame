import { E, ELEMENTS, SWATCH } from './elements.js';

// Toolbar order; also used for the 1-7 keyboard shortcuts.
export const ELEMENT_ORDER = [E.SAND, E.WATER, E.WOOD, E.FIRE, E.LAVA, E.WALL, E.EMPTY];

const MIN_BRUSH = 1;
const MAX_BRUSH = 8;

export function buildToolbar(container, state, actions) {
  container.innerHTML = '';

  // Element buttons.
  const els = document.createElement('div');
  els.className = 'group';
  for (const id of ELEMENT_ORDER) {
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
    els.appendChild(btn);
  }

  const sep1 = document.createElement('div');
  sep1.className = 'sep';

  // Brush size control.
  const brush = document.createElement('div');
  brush.className = 'group';
  const label = document.createElement('label');
  label.className = 'brush';
  label.textContent = 'Brush';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(MIN_BRUSH);
  slider.max = String(MAX_BRUSH);
  slider.step = '1';
  slider.value = String(state.brushRadius);
  slider.id = 'brush';
  const sizeOut = document.createElement('span');
  sizeOut.className = 'brush-size';
  sizeOut.textContent = String(state.brushRadius);
  label.append(slider, sizeOut);
  slider.addEventListener('input', () => {
    state.brushRadius = Number(slider.value);
    sizeOut.textContent = slider.value;
  });
  brush.appendChild(label);

  const sep2 = document.createElement('div');
  sep2.className = 'sep';

  // Simulation controls.
  const ctrl = document.createElement('div');
  ctrl.className = 'group';
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'ctl';
  pauseBtn.id = 'btn-pause';
  pauseBtn.textContent = 'Pause';
  pauseBtn.addEventListener('click', () => actions.onPauseToggle());
  const stepBtn = document.createElement('button');
  stepBtn.className = 'ctl';
  stepBtn.id = 'btn-step';
  stepBtn.textContent = 'Step';
  stepBtn.addEventListener('click', () => actions.onStep());
  const clearBtn = document.createElement('button');
  clearBtn.className = 'ctl';
  clearBtn.id = 'btn-clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => actions.onClear());
  ctrl.append(pauseBtn, stepBtn, clearBtn);

  container.append(els, sep1, brush, sep2, ctrl);
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

// Keep the pause button label in sync with the run state.
export function setPausedUI(paused) {
  const btn = document.getElementById('btn-pause');
  if (btn) btn.textContent = paused ? 'Resume' : 'Pause';
}

// Sync the brush slider + readout after keyboard changes.
export function syncBrushSlider(radius) {
  const slider = document.getElementById('brush');
  if (!slider) return;
  slider.value = String(radius);
  const out = slider.parentElement.querySelector('.brush-size');
  if (out) out.textContent = String(radius);
}

export { MIN_BRUSH, MAX_BRUSH };
