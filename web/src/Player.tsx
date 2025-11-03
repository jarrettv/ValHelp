import React from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PlayerEvent, UserPlayer } from './domain/player';
import PlayerEventRow from './components/PlayerEventRow';
import Youtube from './components/Youtube';
import Twitch from './components/Twitch';



const fetchPlayer = async (userId: string): Promise<UserPlayer> => {
    const response = await fetch(`/api/players/${userId}`);
    if (!response.ok) {
        throw new Error('Error loading data');
    }
    return response.json();
};

const PlayerComponent: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const { data, error, isLoading, isError } = useQuery<UserPlayer>({
        queryKey: ['player', userId],
        queryFn: () => fetchPlayer(userId!),
    });

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (isError) {
        return <div>Error: {error.message}</div>;
    }

    const personalBests = groupByAndMax(data!.events, 'mode', 'score');

    return (
        <div className="competition">
            <div className="user-player-head">
                <img src={data!.avatarUrl} alt={data!.username} width="80" />
                <div style={{flex:1}}>
                    <h3>{data!.username}</h3>
                    <div className="user-player-channels">
                        {data!.youtube && <a href={data!.youtube} target="_blank"><Youtube width="30" height="30" style={{ verticalAlign: "middle", margin:'0 0.3rem' }} /><span>{data!.youtube.replace("https://www.youtube.com/", "").replace("https://youtube.com/", "")}</span></a>}
                        {data!.twitch && <a href={data!.twitch} target="_blank"><Twitch width="30" height="30" style={{ verticalAlign: "middle", margin:'0 0.3rem' }} /><span>{data!.twitch.replace("https://www.twitch.tv/", "").replace("https://twitch.tv/", "")}</span></a>}
                    </div>
                </div>
                <div>
                    {Object.entries(personalBests).map(([groupKey, bestScore]) => {
                        const [modePart, hoursPart = "0"] = groupKey.split("::");
                        const hoursLabel = Number(hoursPart) || 0;
                        const modeLabel = modePart.replace("Trophy", "").trim();
                        const label = `${modeLabel}${hoursLabel ? ` ${hoursLabel}h` : ""}`.trim();
                        return (
                            <div style={{display:'flex', justifyContent:'space-between', width:'6.5rem'}} key={groupKey}>
                                <div>{label} PB</div>
                                <div style={{color:'gold'}}>{bestScore}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {data!.events
                .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
                .map(event => (
                <PlayerEventRow key={event.eventId} player={event!} mode="logs" />
            ))}
        </div>
    );
};

function groupByAndMax(arr: PlayerEvent[], key: keyof PlayerEvent, valueKey: keyof PlayerEvent): { [key: string]: number } {
    const grouped = arr
        .filter((item) => !item.isPrivate)
        .reduce((acc: { [key: string]: PlayerEvent[] }, item) => {
            const baseKey = String(item[key]);
            const hours = Number(item.hours ?? 0);
            const normalizedHours = Number.isFinite(hours) ? Math.round(hours) : 0;
            const groupKey = `${baseKey}::${normalizedHours}`;
            acc[groupKey] = acc[groupKey] || [];
            acc[groupKey].push(item);
            return acc;
        }, {});

    const result: { [key: string]: number } = {};
    for (const groupKey in grouped) {
        if (grouped.hasOwnProperty(groupKey)) {
            result[groupKey] = grouped[groupKey].reduce((max, item) => Math.max(max, Number(item[valueKey])), -Infinity);
        }
    }
    return result;
}

export default PlayerComponent;