import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getLanguage, resetSession, setLanguage, type Lang } from "./api.ts";

export interface NeedsDraft {
  businessType?: string;
  segment: "micro" | "prof" | "multi" | "mfg";
  employees: number;
  sites: number;
  priority: "lowest_price" | "reliability";
  wants: Record<string, boolean | number>;
}

export interface Journey {
  step: number;
  gstin?: string;
  udyam?: string;
  registry?: any;
  udyamRecord?: any;
  profile?: any;
  needs?: NeedsDraft;
  rec?: any;
  bundle?: Record<string, number>;
  quote?: any;
  quoteId?: string;
  kyc?: any;
  order?: any;
}

const KEY = "udyam.journey";
const initial: Journey = { step: 0 };

const Ctx = createContext<{ j: Journey; set: (p: Partial<Journey>) => void; reset: () => void; lang: Lang; setLang: (l: Lang) => void } | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [j, setJ] = useState<Journey>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "") as Journey; } catch { return initial; }
  });
  const [lang, setLangState] = useState<Lang>(getLanguage());
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(j)); }, [j]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    // The server no longer knows this session (e.g. it was reset): start again rather than failing silently.
    const lost = () => setJ(initial);
    addEventListener("udyam:session-lost", lost);
    return () => removeEventListener("udyam:session-lost", lost);
  }, []);
  return (
    <Ctx.Provider
      value={{
        j,
        set: (p) => setJ((prev) => ({ ...prev, ...p })),
        reset: () => { resetSession(); setJ(initial); },
        lang,
        setLang: (l) => { setLanguage(l); setLangState(l); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useJourney() {
  const c = useContext(Ctx);
  if (!c) throw new Error("JourneyProvider missing");
  return c;
}
