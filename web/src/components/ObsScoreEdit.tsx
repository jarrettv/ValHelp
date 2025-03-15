import { useState } from 'react';
import ObsScore from './ObsScore';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import ColorModeButton from './ColorModeButton';

interface ObsScoreEditProps {
    playerId: number;
    avatarUrl: string;
    name: string;
}

export default function ObsScoreEdit(props: ObsScoreEditProps) {
    const [status, setStatus] = useState<'pre' | 'live' | 'post'>('pre');
    const [startAt, setStartAt] = useState(new Date(new Date().getTime() + 1000 * 30));
    const [endAt, setEndAt] = useState(new Date(new Date().getTime() + 1000 * 60));
    const [value, setValue] = useState(0);
    const [mode, setMode] = useState<'bg' | 'score' | 'pre' | 'live' | 'post'>('bg');
    const [bg, setBg] = useState('#00000055');
    const [score, setScore] = useState('#fcc400');
    const [pre, setPre] = useState('#fe9200');
    const [live, setLive] = useState('#a4dd00');
    const [post, setPost] = useState('#68ccca');
    const [hex, setHex] = useState('#00000055');

    const onChangeMode = (mode: string) => {
        setMode(mode as 'bg' | 'score' | 'pre' | 'live' | 'post');
        setHex(mode === 'bg' ? bg + '55' : mode === 'score' ? score : mode === 'pre' ? pre : mode === 'live' ? live : post);
        if (mode === 'pre') {
            setStartAt(new Date(new Date().getTime() + 1000 * 30));
            setValue(0);
            setStatus('pre');
        } else if (mode === 'live') {
            setEndAt(new Date(new Date().getTime() + 1000 * 30));
            setValue(950);
            setStatus('live');
        } else if (mode === 'post') {
            setValue(1050);
            setStatus('post');
        }
    }

    const onChangeColor = (color: string) => {
        setHex(color);
        console.debug(mode, color);
        if (mode === 'bg') {
            setBg(color);
        }
        if (mode === 'score') {
            setScore(color);
        }
        if (mode === 'pre') {
            setPre(color);
        }
        if (mode === 'live') {
            setLive(color);
        }
        if (mode === 'post') {
            setPost(color);
        }
    }

    const encodeColor = (color: string) => {
        return color.replace('#', '%23');
    }

    return (
        <div>
            <div>
                <input
                    type="text"
                    readOnly
                    value={`https://valheim.help/api/players/${props.playerId}/score?bg=${encodeColor(bg)}&score=${encodeColor(score)}&pre=${encodeColor(pre)}&live=${encodeColor(live)}&post=${encodeColor(post)}`}
                    style={{ width: '100%' }}
                />
            </div>
            <div style={{ display: 'flex', marginBottom: '1rem' }}>
                <div>
                    <div>
                        <ColorModeButton mode="bg" currentMode={mode} color={bg} label="Background" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="score" currentMode={mode} color={score} label="Score" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="pre" currentMode={mode} color={pre} label="Pre-Clock" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="live" currentMode={mode} color={live} label="Live Clock" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="post" currentMode={mode} color={post} label="Final" onChangeMode={onChangeMode} />
                    </div>
                </div>
                <div>
                    {mode === 'bg' && <HexAlphaColorPicker color={hex} onChange={(color) => { onChangeColor(color); }} />}
                    {mode != 'bg' && <HexColorPicker color={hex} onChange={(color) => { onChangeColor(color); }} />}
                </div>
            </div>
            <ObsScore
                avatarUrl={props.avatarUrl}
                name={props.name}
                status={status}
                startAt={startAt}
                endAt={endAt}
                hours={4}
                value={value}
                bg={bg}
                score={score}
                pre={pre}
                live={live}
                post={post}
            />
        </div>
    );
}