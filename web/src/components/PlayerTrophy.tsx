export const PlayerTrophy = (props: { trophy: string }) => {
  const { trophy } = props;
  return (
    <div className="trophy">
      <img src={`/img/trophies/${trophy}.png`} alt={trophy} />
    </div>
  );
};