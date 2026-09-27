// clockrun.js：按处理预算处理并留账，收尾不限预算清账
import { bumpOf, mergeInto } from "./clock.js";

const DEFAULT_CODES = {
  bad_node_code: "E_BAD_NODE",
  dup_node_code: "E_DUP_NODE",
  no_node_code: "E_NO_NODE",
  same_code: "E_SAME_NODE",
  event_error_code: "E_BAD_EVENT"
};

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function code(spec, key) {
  return spec && spec[key] ? spec[key] : DEFAULT_CODES[key];
}

const NODE_KINDS = { join: true, bump: true, mark: true };

function tripleOf(event, spec) {
  if (event.kind === "sync") {
    return ["sync", event.from, event.to];
  }
  return [event.kind, event.node, null];
}

// 与预算无关的结构校验：先全部跑一遍，有问题立刻抛错。
function validate(events, spec) {
  events.forEach(function (event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      fail(code(spec, "event_error_code"), "事件必须是对象");
    }
    const kind = event.kind;
    if (NODE_KINDS[kind]) {
      if (typeof event.node !== "string" || event.node.length === 0) {
        fail(code(spec, "bad_node_code"), "节名不能为空");
      }
    } else if (kind === "sync") {
      if (typeof event.from !== "string" || event.from.length === 0
          || typeof event.to !== "string" || event.to.length === 0) {
        fail(code(spec, "bad_node_code"), "节名不能为空");
      }
      if (event.from === event.to) {
        fail(code(spec, "same_code"), "来源与目标不能相同");
      }
    } else {
      fail(code(spec, "event_error_code"), "不认识的事件类型");
    }
  });
}

function indexOfNode(state, node) {
  return state.clocks.findIndex(function (row) { return row[0] === node; });
}

function cloneState(state) {
  return {
    clocks: state.clocks.map(function (row) {
      return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
    }),
    marks: state.marks.map(function (row) {
      return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
    }),
    ledger: state.ledger.map(function (row) { return [row[0], row[1], row[2]]; }),
    applied: state.applied.slice()
  };
}

// 按当前时钟表判定的语义校验 + 应用；只在真正花预算处理时调用。
function serve(state, triple, spec) {
  const kind = triple[0];
  if (kind === "join") {
    const node = triple[1];
    if (indexOfNode(state, node) !== -1) {
      fail(code(spec, "dup_node_code"), "节点已登记：" + node);
    }
    state.clocks.push([node, []]);
    state.clocks.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  } else if (kind === "bump") {
    const node = triple[1];
    const at = indexOfNode(state, node);
    if (at === -1) {
      fail(code(spec, "no_node_code"), "节点未登记：" + node);
    }
    state.clocks[at][1] = bumpOf(state.clocks[at][1], node);
  } else if (kind === "sync") {
    const from = triple[1];
    const to = triple[2];
    const atFrom = indexOfNode(state, from);
    const atTo = indexOfNode(state, to);
    if (atFrom === -1 || atTo === -1) {
      fail(code(spec, "no_node_code"), "合并两端都要已登记");
    }
    state.clocks[atTo][1] = mergeInto(state.clocks[atTo][1], state.clocks[atFrom][1]);
  } else if (kind === "mark") {
    const node = triple[1];
    const at = indexOfNode(state, node);
    if (at === -1) {
      fail(code(spec, "no_node_code"), "节点未登记：" + node);
    }
    state.marks.push([node, state.clocks[at][1].map(function (cell) {
      return [cell[0], cell[1]];
    })]);
  } else {
    fail(code(spec, "event_error_code"), "账上有不合法的请求");
  }
}

export function step(spec) {
  const events = spec.events || [];
  validate(events, spec);

  const state = cloneState(spec.state);
  let budget = Number(spec.budget);
  if (!Number.isFinite(budget) || budget < 0) budget = 0;
  budget = Math.floor(budget);

  // 先清旧账，再处理本轮新事件；新事件一旦进系统就进 applied，重放不会再收。
  const applied = new Set(state.applied);
  const queue = state.ledger.map(function (row) { return [row[0], row[1], row[2]]; });
  events.forEach(function (event) {
    const id = event.id;
    if (id === undefined || id === null) {
      queue.push(tripleOf(event, spec));
      return;
    }
    if (!applied.has(id)) {
      applied.add(id);
      queue.push(tripleOf(event, spec));
    }
  });

  let served = 0;
  while (served < budget && queue.length > 0) {
    serve(state, queue.shift(), spec);
    served += 1;
  }

  state.ledger = queue;
  state.applied = Array.from(applied);

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged: served,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    serve(state, state.ledger.shift(), spec);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
