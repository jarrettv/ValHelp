import ItemsPage from './ItemsPage';
import Feedback from '../../components/Feedback';
import SEO from '../../components/SEO';
import {
  weaponsConfig,
  gearConfig,
  foodConfig,
  comfortConfig,
  enemiesConfig,
} from './pageConfigs';

export const WeaponsPage = () => (
  <>
    <SEO
      title="Valheim Weapons — Stats, Damage, and Tier List"
      description="Full Valheim weapon reference: swords, axes, clubs, spears, bows, and staves with damage, durability, and upgrade costs."
      path="/guides/weapons"
    />
    <ItemsPage config={weaponsConfig} />
  </>
);

export const GearPage = () => (
  <>
    <SEO
      title="Valheim Gear — Armor, Shields, and Capes"
      description="Armor, shields, helmets, capes, and trinkets with block power, armor values, and crafting requirements for every tier."
      path="/guides/gear"
    />
    <ItemsPage config={gearConfig} />
  </>
);

export const FoodPage = () => (
  <>
    <SEO
      title="Valheim Food & Meads — Best Foods for Every Biome"
      description="Complete Valheim food and mead guide: health, stamina, and eitr values for every cooked dish from Meadows to Ashlands."
      path="/guides/food"
    />
    <ItemsPage config={foodConfig} />
  </>
);

export const ComfortPage = () => (
  <>
    <SEO
      title="Valheim Comfort — Build the Best Rested Bonus"
      description="Comfort values for every fire, bed, chair, table, carpet, and banner to maximize your Rested buff duration."
      path="/guides/comfort"
    />
    <ItemsPage config={comfortConfig} />
  </>
);

export const EnemiesPage = () => (
  <>
    <SEO
      title="Valheim Bestiary — Enemy Stats by Biome"
      description="Every Valheim creature's HP, damage resistances, drops, and trophy HP organized by biome from Meadows to Ashlands."
      path="/guides/enemies"
    />
    <ItemsPage config={enemiesConfig} />
  </>
);

export const WeatherPage = () => (
  <div className="vh-items-detail">
    <SEO
      title="Valheim Weather & Wind"
      description="Weather and wind patterns in Valheim."
      path="/guides/weather"
    />
    <div className="vh-stub">Weather and wind details coming soon</div>
    <Feedback />
  </div>
);
