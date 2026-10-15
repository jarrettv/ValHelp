import React, { createContext, useContext, PropsWithChildren, useMemo } from "react";
import { Mat } from "../domain/materials";
import { EXTRA_ITEMS, iconUrl, useVhItems } from "../guides/vh/data";

type MatsContextValue = {
    mats: Mat[];
};

const MatsContext = createContext<MatsContextValue | undefined>(undefined);

export const MatsProvider: React.FC<PropsWithChildren<{}>> = ({ children }) => {
    const { data } = useVhItems();

    const mats = useMemo<Mat[]>(() => {
        if (!data) return [];
        return [...data, ...EXTRA_ITEMS]
            .filter(i => i.name && !i.hidden)
            .map(i => ({ code: i.code, name: i.name!, image: iconUrl(i.code) }));
    }, [data]);

    return <MatsContext.Provider value={{ mats }}>{children}</MatsContext.Provider>;
};

export function useMats(): MatsContextValue {
    const ctx = useContext(MatsContext);
    if (!ctx) throw new Error("useMats must be used within a MatsProvider");
    return ctx;
}
