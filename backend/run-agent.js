// run-agent.js  —  node run-agent.js "Add a /health endpoint to the backend"
//
// Runtime driver for the TASE Analyzer Code Agent (Managed Agents).
// Prereqs: ANTHROPIC_API_KEY, GITHUB_TOKEN (Contents: Read PAT for TASE-ANALYZER),
// and AGENT_ID / ENV_ID from the one-time setup (see tase-code-agent.agent.yaml).
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const client = new Anthropic(); // ANTHROPIC_API_KEY from env
const AGENT_ID = process.env.AGENT_ID;
const ENV_ID = process.env.ENV_ID;
const task = process.argv[2];
if (!AGENT_ID || !ENV_ID || !task) {
  console.error("Need AGENT_ID, ENV_ID env vars and a task argument.");
  process.exit(1);
}

// sessions.create blocks until the repo is cloned — a bad GITHUB_TOKEN fails here, cheaply.
const session = await client.beta.sessions.create({
  agent: AGENT_ID, // string shorthand = latest version
  environment_id: ENV_ID,
  title: `Code change: ${task.slice(0, 60)}`,
  resources: [
    {
      type: "github_repository",
      url: "https://github.com/dteshuva/TASE-ANALYZER",
      authorization_token: process.env.GITHUB_TOKEN, // Contents: Read PAT
      mount_path: "/workspace/tase-analyzer",
      checkout: { type: "branch", name: "main" }, // older SDKs: branch: "main"
    },
  ],
});
console.log(`Watch in Console: https://platform.claude.com/workspaces/default/sessions/${session.id}`);

// Drain the stream until the session is idle-with-terminal-stop or terminated.
async function runTurn(text) {
  const stream = await client.beta.sessions.events.stream(session.id); // stream-first
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });
  for await (const event of stream) {
    if (event.type === "agent.message") {
      for (const block of event.content) if (block.type === "text") process.stdout.write(block.text);
    } else if (event.type === "session.error") {
      console.error("\n[session.error]", event);
    } else if (event.type === "session.status_terminated") {
      return "terminated";
    } else if (event.type === "session.status_idle") {
      if (event.stop_reason?.type !== "requires_action") return "idle"; // end_turn / retries_exhausted
      // requires_action fires transiently; no custom tools here, so just keep draining
    }
  }
  return "stream_ended";
}

// 1) Smoke probe — surface the Node-toolchain risk before the real task.
console.log("\n=== Smoke probe ===");
await runTurn(
  "Do NOT start the task yet. Report `node --version` and confirm the repo is present " +
    "at /workspace/tase-analyzer (list its top-level dirs). One short paragraph."
);

// 2) Real task.
console.log("\n=== Task ===");
const state = await runTurn(task);
console.log(`\n[session ${state}]`);

// 3) Download the diff + summary the agent wrote to /mnt/session/outputs (brief indexing lag).
await new Promise((r) => setTimeout(r, 2000));
const files = await client.beta.files.list({ scope_id: session.id, betas: ["managed-agents-2026-04-01"] });
for (const f of files.data) {
  const resp = await client.beta.files.download(f.id);
  fs.writeFileSync(f.filename, Buffer.from(await resp.arrayBuffer()));
  console.log(`Downloaded ${f.filename} (${f.size_bytes} bytes)`);
}
