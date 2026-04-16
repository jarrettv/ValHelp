import ItemsPage from './ItemsPage';
import Feedback from '../../components/Feedback';
import {
  weaponsConfig,
  gearConfig,
  foodConfig,
  comfortConfig,
  enemiesConfig,
} from './pageConfigs';

export const WeaponsPage = () => <ItemsPage config={weaponsConfig} />;
export const GearPage = () => <ItemsPage config={gearConfig} />;
export const FoodPage = () => <ItemsPage config={foodConfig} />;
export const ComfortPage = () => <ItemsPage config={comfortConfig} />;
export const EnemiesPage = () => <ItemsPage config={enemiesConfig} />;

export const WeatherPage = () => (
  <div className="vh-items-detail">
    <div className="vh-stub">Weather and wind details coming soon</div>
    <Feedback />
  </div>
);
