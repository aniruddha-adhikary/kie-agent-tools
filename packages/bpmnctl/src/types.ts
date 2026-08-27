export interface ModdlePropertyDescriptor {
  type?: string;
}

export interface ModdleDescriptor {
  propertiesByName: Record<string, ModdlePropertyDescriptor | undefined>;
}

export interface BpmnElement {
  readonly $type: string;
  id: string;
  name?: string;
  readonly $attrs: Record<string, string>;
  $parent?: BpmnElement;
  readonly $descriptor: ModdleDescriptor;
  set(name: string, value: unknown): void;
  get(name: string): unknown;
}

export interface ExtensionElement {
  readonly $type: string;
  name?: string;
  $attrs?: Record<string, string>;
  $body?: string;
  $children?: ExtensionElement[];
  $parent?: BpmnElement | ExtensionElement;
}

export interface ExtensionElements extends BpmnElement {
  values?: ExtensionElement[];
}

export interface FormalExpression extends BpmnElement {
  body?: string;
  language?: string;
}

export interface FlowElement extends BpmnElement {
  flowElements?: FlowElement[];
  incoming?: SequenceFlow[];
  outgoing?: SequenceFlow[];
  eventDefinitions?: BpmnElement[];
  extensionElements?: ExtensionElements;
  default?: SequenceFlow;
  script?: string;
  scriptFormat?: string;
}

export interface SequenceFlow extends FlowElement {
  sourceRef?: FlowElement;
  targetRef?: FlowElement;
  conditionExpression?: FormalExpression;
}

export interface BpmnProcess extends FlowElement {
  isExecutable?: boolean;
}

export interface DiBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiWaypoint {
  x: number;
  y: number;
}

export interface DiPlaneElement extends BpmnElement {
  bounds?: DiBounds;
  waypoint?: DiWaypoint[];
  bpmnElement?: FlowElement;
}

export interface DiPlane extends BpmnElement {
  planeElement?: DiPlaneElement[];
}

export interface BpmnDiagram extends BpmnElement {
  plane?: DiPlane;
}

export interface BpmnDefinitions extends BpmnElement {
  rootElements: BpmnElement[];
  diagrams?: BpmnDiagram[];
}

export interface ParseWarning {
  message: string;
  element?: BpmnElement;
}

export interface BpmnModdleApi {
  fromXML(xml: string): Promise<{ rootElement: BpmnDefinitions; warnings: ParseWarning[] }>;
  toXML(element: BpmnElement, options?: { format?: boolean }): Promise<{ xml: string }>;
  create(type: string, properties?: Record<string, unknown>): FlowElement;
  createAny(
    name: string,
    nsUri: string,
    properties?: Record<string, unknown>
  ): ExtensionElement;
}

export interface LintReport {
  id?: string;
  message: string;
  category?: string;
}

export interface LinterInstance {
  lint(definitions: BpmnDefinitions): Promise<Record<string, LintReport[]>>;
}

export interface LinterConstructor {
  new (options: { config: { extends: string }; resolver: unknown }): LinterInstance;
}

export interface NodeResolverConstructor {
  new (options: { require: NodeJS.Require }): unknown;
}

export interface Issue {
  rule: string;
  id: string | undefined;
  message: string;
  category: string;
}
