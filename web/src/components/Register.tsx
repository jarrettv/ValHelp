import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Player } from "../domain/event";
import { FormEvent, useState } from "react";
interface RegisterProps {
  eventId: number;
  player?: Player;
}
export default function Register({ eventId, player }: RegisterProps) {
  const { status: userStatus } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

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
        throw new Error(problem.detail);
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

  return (
    <div className="card" style={{ marginTop: ".8rem" }}>
      {!showForm && player && player.status < 0 && (<div style={{ display: 'flex', justifyContent: 'space-between' }}><div>You are no longer a registered player</div><button className="link" onClick={() => setShowForm(true)}>Edit</button></div>)}
      {!showForm && player && player.status >= 0 && (<div style={{ display: 'flex', justifyContent: 'space-between' }}><div>Registered as {player!.name}, good luck</div><button className="link" onClick={() => setShowForm(true)}>Edit</button></div>)}
      {!showForm && !player && (<div style={{ display: 'flex', justifyContent: 'space-between' }}>Odin wants you to play <button className="link" onClick={() => setShowForm(true)}>Register</button></div>)}
      {showForm && (
        <form onSubmit={handleSubmit}>
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
              <label htmlFor="in">Register</label>
              <input style={{ width: '3rem' }} type="checkbox" id="in" name="in" defaultChecked={(player?.status ?? 0) >= 0} />
            </fieldset>
          </div>
          <fieldset>
            <label htmlFor="stream">Live stream / VOD <small style={{ opacity: 0.6 }}>(please use a direct link)</small></label>
            <input required style={{ width: '95%' }} type="text" id="stream" name="stream" defaultValue={player?.stream ?? "N/A"} />
          </fieldset>
          <div className="options">
            <fieldset>
              <input style={{ width: '3rem' }} type="checkbox" id="youtube" name="youtube" defaultChecked={player?.logs.some(x => x.code.startsWith("ChannelYoutube"))} />
              <label htmlFor="youtube">Show Youtube <small style={{ opacity: 0.6 }}>(must be set on profile)</small></label>
            </fieldset>
            <fieldset>
              <input style={{ width: '3rem' }} type="checkbox" id="twitch" name="twitch" defaultChecked={player?.logs.some(x => x.code.startsWith("ChannelTwitch"))} />
              <label htmlFor="twitch">Show Twitch <small style={{ opacity: 0.6 }}>(must be set on profile)</small></label>
            </fieldset>
            <fieldset>
              <input style={{ width: '3rem' }} type="checkbox" id="best" name="best" defaultChecked={player?.logs.some(x => x.code.startsWith("PersonalBest"))} />
              <label htmlFor="best">Show Personal Best <small style={{ opacity: 0.6 }}>(must have scoring history)</small></label>
            </fieldset>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="link" style={{ width: "8rem", marginRight: "2rem" }} onClick={() => setShowForm(false)}>Cancel</button><button type="submit">Save</button>
          </div>
        </form>)}
    </div>
  );
}