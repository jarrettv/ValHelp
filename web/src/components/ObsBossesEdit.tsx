import { useState } from 'react';
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful';
import ColorModeButton from './ColorModeButton';
import { BossesView } from '../Obs2Bosses';
import { DEMO_RUN } from '../obsBosses';

type Mode = 'bg' | 'accent' | 'check' | 'text';

/** Setup card on /auth/obs for the speedrun boss strip (/obs2/bosses/{code}). */
export default function ObsBossesEdit(props: { obsCode?: string }) {
  const [scale, setScale] = useState(1);
  const [mode, setMode] = useState<Mode>('bg');
  const [colors, setColors] = useState<Record<Mode, string>>({ bg: '#00000066', accent: '#fcc400', check: '#3ddc5a', text: '#ffffff' });

  const params = new URLSearchParams();
  if (scale !== 1) params.set('scale', String(scale));
  params.set('bg', colors.bg);
  params.set('accent', colors.accent);
  params.set('check', colors.check);
  params.set('text', colors.text);

  const base = props.obsCode ? `${window.location.protocol}//${window.location.host}/obs2/bosses/${props.obsCode}` : '';
  const url = base ? `${base}?${params.toString()}` : '';
  // A tile is 5.4em wide at 13px, eight of them plus gaps.
  const width = Math.ceil((8 * 5.4 * 13 + 7 * 0.25 * 13 + 0.6 * 13) * scale);
  const height = Math.ceil(72 * scale);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 'bold', flex: '1' }}>Speedrun Bosses</div>
        <div style={{ fontSize: 'smaller' }}>
          browser source = <code style={{ color: 'gold' }}>{width} width x {height} height</code>
        </div>
      </div>
      <p>
        A strip of every boss for the bottom of your stream. Before the kill it shows whether the boss is
        found (a Vegvisir pin) and the summon items still needed; after, a green check. It follows your
        latest tracked run, so the <a href="/tracker">ValHelp Tracker</a> must be running, and it updates
        each time the game saves.
      </p>

      <div style={{ display: 'flex' }}>
        <input type="text" readOnly value={url} style={{ flex: '1', width: '100%', marginRight: '1rem' }} />
        <a href={url} target="_blank" rel="noreferrer">Test in browser</a>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', margin: '1rem 0' }}>
        <div>
          <fieldset>
            <label htmlFor="ob-scale">Size<strong style={{ display: 'inline-block', width: '3rem', textAlign: 'center' }}>{scale}×</strong></label>
            <input type="range" id="ob-scale" min="0.75" max="2.5" step="0.25" value={scale} onChange={e => setScale(Number(e.target.value))} />
          </fieldset>
          <div>
            <ColorModeButton mode="bg" currentMode={mode} color={colors.bg} label="Background" onChangeMode={m => setMode(m as Mode)} />
            <ColorModeButton mode="accent" currentMode={mode} color={colors.accent} label="Found / Ready" onChangeMode={m => setMode(m as Mode)} />
            <ColorModeButton mode="check" currentMode={mode} color={colors.check} label="Defeated" onChangeMode={m => setMode(m as Mode)} />
            <ColorModeButton mode="text" currentMode={mode} color={colors.text} label="Text" onChangeMode={m => setMode(m as Mode)} />
          </div>
        </div>
        <div>
          {mode === 'bg'
            ? <HexAlphaColorPicker color={colors.bg} onChange={c => setColors({ ...colors, bg: c })} />
            : <HexColorPicker color={colors[mode]} onChange={c => setColors({ ...colors, [mode]: c })} />}
        </div>
      </div>

      <h4>Preview <small style={{ fontWeight: 'normal', opacity: 0.7 }}>(sample run)</small></h4>
      <div style={{ overflowX: 'auto', padding: '0.5rem', borderRadius: '0.5rem', background: 'repeating-conic-gradient(#3a3a3a 0 25%, #2a2a2a 0 50%) 0 0 / 20px 20px' }}>
        <BossesView run={DEMO_RUN} params={params} />
      </div>
    </div>
  );
}
