import type React from "react";
import { render } from "ink";
import { openDb, resolveDataDir } from "../db/index.js";
import { BusinessRepo } from "../db/repositories/business.js";
import { checkAgent } from "./agent.js";
import { Onboarding, type Finish } from "./Onboarding.js";
import { Home, type HomeAction } from "./Home.js";
import { badge, dim, reset } from "./ansi.js";

const ENTER_ALT = "\x1b[?1049h\x1b[H", LEAVE_ALT = "\x1b[?1049l";

async function show<T>(make: (done: (v: T) => void) => React.ReactElement): Promise<T | undefined> {
  let result: T | undefined;
  const app = render(make((v) => { result = v; app.unmount(); }), { exitOnCtrlC: true });
  await app.waitUntilExit();
  return result;
}

export async function runTui(opts: { mode: "auto" | "onboarding"; dataDir?: string }): Promise<void> {
  const dataDir = resolveDataDir(opts.dataDir);
  const db = openDb(dataDir);
  const onboarded = () => !!db.prepare("SELECT 1 FROM meta WHERE key='onboarded_at'").get() || !!new BusinessRepo(db).get().name;
  const animate = !process.env.CI && !process.env.FREEBIES_NO_MOTION;

  process.stdout.write(ENTER_ALT);
  let next: "app" | "quit" = "quit";
  try {
    let screen: "onboarding" | "details" | "home" = opts.mode === "onboarding" || !onboarded() ? "onboarding" : "home";
    for (;;) {
      if (screen === "home") {
        const a = await show<HomeAction>((done) => <Home db={db} dataDir={dataDir} onAction={done} animate={animate} />);
        if (a === "details") { screen = "details"; continue; }
        next = a === "app" ? "app" : "quit";
        break;
      }
      const f = await show<Finish>((done) => (
        <Onboarding db={db} dataDir={dataDir} checkAgent={checkAgent} onFinish={done} animate={animate} start={screen === "details" ? "details" : "welcome"} />
      ));
      if (f === undefined) break;
      next = f === "app" ? "app" : "quit";
      if (f === "finish" && screen === "details") { screen = "home"; continue; }
      break;
    }
  } finally {
    process.stdout.write(LEAVE_ALT);
  }

  if (next === "app") {
    const { startApp } = await import("../app.js");
    await startApp({ port: 4317, open: true, dataDir: opts.dataDir });
  } else {
    console.log(`${badge("✺ freebies")} ${dim}run ${reset}freebies app${dim} to open the app, ${reset}freebies --help${dim} for every command.${reset}`);
  }
}
