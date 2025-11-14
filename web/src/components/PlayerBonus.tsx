export const PlayerBonus = (props: { code: string }) => {
  const { code } = props;
  return (
    <div className="bonus">
      <img src={`/img/bonuses/${code}.png`} alt={code} />
    </div>
  );
};