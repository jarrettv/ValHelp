import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Player } from "../domain/event";
import { FormEvent, useEffect, useRef, useState } from "react";
import ChannelLink from "./ChannelLink";
interface RegisterProps {
  eventId: number;
  player?: Player;
  /** Controlled by the page so the "Edit entry" button on the viewer's own
   *  row in the player list can open the form. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}
export default function Register({ eventId, player, editing, onEditingChange }: RegisterProps) {
  const { status: userStatus } = useAuth();
  const queryClient = useQueryClient();
  const [localEditing, setLocalEditing] = useState(false);
  const showForm = editing ?? localEditing;
  const setShowForm = (v: boolean) => { setLocalEditing(v); onEditingChange?.(v); };
  const cardRef = useRef<HTMLDivElement>(null);
  // Opened from a row further down the page: bring the form into view.
  useEffect(() => {
    if (showForm) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [showForm]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formObject = Object.fromEntries(formData.entries());
    mutation.mutate(formObject as any);
  };

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const response = await fetch(`/api/events/${eventId}/players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        var problem = await response.json();
        var msg = problem.detail;
        if (!msg && problem.errors) {
          msg = Object.values(problem.errors).flat().join(', ');
        }
        throw new Error(msg || 'Registration failed');
      } else {
        queryClient.invalidateQueries({ queryKey: ['event', eventId] });
        setShowForm(false);
      }
    },
  });

  if (!userStatus?.isActive) {
    return (
      <div className="card" style={{ marginTop: ".8rem" }}>
        <div className="register-info">Please login to register for this event</div>
      </div>
    );
  }

  // Registered: nothing to show here. Your row in the player list carries the
  // "You" tag and its own "Edit entry" button.
  const registered = !!player && player.status >= 0;
  if (registered && !showForm) return null;

  return (
    <div className="card" style={{ marginTop: ".8rem" }} ref={cardRef}>
      {!showForm && (
        <div className={`reg-status${player ? (player.status >= 0 ? ' in' : ' out') : ''}`}>
          <img className="reg-avatar" src={userStatus!.avatarUrl} alt="" />
          <div className="reg-text">
            <div className="reg-label">Your entry</div>
            {player && player.status < 0 && <div>You've withdrawn from this event.</div>}
            {!player && <div>Odin wants you to play.</div>}
          </div>
          <button className="reg-action primary" onClick={() => setShowForm(true)}>
            {player ? 'Rejoin' : 'Register'}
          </button>
        </div>
      )}
      {showForm && (
        <form onSubmit={handleSubmit}>
          <div className="reg-label" style={{ marginBottom: '0.4rem' }}>Your entry</div>
          {mutation.isIdle && (
            <div className="alert">By registering for this event, you agree to the rules below</div>
          )}
          {mutation.isError && (
            <div className="alert error" onClick={() => mutation.reset()}>⛔ {mutation.error.message ?? "Failed"}</div>
          )}
          {mutation.isPending && (
            <div className="alert">Saving...</div>
          )}
          <input type="hidden" name="userId" value={userStatus!.id} />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={userStatus!.avatarUrl} alt={userStatus!.username} style={{ width: '2.5rem', height: '2.5rem', borderRadius: "12%", marginRight: '1rem' }} />
            <fieldset>
              <label htmlFor="name">Name <small style={{ opacity: 0.6 }}>(max 15 characters)</small></label>
              <input required maxLength={15} style={{ width: '9rem' }} type="text" id="name" name="name" defaultValue={player?.name ?? userStatus!.username.substring(0, 14)} />
            </fieldset>
            <fieldset>
              <label htmlFor="in">I'm playing {player && player.status >= 0 && <small style={{ opacity: 0.6 }}>(untick to withdraw)</small>}</label>
              <input style={{ width: '3rem', transform: 'scale(1.8)' }} type="checkbox" id="in" name="in" defaultChecked={(player?.status ?? 0) >= 0} />
            </fieldset>
          </div>
          <fieldset>
            <label htmlFor="stream">Live stream / VOD <small style={{ opacity: 0.6 }}>(please use a direct link)</small></label>
            <input required style={{ width: '95%' }} type="text" id="stream" name="stream" defaultValue={player?.stream ?? "N/A"} />
          </fieldset>
          <div className="options">
            { userStatus && userStatus.youtube && (
              <fieldset>
                <input style={{ width: '3rem' }} type="checkbox" id="youtube" name="youtube" defaultChecked={true} />
                <label htmlFor="youtube">Show <ChannelLink url={userStatus.youtube} /></label>
              </fieldset>
            )}
            { userStatus && userStatus.twitch && (
              <fieldset>
                <input style={{ width: '3rem' }} type="checkbox" id="twitch" name="twitch" defaultChecked={true} />
                <label htmlFor="twitch">Show <ChannelLink url={userStatus.twitch} /></label>
              </fieldset>
            )}
            <fieldset>
              <input style={{ width: '3rem' }} type="checkbox" id="best" name="best" defaultChecked={player?.logs.some(x => x.code.startsWith("PersonalBest"))} />
              <label htmlFor="best">Show Personal Best <small style={{ opacity: 0.6 }}>(must have scoring history)</small></label>
            </fieldset>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="link" style={{ width: "8rem", marginRight: "2rem" }} type="button" onClick={() => { mutation.reset(); setShowForm(false); }}>Close</button><button type="submit">Save</button>
          </div>
        </form>)}
    </div>
  );
}