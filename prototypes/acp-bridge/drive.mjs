// PROTOTYPE: headless stand-in for the browser tab. Usage: node drive.mjs <port> "<prompt>" [--fork]
const [port, text, flag] = process.argv.slice(2);
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const counts = {};
let sent = false;
const send = (o) => ws.send(JSON.stringify(o));
ws.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  const k = ev.type === "update" ? `update:${ev.update.sessionUpdate}` : ev.type;
  counts[k] = (counts[k] ?? 0) + 1;
  if (ev.type !== "update" || !/chunk/.test(ev.update.sessionUpdate)) console.log("WS", k, JSON.stringify(ev).slice(0, 400));
  if ((ev.type === "hello" && ev.sessionId) || ev.type === "session") { if (!sent) { sent = true; send({ type: "prompt", text }); } }
  if (ev.type === "permission") { console.log("WS permission forwarded to browser; answering first allow"); send({ type: "permission", id: ev.id, optionId: ev.options.find(o => o.kind?.startsWith("allow"))?.optionId }); }
  if (ev.type === "stop" || (ev.type === "error" && ev.where === "prompt")) {
    if (flag === "--fork") { send({ type: "fork" }); } else { console.log("COUNTS", counts); process.exit(0); }
  }
  if (ev.type === "fork") { console.log("COUNTS", counts); process.exit(0); }
};
setTimeout(() => { console.log("TIMEOUT COUNTS", counts); process.exit(1); }, 240000);
