import { requestPoiRedraw } from './poiIcons';

// The game's map-pin icons (Minimap.PinType) for a character's own pins on a
// run's map, drawn white like in game. Icons are currentColor SVGs: the pin
// set in public/img/Pins, plus the POI icons that double as pins.

const PIN_ICON: Record<string, string> = {
  Icon0: '/img/Pins/campfire.svg',
  Icon1: '/img/Pins/home.svg',
  Icon2: '/img/Pins/hammer.svg',
  Icon3: '/img/Pins/dot.svg',
  Icon4: '/img/Pins/portal.svg',
  Death: '/img/Pins/death.svg',
  Bed: '/img/Pins/bed.svg',
  Boss: '/img/Poi/boss.svg',
  Hildir1: '/img/Poi/hildir.svg',
  Hildir2: '/img/Poi/hildir.svg',
  Hildir3: '/img/Poi/hildir.svg',
  Memorial: '/img/Poi/memorial.svg',
};

const cache = new Map<string, HTMLImageElement>();

/** The pin's icon in `color` (null for a type with none); maps redraw once it has loaded. */
export function pinIcon(typeName: string, color = '#fff'): HTMLImageElement | null {
  const url = PIN_ICON[typeName];
  if (!url) return null;
  const key = url + '|' + color;
  let img = cache.get(key);
  if (!img) {
    const created = new Image();
    img = created;
    cache.set(key, created);
    fetch(url)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(svg => {
        created.onload = () => requestPoiRedraw();
        created.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.split('currentColor').join(color));
      })
      .catch(err => console.warn('[pinIcons] icon failed', url, err));
  }
  return img;
}
