import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import "./index.css";
import { AgentSteps } from "@/components/snap-cn/agent-steps";
import { PunchLines } from "@/components/snap-cn/punch-lines";
import { TerminalSimulator } from "@/components/snap-cn/terminal-simulator";
import { TypeMorph } from "@/components/snap-cn/type-morph";
import { WordmarkCut } from "@/components/snap-cn/wordmark-cut";
import type { SnapCnTheme } from "@/lib/snap-cn-ui/theme";
import { Wipe } from "./parts";
import { Bank } from "./scenes/Bank";
import { Intro } from "./scenes/Intro";
import { Invoice } from "./scenes/Invoice";
import { Outro } from "./scenes/Outro";
import { BAR, BEAT, C, MONO, ramp, SERIF } from "./theme";

// 1280×720, snapcn's canvas. Cuts sit on bar lines of the 120 BPM track (1 bar = 60 frames).
export const DURATION = 25 * BAR;

// freebies' palette as snapcn tokens: cream paper, cobalt ink, EB Garamond.
const paper: Partial<SnapCnTheme> = {
  background: C.paper, foreground: C.ink, card: C.lift, cardForeground: C.ink, popover: C.lift, popoverForeground: C.ink,
  primary: C.ink, primaryForeground: C.paper, secondary: "#E9DFC9", secondaryForeground: C.ink, muted: "#ECE2CD",
  mutedForeground: "#5B6F98", accent: "#E9DFC9", accentForeground: C.ink, border: "#D9CDB4", input: "#D9CDB4", ring: C.ink, fontFamily: SERIF,
};
const cobalt: Partial<SnapCnTheme> = {
  background: C.ink, foreground: C.paper, card: C.deep, cardForeground: C.paper, primary: C.paper, primaryForeground: C.ink,
  muted: "#123F8E", mutedForeground: "#B8C6E2", border: "#2A55A0", input: "#2A55A0", ring: C.paper, fontFamily: SERIF,
};

// The hand-built brand scenes are laid out at 1920×1080; scale them onto the canvas.
const Hd = ({ children }: { children: ReactNode }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <div style={{ width: 1920, height: 1080, flexShrink: 0, transform: "scale(0.6667)", transformOrigin: "0 0", position: "relative" }}>{children}</div>
  </AbsoluteFill>
);

export function Demo() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Audio src={staticFile("music.wav")} volume={(x) => ramp(x, DURATION - 30, DURATION, 1, 0)} />

      <Sequence durationInFrames={4 * BAR}><Hd><Intro /></Hd></Sequence>

      {/* Hook: one card per beat, the price lands on the bar */}
      <Sequence from={4 * BAR} durationInFrames={2 * BAR}>
        <PunchLines
          script="No subscription. | No cloud. | No account. | 0 € a month."
          styles="slide,slide,slide,punch" sizes="1,1,1,1.5" holds={`${BEAT},${BEAT},${2 * BEAT},${4 * BEAT}`}
          theme={paper} ground={C.paper} ink={C.ink} fontFamily={SERIF} fontWeight={500} accentBeat={0}
        />
      </Sequence>

      {/* Install: the one-liner, then onboarding */}
      <Sequence from={6 * BAR} durationInFrames={3 * BAR}>
        <TerminalSimulator
          mode="dark" theme={cobalt} background={C.deep} borderColor="#2A55A0" fontFamily={MONO} speed={200 / 180}
          intro="Bookkeeping, *one command* away."
          command={{ managers: ["curl"], text: "curl -fsSL …/freebies/install.sh | sh" }}
          lines={[
            { text: "freebies", type: "command" },
            { text: "Welcome. Let's set up your business.", type: "log" },
            { text: "✓ Details saved", type: "success" },
            { text: "✓ Ready: run freebies app", type: "success" },
          ]}
        />
      </Sequence>

      {/* The agent at work */}
      <Sequence from={9 * BAR} durationInFrames={3 * BAR}>
        {/* The scene sets its type at 2.5% of frame height; zoom it so it reads on a phone. */}
        <AbsoluteFill style={{ background: C.paper, transform: "scale(1.7)" }}>
        <AgentSteps
          theme={paper} mode="light" paperColor={C.paper} accentColor={C.ink} glowRadius={0}
          query="Invoice Nordlicht GmbH for 32 hours of design at 95 € an hour"
          steps={[
            { running: "Looking up Nordlicht GmbH…", done: "Found Nordlicht GmbH in your customers" },
            { running: "Checking your VAT setup…", done: "19 % VAT applies" },
            { running: "Drafting the invoice…", done: "Drafted 2026-0007, 3.617,60 €" },
            { running: "Waiting for your confirmation…", done: "" },
          ]}
          result="Invoice 2026-0007 is ready. Confirm to save."
          queryHold={0.7} stepHold={0.8} finalHold={0.6}
        />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={12 * BAR} durationInFrames={3 * BAR}><Hd><Invoice /></Hd></Sequence>
      <Sequence from={15 * BAR} durationInFrames={3 * BAR}><Hd><Bank /></Hd></Sequence>

      {/* Local-first, as one line that changes its mind */}
      <Sequence from={18 * BAR} durationInFrames={2 * BAR}>
        <TypeMorph lead="Your books live " emphasis="in their cloud." morphTo="on your disk." finally_="on your disk." theme={paper} background={C.paper} ink={C.ink} fontFamily={SERIF} />
      </Sequence>

      <Sequence from={20 * BAR} durationInFrames={5 * BAR}><Hd><Outro /></Hd></Sequence>
      {/* Final hit at bar 23: the wordmark */}
      <Sequence from={23 * BAR} durationInFrames={66}>
        <WordmarkCut word="freebies" mode="dark" theme={cobalt} dotFrom={C.paper} dotTo="#9DB7E8" fontFamily={SERIF} />
      </Sequence>

      <Wipe at={6 * BAR} color={C.ink} />
      <Wipe at={12 * BAR} color={C.ink} />
      <Wipe at={15 * BAR} color={C.paper} dir={-1} />
      <AbsoluteFill style={{ background: C.paper, opacity: ramp(f, 20 * BAR - 4, 20 * BAR) * (1 - ramp(f, 20 * BAR, 20 * BAR + 14)), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}
