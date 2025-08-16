import React, { useEffect } from "react";
import { useNavigate } from "react-router";

interface EventRedirectProps {
    mode: string;
}

const EventRedirect: React.FC<EventRedirectProps> = (props) => {
    const navigate = useNavigate();
    const { mode } = props;

    if (!mode) return <div>Invalid event mode</div>;
    
    useEffect(() => {
        fetch(`/api/events/current?mode=${mode}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("Failed to fetch event");
                const data = await res.json();
                // Assuming the event page is at /events/{eventId}
                if (data && data.id) {
                    navigate(`/events/${data.id}`, { replace: true });
                } else {
                    // Handle missing event id
                    navigate("/events/all", { replace: true });
                }
            })
            .catch(() => {
                navigate("/events/all", { replace: true });
            });
    }, [mode, navigate]);

    return <div>Redirecting to current event...</div>;
};

export default EventRedirect;