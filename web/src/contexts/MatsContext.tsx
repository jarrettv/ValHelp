import React, { createContext, useContext, PropsWithChildren } from "react";
import { Mat } from "../domain/materials";
import { useQuery } from "@tanstack/react-query";

type MatsContextValue = {
    mats: Mat[];
};

const MatsContext = createContext<MatsContextValue | undefined>(undefined);

export const MatsProvider: React.FC<PropsWithChildren<{}>> = ({ children }) => {
    const { data } = useQuery<Mat[]>({
        queryKey: ["mats"],
        queryFn: async () => {
            const res = await fetch("/data.json");
            if (!res.ok) throw new Error(`Failed to load /data.json: ${res.status}`);
            return (await res.json()) as Mat[];
        },
        refetchOnWindowFocus: false,
    });

    const mats = data ?? [];

    return <MatsContext.Provider value={{ mats }}>{children}</MatsContext.Provider>;
};

export function useMats(): MatsContextValue {
    const ctx = useContext(MatsContext);
    if (!ctx) throw new Error("useMats must be used within a MatsProvider");
    return ctx;
}