// Regenera tiles-style.template.json (estilo MapLibre "light" do Protomaps, rótulos em pt).
//   npm i @protomaps/basemaps@5 && node gen-style.mjs > tiles-style.template.json
// __TILES_ORIGIN__ é trocado pelo domínio de tiles em geo-prepare.sh.
import { layers, namedFlavor } from '@protomaps/basemaps';

const style = {
  version: 8,
  name: 'OpenDriver',
  glyphs: '__TILES_ORIGIN__/fonts/{fontstack}/{range}.pbf',
  sprite: '__TILES_ORIGIN__/sprites/v4/light',
  sources: {
    protomaps: {
      type: 'vector',
      url: '__TILES_ORIGIN__/centro-oeste.json',
      attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    },
  },
  layers: layers('protomaps', namedFlavor('light'), { lang: 'pt' }),
};
console.log(JSON.stringify(style));
