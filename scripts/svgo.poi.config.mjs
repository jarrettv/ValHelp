// SVGO config for the map POI icons (web/public/img/Poi).
//
//   npx svgo@3 --config scripts/svgo.poi.config.mjs -f web/public/img/Poi
//
// Icons draw at ~24px, so 2 decimal places is far below a pixel. viewBox must
// survive (the canvas scales icons through it), and currentColor must stay
// literal — poiIcons.ts substitutes it per type.
export default {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          convertColors: { currentColor: false },
        },
      },
    },
  ],
};
