import { useState } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import ColorModeButton from './ColorModeButton';
import { Event as Ev } from '../domain/event';

interface ObsScoresEditProps {
    playerId: number;
    event: Ev;
}

export default function ObsScoresEdit(props: ObsScoresEditProps) {
    const [max, setMax] = useState(6);
    const [mode, setMode] = useState<'bg' | 'title' | 'score' | 'active' | 'bubble'>('bg');
    const [bg, setBg] = useState('#00000055');
    const [title, setTitle] = useState('#ffffff');
    const [showTitle, setShowTitle] = useState(true);
    const [score, setScore] = useState('#fcc400');
    const [active, setActive] = useState('#ffa400');
    const [bubble, setBubble] = useState('#ffffff66');
    const [hex, setHex] = useState('#00000055');

    const onChangeMode = (mode: string) => {
        setMode(mode as 'bg' | 'title' | 'score' | 'active' | 'bubble');
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
          <div style={{fontSize:'1.6rem', fontWeight:'bold', flex:'1'}}>Side Scores Simple</div>

            <div style={{fontSize:'smaller'}}>
                browser source = <code style={{color:'gold'}}>320 width x 500 height</code>
            </div>
          </div>
          <p>Show the top scores of the current event (plus your score always).</p>
          
          <div style={{display:'flex'}}>
            <input
                type="text"
                readOnly
                value={`${window.location.protocol}//${window.location.host}/obs/scores/${props.playerId}`}
                style={{ flex: '1', width: '100%', marginRight: '1rem' }}
            />
            <a href={`${window.location.protocol}//${window.location.host}/obs/scores/${props.playerId}`} target="_blank" rel="noreferrer">Test in browser</a>
          </div>
          <h4>Customize</h4>
            <div>
                <input
                    type="text"
                    readOnly
                    value={`${window.location.protocol}//${window.location.host}/obs/scores/${props.playerId}?bg=${encodeColor(bg)}&score=${encodeColor(score)}&title=${encodeColor(title)}&active=${encodeColor(active)}&max=${max}&showTitle=${showTitle}`}
                    style={{ width: '100%' }}
                />
            </div>
            <div style={{ display: 'flex', marginBottom: '1rem' }}>
                <div>
                    <fieldset>
                        <input type="checkbox" id="showTitle" name="showTitle" defaultChecked={true} onChange={(e) => setShowTitle(e.target.checked)} />
                        <label htmlFor="showTitle">Show Short Event Title <small style={{opacity:0.7}}>ex: Hunt #30</small></label>
                    </fieldset>
                    <fieldset>
                    <label htmlFor="max">Max scores<strong style={{ textAlign:'center', display:'inline-block', fontSize: '1.4rem', width: '2rem' }}>{max}</strong></label>
                        <input type="range" required id="max" name="max" min="1" max="10" defaultValue={6} onChange={(e) => setMax(Number(e.target.value))} />
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
                    { ['bg', 'bubble'].includes(mode) && <HexAlphaColorPicker color={hex} onChange={(color) => { onChangeColor(color); }} />}
                    { ['score', 'title', 'active'].includes(mode) && <HexColorPicker color={hex} onChange={(color) => { onChangeColor(color); }} />}
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