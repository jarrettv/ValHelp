import trophies from "../domain/trophies";
import "./Scoring.css";

export const Scoring = (props: { scoring: { [key: string]: number }}) => {
  const { scoring } = props;
  const penalties = Object.keys(scoring).filter(key => key.startsWith("Penalty"));
  return (<>
    <h3 style={{margin:"0 0.3rem"}}>Scoring</h3>
    <div className="scoring">
      {penalties.map(penalty => (<PenaltyScore key={penalty} code={penalty} name={penalty} score={scoring[penalty]} />))}
      {trophies.map(trophy => (<TrophyScore key={trophy.code} code={trophy.code} name={trophy.name} score={scoring[trophy.code]} />))}
    </div>
    </>
  );
};


const PenaltyScore = (props: { code: string, name: string, score: number }) => {
  const { code, name, score } = props;
  return (
    <div className="item">
      <img src={`/img/penalties/${code}.webp`} alt={name} />
      <div className="score-val penalty">{score}</div>
    </div>
  );
}

const TrophyScore = (props: { code: string, name: string, score: number }) => {
  const { code, name, score } = props;
  return (
    <div className="item">
      <img src={`/img/trophies/${code}.png`} alt={name} />
      <div className="score-val">{score}</div>
    </div>
  );
}