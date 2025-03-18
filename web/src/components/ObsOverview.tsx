import "./Obs.css";
import { Event } from '../domain/event';
import { PlayerTrophy } from "./PlayerTrophy";
import { PlayerPenalty } from "./PlayerPenalty";

interface ObsFinalProps {
    playerId: number;
    event: Event;
    bg?: string;
    title?: string;
    place?: string;
    score?: string;
    active?: string;
    max?: number;
}

export default function ObsOverview(props: ObsFinalProps) {
    const player = props.event.players.find(player => player.userId === props.playerId);
    if (!player) {
        return 'No player';
    }

    let topPlayers = props.event.players.sort((a, b) => b.score - a.score).slice(0, props.max ?? 7);
    if (!topPlayers.find(player => player.userId === props.playerId)) {
        topPlayers.pop();
        topPlayers.push(player);
    }

    function getPlaceSuffix(arg0: number): string {
        if (arg0 == 1) {
            return "st";
        } else if (arg0 == 2) {
            return "nd";
        } else if (arg0 == 3) {
            return "rd";
        } else {
            return "th";
        }
    }

    return (
        <div className="obs-final" style={{ backgroundColor: props.bg ?? 'transparent' }}>
            <div className="obs-title" style={{ color: props.title ?? '#fff' }}>
                {props.event.name}
            </div>
            <div className="obs-final-players">
                {topPlayers.map((player, index) => (
                    <div key={player.userId} className={`obs-player ${player.userId === props.playerId ? 'active' : ''}`}>
                        <div className="obs-player-info">
                            <div>
                                <div className="obs-place">
                                    {index + 1}<small>{getPlaceSuffix(index + 1)}</small>
                                </div>
                            </div>
                            <div className="obs-avatar">
                                <img src={player.avatarUrl} alt={`${player.userId}`} />
                            </div>
                            <div>
                                <div className="obs-name">
                                    {player.name}
                                </div>
                                <div className="obs-text">
                                    {props.playerId != player.userId && <div className="num score" style={{ color: props.score ?? '#fcc400' }}>{player.score}</div>}
                                    {props.playerId == player.userId && <div className="num score" style={{ color: props.active ?? '#fe9200' }}>{player.score}</div>}
                                </div>
                            </div>
                        </div>

                        <div className="player-logs">
                            {player.logs
                                .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                                .map((log, index) =>
                                    log.code.startsWith("Trophy") ? <PlayerTrophy key={index} code={log.code} /> :
                                        log.code.startsWith("Penalty") ? <PlayerPenalty key={index} code={log.code} /> : null
                                )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}