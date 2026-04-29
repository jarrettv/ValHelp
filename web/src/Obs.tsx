import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import ObsOverviewEdit from "./components/ObsOverviewEdit";
import ObsScoreEdit from "./components/ObsScoreEdit";
import ObsScoresEdit from "./components/ObsScoresEdit";
import { useAuth } from "./contexts/AuthContext";
import { Event as Ev } from "./domain/event";

interface ObsProfile {
  id: number;
  username: string;
  avatarUrl: string;
  obsSecretCode: string;
}

export default function Obs() {
  const { status } = useAuth();
  const { data: profile } = useQuery<ObsProfile>({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth/profile').then(res => res.json()),
    enabled: !!status?.isActive,
  });

  if (!status?.isActive) {
    return (
      <div className="card" style={{ marginTop: ".8rem" }}>
        <div className="register-info">Please login to proceed</div>
      </div>
    );
  }

  const obsCode = profile?.obsSecretCode;
  const codeNeedsSetup = !obsCode || obsCode === 'CHANGEME';
  const exampleHost = `${window.location.protocol}//${window.location.host}`;
  const exampleUrl = codeNeedsSetup ? '' : `${exampleHost}/obs2/score/${obsCode}`;

  return (
    <section id="obs-tools">
      <div className="card">
        <p>
          <img style={{ float: 'left', margin: '0.4rem 1rem 1rem 0' }} width="32" height="32" src="https://obsproject.com/assets/images/new_icon_small-r.png" alt="obs" />
          Oden wants your viewers to be happy. Use and customize the following browser sources to enhance your OBS overlay.
        </p>

        <p>Your <strong>OBS secret code</strong> is included in each URL so they work for both public and private events. <strong style={{ color: 'red' }}>DO NOT SHARE</strong> these links with anyone.</p>

        {codeNeedsSetup ? (
          <div className="alert error" style={{ marginTop: '0.5rem' }}>
            ⚠️ You don't have an OBS secret code yet. <Link to="/auth/profile">Generate one in your profile</Link> to use OBS browser sources.
          </div>
        ) : (
          <p>For example:<br />
            <code style={{ color: 'gold', wordBreak: 'break-all' }}>{exampleUrl}</code>
          </p>
        )}
      </div>
      {!codeNeedsSetup && (
        <>
          <br />
          <ObsScoreEdit avatarUrl={status.avatarUrl} name={status.username} playerId={status.id} obsCode={obsCode} />
          <br />
          <ObsScoresEdit event={{} as Ev} playerId={status.id} obsCode={obsCode} />
          <br />
          <ObsOverviewEdit event={{} as Ev} playerId={status.id} obsCode={obsCode} />
        </>
      )}
    </section>
  );
}
