export const PlayerPenalty = (props: { code: string }) => {
  const { code } = props;
  return (
    <div className="penalty">
      <img src={`/img/penalties/${code}.webp`} alt={code} />
    </div>
  );
};