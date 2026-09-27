// clockrun.js：按处理预算处理并留账，收尾不限预算把账处理完
import { bumpOf, mergeInto } from "./clock.js";

const NODE_KINDS = { join: true, bump: true, mark: true };
const HAS_ID = Object.prototype.hasOwnProperty;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function codeFor(spec, key, fallback) {
  return (spec && spec[key]) || fallback;
}

function byNodeName(left, right) {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

function attachId(triple, id) {
  if (id !== undefined && id !== null) {
    Object.defineProperty(triple, "id", {
      value: id, enumerable: false, configurable: true, writable: true
    });
  }
  return triple;
}

// 事件压账时的形状：[kind, node, node2]，join/bump/mark 的第三段是 null。
// id 以不可枚举属性携带：对外 JSON 仍是纯三元组，跨轮也能认出已处理事件。
function toTriple(event) {
  const triple = event.kind === "sync"
    ? ["sync", event.from, event.to]
    : [event.kind, event.node, null];
  return attachId(triple, event.id);
}

function copyTriple(triple) {
  return attachId(triple.slice(), HAS_ID.call(triple, "id") ? triple.id : undefined);
}

// 与预算无关的结构校验：事件形状、节名空、sync 两端相同。
function prevalidate(spec, events) {
  const badEvent = codeFor(spec, "event_error_code", "E_BAD_EVENT");
  const badNode = codeFor(spec, "bad_node_code", "E_BAD_NODE");
  const sameNode = codeFor(spec, "same_code", "E_SAME_NODE");
  const isObject = function (value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  };
  for (const event of events || []) {
    if (!isObject(event) || !HAS_ID.call(event, "kind")) {
      fail(badEvent);
    }
    const kind = event.kind;
    if (NODE_KINDS[kind]) {
      if (typeof event.node !== "string") fail(badEvent);
      if (event.node === "") fail(badNode);
    } else if (kind === "sync") {
      if (typeof event.from !== "string" || typeof event.to !== "string") fail(badEvent);
      if (event.from === "" || event.to === "") fail(badNode);
      if (event.from === event.to) fail(sameNode);
    } else {
      fail(badEvent);
    }
  }
}

function cloneClocks(clocks) {
  return (clocks || []).map(function (row) {
    return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
  }).sort(byNodeName);
}

function cloneMarks(marks) {
  return (marks || []).map(function (row) {
    return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
  });
}

function cloneState(state) {
  return {
    clocks: cloneClocks((state || {}).clocks),
    marks: cloneMarks((state || {}).marks),
    ledger: ((state || {}).ledger || []).map(copyTriple),
    applied: ((state || {}).applied || []).slice()
  };
}

function clockIndexOf(clocks, node) {
  for (let i = 0; i < clocks.length; i += 1) {
    if (clocks[i][0] === node) return i;
  }
  return -1;
}

function snapshotOf(entries) {
  return entries.map(function (cell) { return [cell[0], cell[1]]; });
}

function run(state, jobs, limit, spec) {
  const noNode = codeFor(spec, "no_node_code", "E_NO_NODE");
  const dupNode = codeFor(spec, "dup_node_code", "E_DUP_NODE");
  const clocks = state.clocks;
  const marks = state.marks;
  const applied = state.applied;
  let served = 0;
  let remaining = limit;
  for (const job of jobs) {
    const triple = job.triple;
    const kind = triple[0];
    const left = triple[1];
    const right = triple[2];
    const id = HAS_ID.call(triple, "id") ? triple.id : undefined;
    if (id !== undefined && applied.indexOf(id) !== -1) {
      continue;
    }
    if (remaining <= 0) {
      state.ledger.push(triple);
      continue;
    }
    if (kind === "join") {
      if (clockIndexOf(clocks, left) !== -1) fail(dupNode);
      clocks.push([left, []]);
      clocks.sort(byNodeName);
    } else if (kind === "bump") {
      const at = clockIndexOf(clocks, left);
      if (at === -1) fail(noNode);
      clocks[at][1] = bumpOf(clocks[at][1], left);
    } else if (kind === "sync") {
      const fromAt = clockIndexOf(clocks, left);
      const toAt = clockIndexOf(clocks, right);
      if (fromAt === -1 || toAt === -1) fail(noNode);
      clocks[toAt][1] = mergeInto(clocks[toAt][1], clocks[fromAt][1]);
    } else if (kind === "mark") {
      const at = clockIndexOf(clocks, left);
      if (at === -1) fail(noNode);
      marks.push([left, snapshotOf(clocks[at][1])]);
    } else {
      fail(codeFor(spec, "event_error_code", "E_BAD_EVENT"));
    }
    if (id !== undefined) applied.push(id);
    served += 1;
    remaining -= 1;
  }
  return served;
}

// 旧账先处理，本轮新事件排在后面（FIFO），保证分轮与整轮收尾态一致。
function buildJobs(state, events) {
  const jobs = state.ledger.map(function (triple) {
    return { triple: triple };
  });
  for (const event of events || []) {
    jobs.push({ triple: toTriple(event) });
  }
  state.ledger = [];
  return jobs;
}

export function step(spec) {
  prevalidate(spec, spec.events);

  const state = cloneState(spec.state || {});
  const events = spec.events || [];
  const incomingLedger = state.ledger.length;
  const jobs = buildJobs(state, events);

  let budget = Number(spec.budget);
  if (!Number.isFinite(budget)) budget = jobs.length;
  budget = Math.max(0, Math.floor(budget));

  const served = run(state, jobs, budget, spec);

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (triple) { return triple.slice(); }),
    judged: served,
    judged_bound: events.length + incomingLedger
  };
}

export function close(spec) {
  const state = cloneState(spec.state || {});
  prevalidate(spec, spec.events);
  const jobs = buildJobs(state, spec.events || []);
  const catchup = run(state, jobs, jobs.length, spec);
  return { state: state, catchup: catchup };
}
