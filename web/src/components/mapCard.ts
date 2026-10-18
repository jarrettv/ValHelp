// Shared placement for the small cards shown over the world map (POI and
// biome variant): right of and below the point, flipped near the right/bottom
// edges so the card stays inside the map. Styles: MapCard.css (.map-card).

export const MAP_CARD_W = 232;
const OFFSET = 16;

export function placeCard(x: number, y: number, estH: number, width: number, height: number) {
  const left = x + OFFSET + MAP_CARD_W > width ? Math.max(4, x - OFFSET - MAP_CARD_W) : x + OFFSET;
  const top = y + OFFSET + estH > height ? Math.max(4, Math.min(y - OFFSET - estH, height - estH - 4)) : y + OFFSET;
  return { left, top, width: MAP_CARD_W };
}
