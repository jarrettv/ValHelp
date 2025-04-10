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
    bubble?: string;
    max?: number;
}

export default function ObsOverview(props: ObsFinalProps) {
    const player = props.event.players.find(player => player.userId === props.playerId);
    if (!player) {
        return 'No player';
    }

    let topPlayers = props.event.players
        .filter(x => x.status >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, props.max ?? 7);
    if (!topPlayers.find(player => player.userId === props.playerId)) {
        topPlayers.pop();
        topPlayers.push(player);
    }
    
    function getPlace(playerId: number):number {
        const uniqueScores = Array.from(new Set(props.event.players.map(player => player.score))).sort((a, b) => b - a);
        const playerScore = props.event.players.find(player => player.userId === playerId)!.score;
        return uniqueScores.indexOf(playerScore) + 1;
    }
        

    function getPlaceSuffix(playerId: number): string {
        var place = getPlace(playerId);
        if (place == 1) {
            return "st";
        } else if (place == 2) {
            return "nd";
        } else if (place == 3) {
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
                {topPlayers.map((player) => (
                    <div key={player.userId} className="obs-player" style={{ backgroundColor: player.userId != props.playerId ? 'transparent' : props.bubble ?? '#fff6'}}>
                        <div className="obs-player-info">
                            <div>
                                <div className="obs-place">
                                    {getPlace(player.userId)}<small>{getPlaceSuffix(player.userId)}</small>
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