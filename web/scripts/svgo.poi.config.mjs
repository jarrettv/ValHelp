// SVGO config for the map POI icons (web/public/img/Poi).
//
// Applied to copies only, never to the files in that folder: the build's
// copies in dist (poi-icons-plugin.ts) and uploads (poi-sync.mjs).
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
