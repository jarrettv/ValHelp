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
    const [startAt, setStartAt] = useState(new Date(new Date().getTime() + 1000 * 10));
    const [endAt, setEndAt] = useState(new Date(new Date().getTime() + 1000 * 10));
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
            setStartAt(new Date(new Date().getTime() + 1000 * 10));
            setValue(0);
            setStatus('pre');
        } else if (mode === 'live') {
            setEndAt(new Date(new Date().getTime() + 1000 * 10));
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
        <div className="card">
          <div style={{display:'flex', alignItems:'baseline'}}>
            <div style={{fontSize:'1.6rem', fontWeight:'bold', flex:'1'}}>Score + Event Clock</div>

            <div style={{fontSize:'smaller'}}>
                browser source = <code style={{color:'gold'}}>500 width x 70 height</code>
            </div>
          </div>
          <p>Show your current score on screen along with a pre-clock and live clock.</p>
          
          <div style={{display:'flex'}}>
            <input
                type="text"
                readOnly
                value={`${window.location.protocol}//${window.location.host}/api/obs/score/${props.playerId}`}
                style={{ flex: '1', width: '100%', marginRight: '1rem' }}
            />
            <a href={`${window.location.protocol}//${window.location.host}/api/obs/score/${props.playerId}`} target="_blank" rel="noreferrer">Test in browser</a>
          </div>
          <h4>Customize</h4>
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
            <div>
                <input
                    type="text"
                    readOnly
                    value={`${window.location.protocol}//${window.location.host}/api/obs/score/${props.playerId}?bg=${encodeColor(bg)}&score=${encodeColor(score)}&pre=${encodeColor(pre)}&live=${encodeColor(live)}&post=${encodeColor(post)}`}
                    style={{ width: '100%' }}
                />
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