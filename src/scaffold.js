export function scaffoldXml({ id, name, packageName }) {
  const processId = id;
  const processName = name || id;
  const pkg = packageName || 'com.example';
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   xmlns:drools="http://www.jboss.org/drools"
                   id="_${processId}_definitions"
                   exporter="bpmnctl"
                   exporterVersion="0.1.0"
                   targetNamespace="http://www.omg.org/bpmn20">
  <bpmn2:process id="${processId}" drools:packageName="${pkg}" drools:version="1.0" drools:adHoc="false" name="${processName}" isExecutable="true" processType="Public">
    <bpmn2:extensionElements/>
    <bpmn2:startEvent id="start" name="Start">
      <bpmn2:outgoing>flow_start_end</bpmn2:outgoing>
    </bpmn2:startEvent>
    <bpmn2:endEvent id="end" name="End">
      <bpmn2:incoming>flow_start_end</bpmn2:incoming>
    </bpmn2:endEvent>
    <bpmn2:sequenceFlow id="flow_start_end" sourceRef="start" targetRef="end"/>
  </bpmn2:process>
</bpmn2:definitions>
`;
}
