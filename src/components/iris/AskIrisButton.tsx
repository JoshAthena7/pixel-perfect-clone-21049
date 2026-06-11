/**
 * Standardized "Ask IRIS" button used in My Work, Mission Command Center,
 * and Portfolio headers. Dispatches the global open event. Reflects active
 * state when the panel is open.
 */
import { useEffect, useState } from "react";
import { IrisMark } from "@/components/iris/IrisMark";

const IRIS_BG = "rgba(127,119,221,0.12)";
const IRIS_BG_HOVER = "rgba(127,119,221,0.2)";
const IRIS_BG_ACTIVE = "rgba(127,119,221,0.25)";
const IRIS_BORDER = "rgba(127,119,221,0.3)";
const IRIS_BORDER_HOVER = "rgba(127,119,221,0.5)";
const IRIS_BORDER_ACTIVE = "rgba(127,119,221,0.6)";
const IRIS_TEXT = "rgba(200,195,255,0.9)";

export function AskIrisButton({ prefill }: { prefill?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => {
      const ce = e as CustomEvent<{ open: boolean }>;
      setOpen(!!ce.detail?.open);
    };
    window.addEventListener("atlas:iris:state", onState as EventListener);
    return () => window.removeEventListener("atlas:iris:state", onState as EventListener);
  }, []);

  const handleClick = () => {
    if (open) {
      window.dispatchEvent(new CustomEvent("atlas:iris:close"));
    } else if (prefill) {
      window.dispatchEvent(new CustomEvent("atlas:iris:prefill", { detail: prefill }));
    } else {
      window.dispatchEvent(new CustomEvent("atlas:iris:open"));
    }
  };

  const bg = open ? IRIS_BG_ACTIVE : hover ? IRIS_BG_HOVER : IRIS_BG;
  const border = open ? IRIS_BORDER_ACTIVE : hover ? IRIS_BORDER_HOVER : IRIS_BORDER;

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Ask IRIS  ( ` )"
      className="inline-flex items-center gap-1.5 rounded-md transition-colors"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        color: IRIS_TEXT,
        fontSize: 12,
        padding: "5px 12px",
      }}
    >
      <IrisMark className="h-3.5 w-3.5" />
      Ask IRIS
    </button>
  );
}
