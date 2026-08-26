import fs from "node:fs";
import "@kie-tools/xml-parser-ts/dist/node/index.js";
import { getMarshaller as getDmnMarshaller } from "@kie-tools/dmn-marshaller";
import type { DMN16__tDefinitions } from "@kie-tools/dmn-marshaller/dist/schemas/dmn-1_6/ts-gen/types.js";

export interface DmnColumnSpec {
  kind: "GIVEN" | "EXPECT";
  path: string;
  type: string;
  factType: string;
}

export interface DmnModelInfo {
  name: string;
  namespace: string;
  columns: DmnColumnSpec[];
}

function componentsOf(
  definitions: DMN16__tDefinitions,
  typeRef: string | undefined
): { name: string; typeRef: string }[] | undefined {
  if (typeRef === undefined) return undefined;
  const item = (definitions.itemDefinition ?? []).find((i) => i["@_name"] === typeRef);
  const components = item?.itemComponent;
  if (!components || components.length === 0) return undefined;
  return components.map((c) => ({
    name: c["@_name"],
    typeRef: c.typeRef?.__$$text ?? "Any",
  }));
}

function columnsFor(
  definitions: DMN16__tDefinitions,
  kind: "GIVEN" | "EXPECT",
  name: string,
  typeRef: string | undefined
): DmnColumnSpec[] {
  const components = componentsOf(definitions, typeRef);
  const factType = typeRef ?? "Any";
  if (!components) return [{ kind, path: name, type: factType, factType }];
  return components.map((c) => ({
    kind,
    path: `${name}.${c.name}`,
    type: c.typeRef,
    factType,
  }));
}

export function readDmnModel(file: string): DmnModelInfo {
  const xml = fs.readFileSync(file, "utf8");
  const marshaller = getDmnMarshaller(xml, { upgradeTo: "latest" });
  const definitions = marshaller.parser.parse().definitions;
  const columns: DmnColumnSpec[] = [];
  for (const element of definitions.drgElement ?? []) {
    if (element.__$$element === "inputData") {
      columns.push(...columnsFor(definitions, "GIVEN", element["@_name"], element.variable?.["@_typeRef"]));
    }
  }
  for (const element of definitions.drgElement ?? []) {
    if (element.__$$element === "decision") {
      columns.push(...columnsFor(definitions, "EXPECT", element["@_name"], element.variable?.["@_typeRef"]));
    }
  }
  return {
    name: definitions["@_name"],
    namespace: definitions["@_namespace"],
    columns,
  };
}
