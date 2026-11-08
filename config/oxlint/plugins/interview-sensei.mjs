// Project rules that oxlint has no built-in equivalent for. Oxlint loads this file as an ESLint-compatible JS plugin.

const DISABLE_DIRECTIVE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?<rest>\s[\s\S]*)?$/u;

/** A rule may be disabled in code only with a reason: `// oxlint-disable-next-line rule -- why`. */
const requireDisableReason = {
  meta: {
    type: "suggestion",
    docs: { description: "Require a reason after `--` in every disable directive." },
    messages: {
      missingReason:
        "Explain why the rule does not apply here: add ` -- <reason>` after the rule names, " +
        "for example `// oxlint-disable-next-line eslint/no-await-in-loop -- steps must run in order`. " +
        "If the rule should not apply anywhere, change the shared config in config/oxlint instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = DISABLE_DIRECTIVE.exec(comment.value);
          if (match === null) {
            continue;
          }
          const reason = match.groups?.rest?.split(" -- ")[1]?.trim() ?? "";
          if (reason === "") {
            context.report({ loc: comment.loc, messageId: "missingReason" });
          }
        }
      },
    };
  },
};

const PLAYWRIGHT_MODIFIERS = new Set(["only", "skip", "fixme"]);

/**
 * Playwright tests must not be focused or switched off. The vitest rules miss these calls
 * because `test` comes from @playwright/test.
 */
const noPlaywrightTestModifiers = {
  meta: {
    type: "problem",
    docs: { description: "Ban `test.only`, `test.skip`, `test.fixme` and their `describe` forms." },
    messages: {
      modifier:
        "Remove `.{{name}}`: focused or switched-off tests are not allowed. Fix a failing test instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.property.type !== "Identifier" || !PLAYWRIGHT_MODIFIERS.has(node.property.name)) {
          return;
        }
        let root = node.object;
        while (root.type === "MemberExpression") {
          root = root.object;
        }
        if (root.type === "Identifier" && root.name === "test") {
          context.report({
            node: node.property,
            messageId: "modifier",
            data: { name: node.property.name },
          });
        }
      },
    };
  },
};

/**
 * Application code reads the current time from an injected clock, so tests can fix it.
 * `new Date(value)` with an argument stays allowed: it parses a value, not the current time.
 */
const noCurrentTime = {
  meta: {
    type: "problem",
    docs: { description: "Ban `new Date()` without arguments and `Date.now()`." },
    messages: {
      currentTime:
        "Read the current time from the injected Clock (packages/core/src/shared/time), " +
        "so tests can fix it. Only the system clock reads the real time.",
    },
    schema: [],
  },
  create(context) {
    return {
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Date" &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: "currentTime" });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "Date" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "now"
        ) {
          context.report({ node, messageId: "currentTime" });
        }
      },
    };
  },
};

export default {
  meta: { name: "interview-sensei" },
  rules: {
    "require-disable-reason": requireDisableReason,
    "no-playwright-test-modifiers": noPlaywrightTestModifiers,
    "no-current-time": noCurrentTime,
  },
};
