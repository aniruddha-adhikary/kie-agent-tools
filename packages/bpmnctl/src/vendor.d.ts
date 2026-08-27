declare module 'bpmn-moddle' {
  export const BpmnModdle: new () => import('./types.js').BpmnModdleApi;
}

declare module 'bpmn-auto-layout' {
  export function layoutProcess(xml: string): Promise<string>;
}
