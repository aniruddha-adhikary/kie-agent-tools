import crypto from "node:crypto";

export function scaffoldXml(opts: { name: string }): string {
  const modelNs = `https://kie.org/dmn/${crypto.randomUUID().toUpperCase()}`;
  const id = `_${crypto.randomUUID().toUpperCase()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20230324/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20230324/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"
             xmlns:kie="https://kie.org/dmn/extensions/1.0"
             expressionLanguage="https://www.omg.org/spec/DMN/20230324/FEEL/"
             typeLanguage="https://www.omg.org/spec/DMN/20230324/FEEL/"
             namespace="${modelNs}"
             id="${id}"
             name="${opts.name}">
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="_${crypto.randomUUID().toUpperCase()}"/>
  </dmndi:DMNDI>
</definitions>
`;
}
