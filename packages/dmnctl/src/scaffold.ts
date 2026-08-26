import crypto from "node:crypto";
import "@kie-tools/xml-parser-ts/dist/node/index.js";
import { getMarshaller } from "@kie-tools/dmn-marshaller";

const SEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20240513/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20230324/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"
             xmlns:kie="https://kie.org/dmn/extensions/1.0"
             namespace="https://kie.org/dmn/seed"
             id="seed"
             name="seed"/>
`;

export function scaffoldXml(opts: { name: string }): string {
  const marshaller = getMarshaller(SEED_XML, { upgradeTo: "latest" });
  const json = marshaller.parser.parse();
  const definitions = json.definitions;
  definitions["@_id"] = `_${crypto.randomUUID().toUpperCase()}`;
  definitions["@_name"] = opts.name;
  definitions["@_namespace"] = `https://kie.org/dmn/${crypto.randomUUID().toUpperCase()}`;
  definitions["@_expressionLanguage"] = "https://www.omg.org/spec/DMN/20240513/FEEL/";
  definitions["@_typeLanguage"] = "https://www.omg.org/spec/DMN/20240513/FEEL/";
  definitions["dmndi:DMNDI"] = {
    "dmndi:DMNDiagram": [{ "@_id": `_${crypto.randomUUID().toUpperCase()}` }],
  };
  return marshaller.builder.build(json);
}
