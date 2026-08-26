import fs from "node:fs";
import "@kie-tools/xml-parser-ts/dist/node/index.js";
import { getMarshaller, type SceSimMarshaller, type SceSimModel } from "@kie-tools/scesim-marshaller";
import type {
  SceSim__FactMappingType,
  SceSim__FactMappingValuesTypes,
  SceSim__ScenarioSimulationModelType,
} from "@kie-tools/scesim-marshaller/dist/schemas/scesim-1_8/ts-gen/types.js";

export type ScesimModel = SceSim__ScenarioSimulationModelType;
export type FactMapping = SceSim__FactMappingType;
export type Scenario = SceSim__FactMappingValuesTypes;

export interface LoadedModel {
  marshaller: SceSimMarshaller;
  json: SceSimModel;
  model: ScesimModel;
}

export function loadModel(file: string): LoadedModel {
  const xml = fs.readFileSync(file, "utf8");
  const marshaller = getMarshaller(xml);
  const json = marshaller.parser.parse();
  return { marshaller, json, model: json.ScenarioSimulationModel };
}

export function saveModel(file: string, loaded: LoadedModel): void {
  fs.writeFileSync(file, loaded.marshaller.builder.build(loaded.json));
}

export function factMappings(model: ScesimModel): FactMapping[] {
  return (model.simulation.scesimModelDescriptor.factMappings.FactMapping ??= []);
}

export function scenarios(model: ScesimModel): Scenario[] {
  return (model.simulation.scesimData.Scenario ??= []);
}

/** User-facing column name: full expression path (e.g. "Applicant.Age") or the fact alias. */
export function columnName(fm: FactMapping): string {
  const steps = fm.expressionElements?.ExpressionElement?.map((e) => e.step.__$$text) ?? [];
  return steps.length > 0 ? steps.join(".") : fm.factAlias.__$$text;
}

export function isDataColumn(fm: FactMapping): boolean {
  const kind = fm.expressionIdentifier.type?.__$$text;
  return kind === "GIVEN" || kind === "EXPECT";
}

export function findColumn(model: ScesimModel, name: string): FactMapping {
  const cols = factMappings(model);
  const found = cols.find((fm) => isDataColumn(fm) && columnName(fm) === name);
  if (!found) {
    const known = cols.filter(isDataColumn).map(columnName).join(", ");
    throw new Error(`no column named "${name}". Known columns: ${known || "none"}`);
  }
  return found;
}
