export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  rule: string;
  file: string;
  message: string;
}

export interface BpmnRuleTask {
  id: string;
  name?: string;
  ruleFlowGroup?: string;
  dmnFileName?: string;
  dmnNamespace?: string;
  dmnModelName?: string;
}

export interface BpmnCallActivity {
  id: string;
  name?: string;
  calledElement?: string;
}

export interface BpmnAsset {
  file: string;
  processIds: string[];
  ruleTasks: BpmnRuleTask[];
  callActivities: BpmnCallActivity[];
  parseError?: string;
}

export interface DmnAsset {
  file: string;
  name?: string;
  namespace?: string;
  imports: { namespace?: string; importType?: string }[];
  parseError?: string;
}

export interface DrlAsset {
  file: string;
  packageName?: string;
  ruleFlowGroups: string[];
  agendaGroups: string[];
}

export interface ScesimAsset {
  file: string;
  type?: string;
  dmnFilePath?: string;
  dmnNamespace?: string;
  dmnName?: string;
  parseError?: string;
}

export interface ProjectIndex {
  root: string;
  bpmn: BpmnAsset[];
  dmn: DmnAsset[];
  drl: DrlAsset[];
  scesim: ScesimAsset[];
}
