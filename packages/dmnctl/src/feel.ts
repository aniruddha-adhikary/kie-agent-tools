import { CharStream, CommonTokenStream, ErrorListener } from "antlr4";
import FEEL_1_1Lexer from "@kie-tools/dmn-feel-antlr4-parser/dist/parser/grammar/generated-parser/FEEL_1_1Lexer.js";
import FEEL_1_1Parser from "@kie-tools/dmn-feel-antlr4-parser/dist/parser/grammar/generated-parser/FEEL_1_1Parser.js";
import type { DMN16__tDecision } from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_6/ts-gen/types.js";
import { type Definitions, drgElements } from "./model.js";

export interface FeelError {
  line: number;
  column: number;
  message: string;
}

export interface FeelIssue extends FeelError {
  where: string;
  expression: string;
}

class CollectingErrorListener extends ErrorListener<unknown> {
  readonly errors: FeelError[] = [];
  override syntaxError(
    _recognizer: unknown,
    _offendingSymbol: unknown,
    line: number,
    column: number,
    msg: string
  ): void {
    this.errors.push({ line, column, message: msg });
  }
}

export function parseFeel(
  text: string,
  opts: { unaryTests?: boolean; variables?: readonly string[] } = {}
): FeelError[] {
  const listener = new CollectingErrorListener();
  const lexer = new FEEL_1_1Lexer(new CharStream(text));
  lexer.removeErrorListeners();
  lexer.addErrorListener(listener);
  const parser = new FEEL_1_1Parser(new CommonTokenStream(lexer));
  parser.removeErrorListeners();
  parser.addErrorListener(listener);
  for (const name of opts.variables ?? []) {
    parser.helper.defineVariable(name);
  }
  if (opts.unaryTests) parser.unaryTestsRoot();
  else parser.compilation_unit();
  return listener.errors;
}

export function lintModelFeel(definitions: Definitions): FeelIssue[] {
  const issues: FeelIssue[] = [];
  const variables = drgElements(definitions)
    .map((el) => el["@_name"])
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  function check(where: string, text: string | undefined, opts?: { unaryTests?: boolean }): void {
    if (text === undefined || text.trim() === "") return;
    for (const err of parseFeel(text, { ...opts, variables })) {
      issues.push({ where, expression: text, ...err });
    }
  }

  function checkExpression(owner: string, expr: DMN16__tDecision["expression"]): void {
    if (!expr) return;
    if (expr.__$$element === "literalExpression") {
      check(`${owner} literal expression`, expr.text?.__$$text);
    } else if (expr.__$$element === "decisionTable") {
      (expr.input ?? []).forEach((inp, i) =>
        check(`${owner} decision table input ${i + 1}`, inp.inputExpression?.text?.__$$text)
      );
      (expr.rule ?? []).forEach((rule, r) => {
        (rule.inputEntry ?? []).forEach((e, i) =>
          check(`${owner} rule ${r + 1} when[${i + 1}]`, e.text?.__$$text, { unaryTests: true })
        );
        (rule.outputEntry ?? []).forEach((e, i) =>
          check(`${owner} rule ${r + 1} then[${i + 1}]`, e.text?.__$$text)
        );
      });
    } else if (expr.__$$element === "context") {
      (expr.contextEntry ?? []).forEach((entry) => checkExpression(owner, entry.expression));
    }
  }

  for (const el of drgElements(definitions)) {
    const owner = `${el.__$$element} "${el["@_name"]}"`;
    if (el.__$$element === "decision") checkExpression(owner, el.expression);
    if (el.__$$element === "businessKnowledgeModel" && el.encapsulatedLogic) {
      checkExpression(owner, el.encapsulatedLogic.expression);
    }
  }
  return issues;
}
