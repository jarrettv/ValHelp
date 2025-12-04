export const PlayerBonus = (props: { code: string }) => {
  const { code } = props;
  return (
    <div className="bonus">
      <img src={`/img/Bonus/${code}.round.png`} alt={code} />
    </div>
  );
};