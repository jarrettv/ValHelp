import { NavLink } from "react-router";
import { useAuth } from "../contexts/AuthContext";

export default function User() {
  const { status } = useAuth();

  return (
    <div id="user-nav">
      {status?.isActive ? (
        <NavLink to="/auth/profile">
          <div className="profile-link">
            <div className="avatar"><img src={status.avatarUrl} alt={status.username} /></div>
            <div style={{ flex: 1 }}>{status.username}</div>
          </div>
        </NavLink>
      ) : (
        <NavLink to="/auth/login" style={{ margin: "0.5rem 0 0 1rem" }}>Login</NavLink>
      )}
    </div>
  );
}