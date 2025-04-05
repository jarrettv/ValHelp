import { useState } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import ColorModeButton from './ColorModeButton';
import { Event as Ev } from '../domain/event';

interface ObsOverviewEditProps {
    playerId: number;
    event: Ev;
}

export default function ObsOverviewEdit(props: ObsOverviewEditProps) {
    const [max, setMax] = useState(9);
    const [mode, setMode] = useState<'bg' | 'title' | 'score' | 'active' | 'bubble'>('bg');
    const [bg, setBg] = useState('#00000055');
    const [bubble, setBubble] = useState('#ffffff55');
    const [title, setTitle] = useState('#ffffff');
    const [score, setScore] = useState('#fcc400');
    const [active, setActive] = useState('#ffa400');
    const [hex, setHex] = useState('#00000055');

    const onChangeMode = (mode: string) => {
        setMode(mode as 'bg' | 'title' | 'score' | 'active' | 'bubble' );
        setHex(mode === 'bg' ? bg : mode === 'title' ? title : mode === 'score' ? score : mode === 'active' ? active : bubble);
    }

    const onChangeColor = (color: string) => {
        setHex(color);
        console.debug(mode, color);
        if (mode === 'bg') {
            setBg(color);
        }
        if (mode === 'title') {
            setTitle(color);
        }
        if (mode === 'score') {
            setScore(color);
        }
        if (mode === 'active') {
            setActive(color);
        }
        if (mode === 'bubble') {
            setBubble(color);
        }
    }

    const encodeColor = (color: string) => {
        return color.replace('#', '%23');
    }

    return (
        <div className="card">
        <div style={{display:'flex', alignItems:'baseline'}}>
          <div style={{fontSize:'1.6rem', fontWeight:'bold', flex:'1'}}>Event Overview</div>

            <div style={{fontSize:'smaller'}}>
                browser source = <code style={{color:'gold'}}>1500 or 1000 width x 900 height</code>
            </div>
          </div>
          <p>Show the top scores of the current event and each player placement.</p>
          
          <div style={{display:'flex'}}>
            <input
                type="text"
                readOnly
                value={`${window.location.protocol}//${window.location.host}/obs/overview/${props.playerId}`}
                style={{ flex: '1', width: '100%', marginRight: '1rem' }}
            />
            <a href={`${window.location.protocol}//${window.location.host}/obs/overview/${props.playerId}`} target="_blank" rel="noreferrer">Test in browser</a>
          </div>
          <h4>Customize</h4>
            <div style={{display:'flex'}}>
                <input
                    type="text"
                    readOnly
                    value={`${window.location.protocol}//${window.location.host}/obs/overview/${props.playerId}?bg=${encodeColor(bg)}&score=${encodeColor(score)}&title=${encodeColor(title)}&active=${encodeColor(active)}&bubble=${encodeColor(bubble)}&max=${max}`}
                    style={{ flex: '1', width: '100%', marginRight: '1rem' }}
                />
            <a href={`${window.location.protocol}//${window.location.host}/obs/overview/${props.playerId}?bg=${encodeColor(bg)}&score=${encodeColor(score)}&title=${encodeColor(title)}&active=${encodeColor(active)}&bubble=${encodeColor(bubble)}&max=${max}`} target="_blank" rel="noreferrer">Test in browser</a>
            </div>
            <div style={{ display: 'flex', marginBottom: '1rem' }}>
                <div>
                    <fieldset>
                        <label htmlFor="max">Max players<strong style={{ textAlign:'center', display:'inline-block', fontSize: '1.4rem', width: '2rem' }}>{max}</strong></label>
                        <input type="range" required id="max" name="max" min="3" max="13" defaultValue={9} onChange={(e) => setMax(Number(e.target.value))} />
                    </fieldset>
                    <div>
                        <ColorModeButton mode="bg" currentMode={mode} color={bg} label="Background" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="score" currentMode={mode} color={score} label="Score" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="title" currentMode={mode} color={title} label="Event Title" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="active" currentMode={mode} color={active} label="Your Score" onChangeMode={onChangeMode} />
                        <ColorModeButton mode="bubble" currentMode={mode} color={bubble} label="Your Bubble" onChangeMode={onChangeMode} />
                    </div>
                </div>
                <div>
                    {['bg', 'bubble'].includes(mode) && <HexAlphaColorPicker color={hex} onChange={(color) => { onChangeColor(color); }} />}
                    {['score', 'title', 'active'].includes(mode) && <HexColorPicker color={hex} onChange={(color) => { onChangeColor(color); }} />}
                </div>
            </div>
            {/* <ObsScores
                playerId={props.playerId}
                event={props.event}
                bg={bg}
                title={title}
                score={score}
                active={active}
                max={max}
            /> */}
        </div>
    );
}