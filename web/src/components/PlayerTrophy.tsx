import { iconUrl } from '../guides/vh/data';

export const PlayerTrophy = (props: { code: string }) => {
  const { code } = props;
  return (
    <div className="trophy">
      <img src={iconUrl(code)} alt={code} />
    </div>
  );
};