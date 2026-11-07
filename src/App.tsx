import { useEffect, useState } from "react";
import { tr } from "./i18n.ts";
import { BackOffice } from "./screens/BackOffice.tsx";
import { Business } from "./screens/Business.tsx";
import { Documents } from "./screens/Documents.tsx";
import { Needs } from "./screens/Needs.tsx";
import { Plan } from "./screens/Plan.tsx";
import { Track } from "./screens/Track.tsx";
import { useJourney } from "./state.tsx";
import { Steps } from "./ui.tsx";

const SCREENS = [Business, Needs, Plan, Documents, Track];

export function App() {
  const { j, lang, setLang } = useJourney();
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const on = () => setRoute(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { scrollTo({ top: 0 }); }, [j.step]);

  const backOffice = route === "#/backoffice";
  const Screen = SCREENS[Math.min(j.step, SCREENS.length - 1)];

  return (
    <div className={`mx-auto px-5 pb-16 ${backOffice || j.step === 2 ? "max-w-5xl" : "max-w-xl"}`}>
      <header className="flex items-center justify-between py-5">
        <a href="#/" className="flex items-center gap-2" aria-label="Udyam Setu home">
          {/* A bridge (setu) mark: one span linking two points. */}
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden><rect width="28" height="28" rx="7" fill="#1B2A4A" /><path d="M5 19 Q14 6 23 19" stroke="#E8A317" strokeWidth="2.6" fill="none" strokeLinecap="round" /><path d="M5 19 H23" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" /></svg>
          <span className="leading-tight">
            <span className="block font-bold text-lg">{tr("brand", lang)}</span>
            <span className="block text-xs text-ink-soft">{tr("byline", lang)}</span>
          </span>
        </a>
        {!backOffice && (
          <button className="rounded-full border border-line bg-white px-3 py-1 text-sm font-semibold" onClick={() => setLang(lang === "en" ? "hi" : "en")}>{tr("switchLang", lang)}</button>
        )}
      </header>
      {backOffice ? (
        <BackOffice />
      ) : (
        <>
          <div className="mb-7"><Steps labels={tr("steps", lang)} current={j.step} /></div>
          <main><Screen /></main>
        </>
      )}
    </div>
  );
}
