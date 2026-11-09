import { useEffect, useState } from "react";

/** The browser's current time in ms; the web app has no injected Clock, the server does. */
function browserNow(): number {
  // oxlint-disable-next-line interview-sensei/no-current-time -- the session timer counts against the browser's own clock
  return Date.now();
}

/** The current time in ms, updated each second while the component is shown. */
export function useNow(): number {
  const [now, setNow] = useState(browserNow);
  useEffect(() => {
    const ticks = setInterval(() => {
      setNow(browserNow());
    }, 1000);
    return () => {
      clearInterval(ticks);
    };
  }, []);
  return now;
}
