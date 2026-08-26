import { getMarshaller } from "@kie-tools/scesim-marshaller";
import type {
  SceSim__FactMappingType,
  SceSim__settingsType,
} from "@kie-tools/scesim-marshaller/dist/schemas/scesim-1_8/ts-gen/types.js";
import type { LoadedModel } from "./model.js";

export interface DmnScaffoldOpts {
  kind: "DMN";
  dmnFilePath: string;
  dmnNamespace: string;
  dmnName: string;
}

export interface RuleScaffoldOpts {
  kind: "RULE";
  dmoSession?: string;
  ruleFlowGroup?: string;
}

export type ScaffoldOpts = DmnScaffoldOpts | RuleScaffoldOpts;

const SEED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ScenarioSimulationModel xmlns="https://kie.org/scesim/1.8" version="1.8"/>\n`;

function settings(opts: ScaffoldOpts): SceSim__settingsType {
  if (opts.kind === "DMN") {
    return {
      type: { __$$text: "DMN" },
      dmnFilePath: { __$$text: opts.dmnFilePath },
      dmnNamespace: { __$$text: opts.dmnNamespace },
      dmnName: { __$$text: opts.dmnName },
      skipFromBuild: { __$$text: false },
    };
  }
  return {
    type: { __$$text: "RULE" },
    ...(opts.dmoSession !== undefined ? { dmoSession: { __$$text: opts.dmoSession } } : {}),
    ...(opts.ruleFlowGroup !== undefined ? { ruleFlowGroup: { __$$text: opts.ruleFlowGroup } } : {}),
    skipFromBuild: { __$$text: false },
    stateless: { __$$text: false },
  };
}

function serviceColumns(): SceSim__FactMappingType[] {
  return [
    {
      expressionElements: {},
      expressionIdentifier: { name: { __$$text: "Index" }, type: { __$$text: "OTHER" } },
      factIdentifier: { name: { __$$text: "#" }, className: { __$$text: "java.lang.Integer" } },
      className: { __$$text: "java.lang.Integer" },
      factAlias: { __$$text: "#" },
      columnWidth: { __$$text: 70 },
    },
    {
      expressionElements: {},
      expressionIdentifier: { name: { __$$text: "Description" }, type: { __$$text: "OTHER" } },
      factIdentifier: { name: { __$$text: "Scenario description" }, className: { __$$text: "java.lang.String" } },
      className: { __$$text: "java.lang.String" },
      factAlias: { __$$text: "Scenario description" },
      columnWidth: { __$$text: 300 },
    },
  ];
}

export function newModel(opts: ScaffoldOpts): LoadedModel {
  const marshaller = getMarshaller(SEED_XML);
  const json = marshaller.parser.parse();
  const model = json.ScenarioSimulationModel;
  model["@_version"] = "1.8";
  model.simulation = {
    scesimModelDescriptor: { factMappings: { FactMapping: serviceColumns() } },
    scesimData: { Scenario: [] },
  };
  model.background = {
    scesimModelDescriptor: { factMappings: { FactMapping: [] } },
    scesimData: { BackgroundData: [{ factMappingValues: { FactMappingValue: [] } }] },
  };
  model.settings = settings(opts);
  model.imports = { imports: {} };
  return { marshaller, json, model };
}
