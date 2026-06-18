import { useEffect, useRef, useState } from "react";

export function QuestionTimer({ questionId, seconds, onExpire }) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    expiredRef.current = false;

    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, seconds]);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs uppercase tracking-wider text-ash">Time left</span>
        <span className="font-mono text-2xl text-hour tabular-nums">{remaining}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
        <div
          key={questionId /* remount so the animation restarts cleanly per question */}
          className="timer-bar h-full rounded-full bg-hour"
          style={{ animationDuration: `${seconds}s` }}
        />
      </div>
    </div>
  );
}
