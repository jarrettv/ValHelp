import { useMutation, useQuery } from "@tanstack/react-query";
import "./Profile.css";
import { SpinnerRoundFilled } from "spinners-react";
import { FormEvent } from "react";

export default function Profile() {
  const { isPending, error, data } = useQuery({
    queryKey: ['repoData'],
    queryFn: () =>
      fetch('/api/auth/profile').then((res) =>
        res.json()
      ),
  })

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        var problem = await response.json();
        throw new Error(problem.detail);
      }
      return response.json();
    },
    });

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const formObject = Object.fromEntries(formData.entries());
      mutation.mutate(formObject as any);
    };

  if (isPending) return <section className="loading"><SpinnerRoundFilled color="#fcce03" /></section>

  if (error) return <section className="alert error">An error has occurred: {error.message}</section>

  return (
    <section id="profile-page">
      <div className="card">
        <div className="avatar">
          <img src={data.avatarUrl} alt="Avatar" width="100%" />
        </div>
        <div className="profile">
          <h2>{data.username}</h2>
          <div style={{ opacity: 0.7 }}>{data.discordId}</div>
        </div>
        <div>
          <a id="discord" href="/api/auth/logout">
            <svg viewBox="0 0 256 199">
              <path fill="#fff" d="M216.856 16.597A208.5 208.5 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046q-29.538-4.442-58.533 0c-1.832-4.4-4.55-9.933-6.846-14.046a207.8 207.8 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161 161 0 0 0 79.735 175.3a136.4 136.4 0 0 1-21.846-10.632a109 109 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a132 132 0 0 0 5.355 4.237a136 136 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848c21.142-6.58 42.646-16.637 64.815-33.213c5.316-56.288-9.08-105.09-38.056-148.36M85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2s23.236 11.804 23.015 26.2c.02 14.375-10.148 26.18-23.015 26.18m85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2c0 14.375-10.148 26.18-23.015 26.18" />
            </svg>
            Logout
          </a>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        {mutation.isSuccess && (
          <div className="alert success" onClick={() => mutation.reset()}>✅ Profile updated</div>
        )}
        {mutation.isError && (
          <div className="alert error" onClick={() => mutation.reset()}>⛔ {mutation.error.message}</div>
        )}
        {mutation.isPending && (
          <div className="alert">Updating profile...</div>
        )}
        <fieldset>
          <label htmlFor="username">Username</label>
          <input type="text" id="username" name="username" defaultValue={data.username} />
        </fieldset>
        <fieldset>
          <label htmlFor="youtube">Youtube Channel Link</label>
          <input type="text" id="youtube" name="youtube" defaultValue={data.youtube} />
        </fieldset>
        <fieldset>
          <label htmlFor="twitch">Twitch Channel Link</label>
          <input type="text" id="twitch" name="twitch" defaultValue={data.twitch} />
        </fieldset>
        <button type="submit">Update Profile</button>
      </form>
    </section>
  )
}