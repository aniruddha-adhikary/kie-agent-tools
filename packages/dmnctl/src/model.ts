import fs from "node:fs";
import crypto from "node:crypto";
import "@kie-tools/xml-parser-ts/dist/node/index.js";
import { getMarshaller, type DmnLatestModel, type DmnMarshaller } from "@kie-tools/dmn-marshaller";
import type {
  DMN16__tDefinitions,
  DMNDI15__DMNDiagram,
} from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_6/ts-gen/types.js";

export type Definitions = DMN16__tDefinitions;
export type DrgElement = NonNullable<Definitions["drgElement"]>[number];
export type Artifact = NonNullable<Definitions["artifact"]>[number];
export type ModelElement = DrgElement | Artifact;

export interface LoadedModel {
  marshaller: DmnMarshaller<"latest">;
  json: DmnLatestModel;
  definitions: Definitions;
}

export function loadModel(file: string): LoadedModel {
  const xml = fs.readFileSync(file, "utf8");
  const marshaller = getMarshaller(xml, { upgradeTo: "latest" });
  const json = marshaller.parser.parse();
  return { marshaller, json, definitions: json.definitions };
}

export function saveModel(file: string, model: LoadedModel): void {
  fs.writeFileSync(file, model.marshaller.builder.build(model.json));
}

export function drgElements(definitions: Definitions): DrgElement[] {
  return definitions.drgElement ?? [];
}

export function artifacts(definitions: Definitions): Artifact[] {
  return definitions.artifact ?? [];
}

export function allElements(definitions: Definitions): ModelElement[] {
  return [...drgElements(definitions), ...artifacts(definitions)];
}

function nameOf(e: ModelElement): string | undefined {
  if ("@_name" in e && e["@_name"] !== undefined) return e["@_name"];
  if (e.__$$element === "textAnnotation") return e.text?.__$$text;
  return undefined;
}

export function findElement(definitions: Definitions, idOrName: string): ModelElement {
  const all = allElements(definitions);
  const found =
    all.find((e) => e["@_id"] === idOrName) ?? all.find((e) => nameOf(e) === idOrName);
  if (!found) {
    const known = all
      .map((e) => `${e["@_id"]} (${e.__$$element}${nameOf(e) ? ` "${nameOf(e)}"` : ""})`)
      .join(", ");
    throw new Error(`no element with id or name "${idOrName}". Known elements: ${known || "none"}`);
  }
  return found;
}

export function newId(): string {
  return `_${crypto.randomUUID().toUpperCase()}`;
}

export function getDiagram(definitions: Definitions): DMNDI15__DMNDiagram {
  const dmndi = (definitions["dmndi:DMNDI"] ??= {});
  const diagrams = (dmndi["dmndi:DMNDiagram"] ??= [{ "@_id": newId() }]);
  if (diagrams.length === 0) diagrams.push({ "@_id": newId() });
  const diagram = diagrams[0];
  if (!diagram) throw new Error("unreachable: diagram list is empty");
  return diagram;
}
