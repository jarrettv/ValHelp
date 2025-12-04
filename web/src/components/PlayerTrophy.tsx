export const PlayerTrophy = (props: { code: string }) => {
  const { code } = props;
  return (
    <div className="trophy">
      <img src={`/img/Trophy/${code}.png`} alt={code} />
    </div>
  );
};